import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { rasterizeWatermark } from '../watermark/watermark-rasterizer';
import { exportHtmlToPdf } from './html-pdf.exporter';

function page(width: number, height: number, text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sy-slide';
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.innerHTML = `<p>${text}</p>`;
  return el;
}

describe('exportHtmlToPdf', () => {
  it('erzeugt je HTML-Seite eine PDF-Seite in Originalgröße mit genau einem Seitenbild', async () => {
    const tile = await rasterizeWatermark({ text: 'Test' }, {}, { scale: 2 });
    const progress: number[] = [];
    const bytes = await exportHtmlToPdf(
      { kind: 'html', css: '.sy-slide { background: #eef; }', pages: [page(960, 540, 'Eins'), page(400, 600, 'Zwei')] },
      { title: 'Folien.pptx', getTile: async () => tile, onProgress: (done) => progress.push(done) },
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe('Folien.pptx');
    expect(pdf.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())])).toEqual([
      [720, 405],
      [300, 450],
    ]);
    for (const p of pdf.getPages()) {
      expect(p.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict).keys()).toHaveLength(1);
    }
    expect(progress).toEqual([1, 2]);
    // Hilfs-iframe wird wieder entfernt
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('bricht bei abgebrochenem Signal ab und räumt auf', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(exportHtmlToPdf({ kind: 'html', css: '', pages: [page(100, 100, 'x')] }, { signal: abort.signal })).rejects.toBeTruthy();
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });
});
