import JSZip from 'jszip';
import { rasterizeWatermark, WatermarkTile } from '../watermark/watermark-rasterizer';
import { exportDocx } from './docx.exporter';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const LETTER = '<w:pgSz w:w="12240" w:h="15840"/>';
const A4_LANDSCAPE = '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>';

/** Minimales DOCX mit den übergebenen Sections; header1.xml („Kopf“) ist als rId7 verfügbar. */
async function sampleDocx(sections: string[], settings?: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`);
  // Alle Sections außer der letzten stehen im pPr eines Absatzes.
  const body = sections.map((s, i) => (i < sections.length - 1 ? `<w:p><w:pPr>${s}</w:pPr></w:p>` : `<w:p/>${s}`)).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`);
  zip.file(
    'word/_rels/document.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="${R}/header" Target="header1.xml"/>` +
      (settings ? `<Relationship Id="rId8" Type="${R}/settings" Target="settings.xml"/>` : '') +
      `</Relationships>`,
  );
  zip.file('word/header1.xml', `<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>Kopf</w:t></w:r></w:p></w:hdr>`);
  if (settings) zip.file('word/settings.xml', `<w:settings xmlns:w="${W}">${settings}</w:settings>`);
  return zip.generateAsync({ type: 'arraybuffer' });
}

async function exportSample(sectPrs: string[], settings?: string) {
  const zip = await JSZip.loadAsync(await (await exportDocx(await sampleDocx(sectPrs, settings), tile)).arrayBuffer());
  const docXml = await zip.file('word/document.xml')!.async('string');
  const parsed = new DOMParser().parseFromString(docXml, 'application/xml');
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
  const targetOf = (id: string) => rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))?.[1];
  /** Je Section: Typ → Kopfzeilen-Part */
  const sections: Record<string, string>[] = Array.from(parsed.getElementsByTagNameNS(W, 'sectPr'))
    .filter((s) => s.parentElement?.localName !== 'sectPrChange')
    .map((s) => {
      const refs = Array.from(s.children).filter((c) => c.localName === 'headerReference');
      return Object.fromEntries(refs.map((r) => [r.getAttributeNS(W, 'type') ?? '', `word/${targetOf(r.getAttributeNS(R, 'id')!)}`]));
    });
  const read = (path: string) => zip.file(path)!.async('string');
  return { zip, docXml, sections, read };
}

let tile: WatermarkTile;

describe('exportDocx', () => {
  beforeAll(async () => {
    tile = await rasterizeWatermark({ text: 'Test' }, {}, { scale: 1 });
  });

  it('ergänzt die vorhandene Kopfzeile und behält deren Inhalt', async () => {
    const { read, zip } = await exportSample([`<w:sectPr><w:headerReference w:type="default" r:id="rId7"/>${LETTER}</w:sectPr>`]);
    const header = await read('word/header1.xml');
    expect(header).toContain('<w:t>Kopf</w:t>');
    expect(header).toContain('name="sy-watermark"');
    expect(header).toContain('xmlns:r=');
    expect(header).toContain('xmlns:wp=');
    // Letter: 12240 × 15840 Twips → EMU
    expect(header).toContain(`<wp:extent cx="${12240 * 635}" cy="${15840 * 635}"/>`);
    const rels = await zip.file('word/_rels/header1.xml.rels')!.async('string');
    expect(rels).toMatch(/Target="media\/sy-watermark-\d\.png"/);
  });

  it('übernimmt geerbte Kopfzeilen bei gleicher Seitengröße, statt sie zu ersetzen', async () => {
    const { sections } = await exportSample([
      `<w:sectPr><w:headerReference w:type="default" r:id="rId7"/>${LETTER}</w:sectPr>`,
      `<w:sectPr>${LETTER}</w:sectPr>`,
    ]);
    expect(sections[0]['default']).toBe('word/header1.xml');
    expect(sections[1]['default']).toBe('word/header1.xml');
  });

  it('kopiert geerbte Kopfzeilen für abweichende Seitengrößen samt Inhalt', async () => {
    const { sections, read, zip } = await exportSample([
      `<w:sectPr><w:headerReference w:type="default" r:id="rId7"/>${LETTER}</w:sectPr>`,
      `<w:sectPr>${A4_LANDSCAPE}</w:sectPr>`,
    ]);
    const copy = sections[1]['default'];
    expect(copy).not.toBe('word/header1.xml');
    const xml = await read(copy);
    expect(xml).toContain('<w:t>Kopf</w:t>');
    expect(xml).toContain(`<wp:extent cx="${16838 * 635}" cy="${11906 * 635}"/>`);
    // Original behält genau ein Wasserzeichen in seiner eigenen Größe
    const original = await read('word/header1.xml');
    expect(original.match(/name="sy-watermark"/g)).toHaveLength(1);
    expect(original).toContain(`<wp:extent cx="${12240 * 635}"`);
    const types = await zip.file('[Content_Types].xml')!.async('string');
    expect(types).toContain(`PartName="/${copy}"`);
    expect(Object.keys(zip.files).filter((f) => f.startsWith('word/media/') && !zip.files[f].dir)).toHaveLength(2);
  });

  it('legt nur dort leere Kopfzeilen an, wo nichts geerbt wird (Titelseite der ersten Section)', async () => {
    const { sections, read } = await exportSample([`<w:sectPr><w:headerReference w:type="default" r:id="rId7"/>${LETTER}<w:titlePg/></w:sectPr>`]);
    expect(sections[0]['default']).toBe('word/header1.xml');
    const first = sections[0]['first'];
    expect(first).toMatch(/sy-watermark-header\d\.xml$/);
    expect(await read(first)).not.toContain('Kopf');
  });

  it('versieht gerade Seiten nur mit evenAndOddHeaders', async () => {
    const plain = await exportSample([`<w:sectPr><w:headerReference w:type="default" r:id="rId7"/>${LETTER}</w:sectPr>`]);
    expect(plain.sections[0]['even']).toBeUndefined();
    const even = await exportSample([`<w:sectPr><w:headerReference w:type="default" r:id="rId7"/>${LETTER}</w:sectPr>`], '<w:evenAndOddHeaders/>');
    expect(even.sections[0]['even']).toMatch(/sy-watermark-header\d\.xml$/);
    expect(await even.read(even.sections[0]['even'])).toContain('name="sy-watermark"');
  });

  it('setzt headerReference an den Anfang von sectPr und lässt sectPrChange unverändert', async () => {
    const { docXml } = await exportSample([
      `<w:sectPr>${LETTER}<w:sectPrChange w:id="1" w:author="a"><w:sectPr>${LETTER}</w:sectPr></w:sectPrChange></w:sectPr>`,
    ]);
    const parsed = new DOMParser().parseFromString(docXml, 'application/xml');
    const outer = Array.from(parsed.getElementsByTagNameNS(W, 'sectPr')).find((s) => s.parentElement?.localName !== 'sectPrChange')!;
    expect(outer.firstElementChild!.localName).toBe('headerReference');
    const inner = parsed.getElementsByTagNameNS(W, 'sectPrChange')[0].firstElementChild!;
    expect(inner.getElementsByTagNameNS(W, 'headerReference')).toHaveLength(0);
    // Genau eine XML-Deklaration ganz am Anfang (sonst ist die Datei ungültig)
    expect(docXml.startsWith('<?xml')).toBe(true);
    expect(docXml.match(/<\?xml/g)).toHaveLength(1);
  });

  it('vergibt in kopierten Kopfzeilen neue Zeichnungs-IDs', async () => {
    const zip = await JSZip.loadAsync(
      await sampleDocx([`<w:sectPr><w:headerReference w:type="default" r:id="rId7"/>${LETTER}</w:sectPr>`, `<w:sectPr>${A4_LANDSCAPE}</w:sectPr>`]),
    );
    zip.file('word/header1.xml', `<w:hdr xmlns:w="${W}" xmlns:wp="x"><w:p><w:r><wp:docPr id="5" name="Logo"/></w:r></w:p></w:hdr>`);
    const out = await JSZip.loadAsync(await (await exportDocx(await zip.generateAsync({ type: 'arraybuffer' }), tile)).arrayBuffer());
    const ids = new Set<string>();
    for (const f of Object.keys(out.files).filter((f) => /header.*\.xml$/.test(f) && !f.includes('_rels'))) {
      for (const m of (await out.file(f)!.async('string')).matchAll(/<wp:docPr\b[^>]*\sid="(\d+)"/g)) {
        expect(ids.has(m[1])).toBe(false);
        ids.add(m[1]);
      }
    }
    expect(ids.size).toBe(4); // je Part: Logo + Wasserzeichen
  });
});
