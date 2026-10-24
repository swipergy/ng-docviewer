import type JSZip from 'jszip';

export const REL_TYPE_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
export const REL_TYPE_HEADER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
export const NS = {
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
};

const EMPTY_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

/** Pfad der Relationship-Datei zu einem Part, z. B. `word/document.xml` → `word/_rels/document.xml.rels`. */
export function relsPathFor(partPath: string): string {
  const i = partPath.lastIndexOf('/');
  return `${partPath.slice(0, i + 1)}_rels/${partPath.slice(i + 1)}.rels`;
}

/** Löst ein Relationship-Target relativ zum Part auf. */
export function resolveTarget(partPath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = partPath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export class Relationships {
  private constructor(
    private xml: string,
    readonly path: string,
  ) {}

  static async load(zip: JSZip, partPath: string): Promise<Relationships> {
    const path = relsPathFor(partPath);
    return new Relationships((await zip.file(path)?.async('string')) ?? EMPTY_RELS, path);
  }

  get(id: string): { type: string; target: string } | undefined {
    for (const m of this.xml.matchAll(/<Relationship\b[^>]*>/g)) {
      if (attr(m[0], 'Id') === id) return { type: attr(m[0], 'Type') ?? '', target: attr(m[0], 'Target') ?? '' };
    }
    return undefined;
  }

  findByType(type: string): { id: string; target: string } | undefined {
    for (const m of this.xml.matchAll(/<Relationship\b[^>]*>/g)) {
      if (attr(m[0], 'Type') === type) return { id: attr(m[0], 'Id') ?? '', target: attr(m[0], 'Target') ?? '' };
    }
    return undefined;
  }

  add(type: string, target: string, preferredId?: string): string {
    const ids = new Set(Array.from(this.xml.matchAll(/\bId="([^"]+)"/g), (m) => m[1]));
    let id = preferredId && !ids.has(preferredId) ? preferredId : '';
    for (let n = ids.size + 1; !id; n++) if (!ids.has(`rId${n}`)) id = `rId${n}`;
    const rel = `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
    this.xml = this.xml.includes('</Relationships>')
      ? this.xml.replace('</Relationships>', `${rel}</Relationships>`)
      : this.xml.replace(/<Relationships\b([^>]*)\/>/, `<Relationships$1>${rel}</Relationships>`);
    return id;
  }

  save(zip: JSZip): void {
    zip.file(this.path, this.xml);
  }
}

export function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name.replace(':', '\\:')}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2]) : undefined;
}

/** Ergänzt fehlende Namespace-Deklarationen am Wurzelelement. */
export function ensureNamespaces(xml: string, rootTag: string, prefixes: (keyof typeof NS)[]): string {
  return xml.replace(new RegExp(`<${rootTag}\\b[^>]*>`), (tag) => {
    const missing = prefixes.filter((p) => !new RegExp(`\\sxmlns:${p}=`).test(tag));
    if (!missing.length) return tag;
    const decl = missing.map((p) => ` xmlns:${p}="${NS[p]}"`).join('');
    return tag.endsWith('/>') ? tag.slice(0, -2) + decl + '/>' : tag.slice(0, -1) + decl + '>';
  });
}

/** Registriert PNG und optionale Overrides in `[Content_Types].xml`. */
export async function updateContentTypes(zip: JSZip, overrides: { partName: string; contentType: string }[] = []): Promise<void> {
  const path = '[Content_Types].xml';
  let xml = (await zip.file(path)?.async('string')) ?? '';
  if (!/<Default\b[^>]*Extension="png"/i.test(xml)) {
    xml = xml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  }
  for (const o of overrides) {
    if (!xml.includes(`PartName="${o.partName}"`)) {
      xml = xml.replace('</Types>', `<Override PartName="${o.partName}" ContentType="${o.contentType}"/></Types>`);
    }
  }
  zip.file(path, xml);
}

/** Liest die Foliengröße aus `ppt/presentation.xml` (in EMU); Standard 16:9. */
export async function readSlideSize(zip: JSZip): Promise<{ cx: number; cy: number }> {
  const xml = (await zip.file('ppt/presentation.xml')?.async('string')) ?? '';
  const tag = xml.match(/<p:sldSz\b[^>]*>/)?.[0];
  const cx = Number(tag && attr(tag, 'cx'));
  const cy = Number(tag && attr(tag, 'cy'));
  return cx > 0 && cy > 0 ? { cx, cy } : { cx: 12192000, cy: 6858000 };
}

/**
 * Fügt `content` als letztes Kind von `<p:spTree>` ein – vor einem abschließenden `<p:extLst>`,
 * das laut Schema immer am Ende stehen muss.
 */
export function appendToSpTree(xml: string, content: string): string {
  const close = xml.indexOf('</p:spTree>');
  if (close < 0) return xml;
  let at = close;
  const before = xml.slice(0, close).trimEnd();
  if (before.endsWith('</p:extLst>')) {
    // Das extLst von spTree selbst: unmittelbar vor </p:spTree>. Ein extLst einer Form endete vor </p:sp> o. ä.
    const start = before.lastIndexOf('<p:extLst');
    if (start >= 0) at = start;
  }
  return xml.slice(0, at) + content + xml.slice(at);
}
