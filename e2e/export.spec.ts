import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { openSample } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/?lang=de');
});

async function download(page: Page): Promise<{ name: string; data: Buffer; path: string }> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('sy-doc-viewer').getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
  const path = (await dl.path())!;
  return { name: dl.suggestedFilename(), data: readFileSync(path), path };
}

test('PDF-Download enthält Wasserzeichen auf jeder Seite', async ({ page }) => {
  await openSample(page, 'PDF');
  const { name, data } = await download(page);
  expect(name).toBe('sample.pdf');
  const pdf = await PDFDocument.load(data);
  expect(pdf.getPageCount()).toBe(3);
  for (const p of pdf.getPages()) {
    const xobjects = p.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    expect(xobjects?.keys().length ?? 0).toBeGreaterThan(0);
  }
});

test('DOCX-Download enthält Wasserzeichen in der Kopfzeile und lässt sich wieder öffnen', async ({ page }) => {
  await openSample(page, 'Word');
  const { data, path } = await download(page);
  const zip = await JSZip.loadAsync(data);
  const headers = Object.keys(zip.files).filter((f) => /^word\/.*header.*\.xml$/.test(f));
  expect(headers.length).toBeGreaterThan(0);
  const header = await zip.file(headers[0])!.async('string');
  expect(header).toContain('name="sy-watermark"');
  expect(header).toContain('locked="1"');
  expect(Object.keys(zip.files).some((f) => /^word\/media\/sy-watermark-\d+\.png$/.test(f))).toBe(true);
  const doc = await zip.file('word/document.xml')!.async('string');
  expect(doc).toMatch(/<w:headerReference w:type="default" r:id="rId\d+"\/>/);
  expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('Extension="png"');

  // Erneut im Viewer öffnen: Kopfzeile mit Wasserzeichen-Bild wird gerendert
  await page.locator('input[type=file]').setInputFiles({ name: 'exported.docx', mimeType: '', buffer: readFileSync(path) });
  await expect(page.getByTestId('log').locator('li').first()).toContainText('geladen: exported.docx (docx');
  const imgs = await page.locator('sy-doc-viewer .sy-content').evaluate((host) => host.shadowRoot!.querySelectorAll('header img').length);
  expect(imgs).toBeGreaterThan(0);
});

test('PPTX-Download enthält gesperrtes Wasserzeichen auf jeder Folie', async ({ page }) => {
  await openSample(page, 'PowerPoint');
  const { data, path } = await download(page);
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slides).toHaveLength(3);
  for (const s of slides) {
    const xml = await zip.file(s)!.async('string');
    expect(xml).toMatch(/<p:pic><p:nvPicPr><p:cNvPr id="\d+" name="sy-watermark"/);
    expect(xml).toContain('noSelect="1"');
    // Bild ist das letzte Element im Baum → liegt oben
    expect(xml.lastIndexOf('</p:pic>')).toBeGreaterThan(xml.lastIndexOf('</p:sp>'));
    const rels = await zip.file(s.replace('slides/', 'slides/_rels/') + '.rels')!.async('string');
    expect(rels).toContain('Target="../media/sy-watermark.png"');
  }
  expect(zip.file('ppt/media/sy-watermark.png')).toBeTruthy();

  // Exportierte Datei ist für den Renderer weiterhin lesbar
  await page.locator('input[type=file]').setInputFiles({ name: 'exported.pptx', mimeType: '', buffer: readFileSync(path) });
  await expect(page.getByTestId('log').locator('li').first()).toContainText('geladen: exported.pptx (pptx, 3 Seiten)');
});

test('Bild-Download ist verändert und behält das Format', async ({ page }) => {
  await openSample(page, 'JPG');
  const { name, data } = await download(page);
  expect(name).toBe('sample.jpg');
  expect([...data.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  const original = readFileSync('projects/demo/public/samples/sample.jpg');
  expect(Buffer.compare(data, original)).not.toBe(0);
});

test('ohne Wasserzeichen wird das Original heruntergeladen', async ({ page }) => {
  await page.getByLabel('aktiv').uncheck();
  await openSample(page, 'PNG');
  const { data } = await download(page);
  expect(Buffer.compare(data, readFileSync('projects/demo/public/samples/sample.png'))).toBe(0);
});

test('Drucken erzeugt Druckansicht mit Wasserzeichen', async ({ page }) => {
  await page.addInitScript(() => {
    // Druckdialog im Druck-iframe unterdrücken und Druckinhalt protokollieren
    const printed: object[] = ((window as unknown as { __printed: object[] }).__printed = []);
    new MutationObserver((records) => {
      for (const node of records.flatMap((r) => Array.from(r.addedNodes))) {
        if (!(node instanceof HTMLIFrameElement) || !node.contentWindow) continue;
        const win = node.contentWindow;
        win.print = () => {
          const doc = win.document;
          printed.push({
            pages: doc.querySelectorAll('.sy-print-page').length,
            imgs: doc.querySelectorAll('.sy-print-page img').length,
            wm: doc.querySelectorAll('.sy-print-wm').length,
          });
        };
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/?lang=de');
  for (const [name, expected] of [
    ['PDF', { pages: 3, imgs: 3, wm: 0 }],
    ['Word', { pages: 2, wm: 2 }],
    ['PowerPoint', { pages: 3, wm: 3 }],
  ] as const) {
    await openSample(page, name);
    await page.locator('sy-doc-viewer').getByRole('button', { name: 'Drucken' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: object[] }).__printed.at(-1))).toMatchObject(expected);
  }
});

for (const [name, expected] of [
  ['Word', { file: 'sample.pdf', pages: 2, size: [595, 842] }],
  ['PowerPoint', { file: 'sample.pdf', pages: 3, size: [720, 405] }],
] as const) {
  test(`${name}: PDF wird im Browser erzeugt und enthält das Wasserzeichen im Seitenbild`, async ({ page }) => {
    await openSample(page, name);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('sy-doc-viewer').getByRole('button', { name: 'Als PDF herunterladen' }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe(expected.file);
    const path = (await dl.path())!;
    const pdf = await PDFDocument.load(readFileSync(path));
    expect(pdf.getPageCount()).toBe(expected.pages);
    expect(pdf.getTitle()).toMatch(/^sample\.(docx|pptx)$/);
    for (const p of pdf.getPages()) {
      const { width, height } = p.getSize();
      expect(Math.abs(width - expected.size[0])).toBeLessThan(2);
      expect(Math.abs(height - expected.size[1])).toBeLessThan(2);
      // Genau ein Seitenbild, mit doppelter Auflösung gerastert
      const xobjects = p.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
      expect(xobjects.keys()).toHaveLength(1);
    }

    // Das erzeugte PDF lässt sich wieder öffnen
    await page.locator('input[type=file]').setInputFiles({ name: 'konvertiert.pdf', mimeType: 'application/pdf', buffer: readFileSync(path) });
    await expect(page.getByTestId('log').locator('li').first()).toContainText(`geladen: konvertiert.pdf (pdf, ${expected.pages} Seiten)`);
  });
}

test('PDF-Button nur für Word/PowerPoint', async ({ page }) => {
  for (const name of ['PDF', 'JPG'] as const) {
    await openSample(page, name);
    await expect(page.locator('sy-doc-viewer').getByRole('button', { name: 'Als PDF herunterladen' })).toHaveCount(0);
  }
});
