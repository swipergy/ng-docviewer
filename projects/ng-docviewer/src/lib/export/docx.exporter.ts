import type JSZip from 'jszip';
import { WatermarkTile, watermarkSheetPng } from '../watermark/watermark-rasterizer';
import { attr, ensureNamespaces, NS, Relationships, REL_TYPE_HEADER, REL_TYPE_IMAGE, relsPathFor, resolveTarget, updateContentTypes } from './ooxml';

const EMU_PER_TWIP = 635;
const TWIPS_PER_PX = 15;
const HEADER_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';
const REL_TYPE_SETTINGS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const A4 = { w: 11906, h: 16838 };

type HeaderType = 'default' | 'first' | 'even';
interface PageSize {
  w: number;
  h: number;
}

/**
 * Fügt das Wasserzeichen als seitenfüllendes, gesperrtes Bild in die Kopfzeilen jeder Section ein
 * (wie Words eigene Wasserzeichen-Funktion).
 *
 * Word-Regeln, die dabei gelten (ECMA-376, 17.10.5):
 * - Eine Section ohne eigene Kopfzeile eines Typs erbt die der vorherigen Section. Der Inhalt
 *   der geerbten Kopfzeile bleibt erhalten; nur wenn es nichts zu erben gibt, wird eine leere angelegt.
 * - `first` wird nur mit `<w:titlePg/>` verwendet, `even` nur mit `<w:evenAndOddHeaders/>` in settings.xml.
 * - Teilen sich Sections verschiedener Seitengröße eine Kopfzeile, bekommt jede Größe eine eigene
 *   Kopie, damit das Wasserzeichen die Seite genau abdeckt.
 */
export async function exportDocx(data: ArrayBuffer, tile: WatermarkTile): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(data);
  const docPath = await mainDocumentPath(zip);
  const doc = parseXml(await zip.file(docPath)!.async('string'));
  const docRels = await Relationships.load(zip, docPath);
  const evenAndOdd = await usesEvenAndOddHeaders(zip, docPath, docRels);

  /** Kopfzeilen-Part → Seitengröße, für die er das Wasserzeichen bekommt */
  const sizeOf = new Map<string, PageSize>();
  /** Kopfzeilen-Part → Relationship-ID im Hauptdokument */
  const relIdOf = new Map<string, string>();
  /** `quelle|größe` → Kopie */
  const copies = new Map<string, string>();
  const newParts: string[] = [];
  let partCounter = 0;
  let copyDrawingId = 0x7fe00000;

  const newPartPath = () => {
    let path: string;
    do path = resolveTarget(docPath, `sy-watermark-header${++partCounter}.xml`);
    while (zip.file(path));
    newParts.push(path);
    return path;
  };
  const relIdFor = (path: string) => {
    let id = relIdOf.get(path);
    if (!id) relIdOf.set(path, (id = docRels.add(REL_TYPE_HEADER, relativeTarget(docPath, path))));
    return id;
  };
  const createEmptyHeader = () => {
    const path = newPartPath();
    zip.file(path, `${XML_DECL}<w:hdr xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}"><w:p/></w:hdr>`);
    return path;
  };
  /** Kopiert einen Kopfzeilen-Part samt Relationships (gleicher Ordner → Targets bleiben gültig). */
  const copyHeader = async (source: string) => {
    const path = newPartPath();
    // Zeichnungs-IDs müssen dokumentweit eindeutig sein, sonst meldet Word beschädigte Inhalte.
    const xml = (await zip.file(source)!.async('string')).replace(/(<wp:docPr\b[^>]*?\sid=")\d+"/g, (_, head: string) => `${head}${copyDrawingId++}"`);
    zip.file(path, xml);
    const rels = zip.file(relsPathFor(source));
    if (rels) zip.file(relsPathFor(path), await rels.async('string'));
    return path;
  };
  /** Liefert den Part, der für diese Seitengröße das Wasserzeichen trägt. */
  const partForSize = async (source: string, size: PageSize) => {
    const assigned = sizeOf.get(source);
    if (!assigned || sameSize(assigned, size)) {
      sizeOf.set(source, size);
      return source;
    }
    const key = `${source}|${size.w}x${size.h}`;
    let copy = copies.get(key);
    if (!copy) {
      copy = await copyHeader(source);
      copies.set(key, copy);
      sizeOf.set(copy, size);
    }
    return copy;
  };

  /** Kopfzeile je Typ, die eine Section ohne eigene Referenz erben würde (Original, ohne Größen-Kopie). */
  const inherited = new Map<HeaderType, string>();

  for (const sect of sectionProperties(doc)) {
    const size = pageSize(sect);
    const own = new Map<HeaderType, { el: Element; path?: string }>();
    for (const ref of childElements(sect, 'headerReference')) {
      const type = (ref.getAttributeNS(NS.w, 'type') as HeaderType | null) ?? 'default';
      const relId = ref.getAttributeNS(NS.r, 'id') ?? '';
      const target = docRels.get(relId)?.target;
      const path = target ? resolveTarget(docPath, target) : undefined;
      if (path && zip.file(path)) relIdOf.set(path, relId);
      own.set(type, { el: ref, path: path && zip.file(path) ? path : undefined });
    }

    const needed: HeaderType[] = ['default'];
    if (isOn(childElements(sect, 'titlePg')[0])) needed.push('first');
    if (evenAndOdd) needed.push('even');

    for (const type of needed) {
      const source = own.get(type)?.path ?? inherited.get(type) ?? createEmptyHeader();
      inherited.set(type, source);
      const part = await partForSize(source, size);
      const relId = relIdFor(part);
      const existing = own.get(type)?.el;
      if (existing) {
        existing.setAttributeNS(NS.r, 'r:id', relId);
      } else {
        // Explizite Referenz statt Vererbung: Word würde sonst die Kopfzeile der vorherigen Größe zeigen.
        const ref = doc.createElementNS(NS.w, 'w:headerReference');
        ref.setAttributeNS(NS.w, 'w:type', type);
        ref.setAttributeNS(NS.r, 'r:id', relId);
        // headerReference muss laut Schema am Anfang von sectPr stehen.
        sect.insertBefore(ref, sect.firstChild);
      }
    }
    // Nicht benötigte, aber vorhandene Referenzen (z. B. `first` ohne titlePg) werden trotzdem vererbt.
    for (const [type, ref] of own) if (!needed.includes(type) && ref.path) inherited.set(type, ref.path);
  }

  if (!doc.documentElement.lookupNamespaceURI('r')) doc.documentElement.setAttributeNS(XMLNS, 'xmlns:r', NS.r);
  // Manche Browser serialisieren die Deklaration mit, andere nicht – daher einheitlich selbst setzen.
  zip.file(docPath, XML_DECL + new XMLSerializer().serializeToString(doc).replace(/^\s*<\?xml[^>]*\?>\s*/, ''));
  docRels.save(zip);

  // Ein Wasserzeichen-Bild je Seitengröße
  const media = new Map<string, string>();
  let drawingId = 0x7ff00000;
  for (const [path, size] of sizeOf) {
    const key = `${size.w}x${size.h}`;
    let mediaPath = media.get(key);
    if (!mediaPath) {
      mediaPath = resolveTarget(docPath, `media/sy-watermark-${media.size + 1}.png`);
      zip.file(mediaPath, await watermarkSheetPng(tile, size.w / TWIPS_PER_PX, size.h / TWIPS_PER_PX));
      media.set(key, mediaPath);
    }
    const rels = await Relationships.load(zip, path);
    const imageId = rels.add(REL_TYPE_IMAGE, relativeTarget(path, mediaPath), 'rIdSyWatermark');
    rels.save(zip);
    let xml = (await zip.file(path)?.async('string')) ?? '';
    xml = ensureNamespaces(xml, 'w:hdr', ['r', 'wp']);
    xml = xml.replace(/<\/w:hdr>\s*$/, `${anchorParagraph(imageId, size.w * EMU_PER_TWIP, size.h * EMU_PER_TWIP, drawingId++)}</w:hdr>`);
    zip.file(path, xml);
  }

  await updateContentTypes(
    zip,
    newParts.map((p) => ({ partName: `/${p}`, contentType: HEADER_CT })),
  );
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Ungültiges Word-Dokument (document.xml)');
  return doc;
}

/** Section-Eigenschaften in Dokumentreihenfolge – ohne die alten Werte in `<w:sectPrChange>`. */
function sectionProperties(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagNameNS(NS.w, 'sectPr')).filter(
    (s) => !(s.parentElement?.namespaceURI === NS.w && s.parentElement.localName === 'sectPrChange'),
  );
}

function childElements(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((c) => c.namespaceURI === NS.w && c.localName === localName);
}

function pageSize(sect: Element): PageSize {
  const pgSz = childElements(sect, 'pgSz')[0];
  return {
    w: Number(pgSz?.getAttributeNS(NS.w, 'w')) || A4.w,
    h: Number(pgSz?.getAttributeNS(NS.w, 'h')) || A4.h,
  };
}

/** OOXML-Schalter wie `<w:titlePg/>`: vorhanden und nicht explizit ausgeschaltet. */
function isOn(el: Element | undefined): boolean {
  if (!el) return false;
  const val = el.getAttributeNS(NS.w, 'val');
  return val === null || !/^(0|false|off)$/i.test(val);
}

function sameSize(a: PageSize, b: PageSize): boolean {
  return a.w === b.w && a.h === b.h;
}

async function usesEvenAndOddHeaders(zip: JSZip, docPath: string, docRels: Relationships): Promise<boolean> {
  const target = docRels.findByType(REL_TYPE_SETTINGS)?.target;
  const xml = (target && (await zip.file(resolveTarget(docPath, target))?.async('string'))) || '';
  const tag = xml.match(/<w:evenAndOddHeaders\b[^>]*>/)?.[0];
  if (!tag) return false;
  const val = attr(tag, 'w:val');
  return val === undefined || !/^(0|false|off)$/i.test(val);
}

async function mainDocumentPath(zip: JSZip): Promise<string> {
  const rels = (await zip.file('_rels/.rels')?.async('string')) ?? '';
  const rel = Array.from(rels.matchAll(/<Relationship\b[^>]*>/g), (m) => m[0]).find((r) => attr(r, 'Type')?.endsWith('/officeDocument'));
  const target = rel ? attr(rel, 'Target') : undefined;
  return target ? resolveTarget('', target) : 'word/document.xml';
}

function relativeTarget(fromPart: string, toPath: string): string {
  const from = fromPart.split('/').slice(0, -1);
  const to = toPath.split('/');
  let i = 0;
  while (i < from.length && from[i] === to[i]) i++;
  return [...from.slice(i).map(() => '..'), ...to.slice(i)].join('/');
}

function anchorParagraph(rId: string, cx: number, cy: number, id: number): string {
  return (
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing>` +
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="1" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
    `<wp:docPr id="${id}" name="sy-watermark"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS.a}" noChangeAspect="1" noMove="1" noResize="1" noSelect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${NS.pic}"><pic:pic xmlns:pic="${NS.pic}">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="sy-watermark.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`
  );
}
