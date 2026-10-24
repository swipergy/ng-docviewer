import { degrees, PDFDict, PDFDocument, PDFName, PDFPage } from 'pdf-lib';
import { rasterizeWatermark } from '../watermark/watermark-rasterizer';
import { exportPdf } from './pdf.exporter';

async function samplePdf(): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  pdf.addPage([842, 595]).setRotation(degrees(90));
  return (await pdf.save()).slice().buffer as ArrayBuffer;
}

describe('exportPdf', () => {
  it('bettet das Wasserzeichen auf jeder Seite ein', async () => {
    const tile = await rasterizeWatermark({ text: 'Test' }, {}, { scale: 1 });
    const out = await PDFDocument.load(await exportPdf(await samplePdf(), tile));
    expect(out.getPageCount()).toBe(2);
    for (const page of out.getPages()) {
      const xobjects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
      // Jede Kachel verweist auf dasselbe eingebettete Bild
      const refs = new Set(xobjects.values().map((v) => v.toString()));
      expect(xobjects.keys().length).toBeGreaterThan(0);
      expect(refs.size).toBe(1);
    }
  });

  it('zeichnet bei `center` genau einmal pro Seite, sonst gekachelt', async () => {
    const spy = vi.spyOn(PDFPage.prototype, 'drawImage');
    await exportPdf(await samplePdf(), await rasterizeWatermark({ text: 'Test', layout: 'center' }, {}, { scale: 1 }));
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockClear();
    await exportPdf(await samplePdf(), await rasterizeWatermark({ text: 'Test' }, {}, { scale: 1 }));
    expect(spy.mock.calls.length).toBeGreaterThan(4);
    // Gedrehte Seite: Kachel wird gegen die Seitenrotation gedreht
    expect(spy.mock.calls.at(-1)![1]!.rotate).toEqual(degrees(90));
    spy.mockRestore();
  });
});
