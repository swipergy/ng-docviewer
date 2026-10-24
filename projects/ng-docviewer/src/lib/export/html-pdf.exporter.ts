import { canvasToBlob, paintWatermark, WatermarkTileSource } from '../watermark/watermark-rasterizer';
import { appendHtmlPages, createPageFrame, HtmlPageContent, waitForContent } from './page-frame';

/** CSS-Pixel → PDF-Punkte */
const PT_PER_PX = 0.75;
/** Pixel je CSS-Pixel beim Rastern (2 ≈ 192 dpi). */
const RASTER_SCALE = 2;

export interface HtmlPdfOptions {
  title?: string;
  /** Wasserzeichen; `null` = ohne. */
  getTile?: WatermarkTileSource | null;
  signal?: AbortSignal;
  /** Fortschritt (erledigte Seiten, Gesamtzahl). */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Erzeugt im Browser ein PDF aus gerenderten HTML-Seiten (DOCX/PPTX) – ohne Server und ohne
 * installierte Office-Software. Jede Seite wird als Bild aufgenommen, das Wasserzeichen
 * eingebrannt und die Seite in Originalgröße ins PDF gesetzt.
 *
 * Folge: Der Text im PDF ist nicht durchsuchbar/kopierbar – gewollt, denn so lässt sich das
 * Wasserzeichen nicht wie in Word/PowerPoint einfach entfernen.
 */
export async function exportHtmlToPdf(content: HtmlPageContent, options: HtmlPdfOptions = {}): Promise<Uint8Array> {
  const [{ domToCanvas }, { PDFDocument }] = await Promise.all([import('modern-screenshot'), import('pdf-lib')]);
  // Außerhalb des Bildschirms, aber sichtbar und gelayoutet – sonst nimmt die Aufnahme leere Seiten auf.
  const frame = createPageFrame(
    options.title ?? '',
    content.css,
    // Seiten haben feste Breiten (px oder pt); das iframe muss nur breit genug sein.
    'position:fixed;left:-100000px;top:0;width:4000px;height:200px;border:0;opacity:0;pointer-events:none',
  );
  try {
    const pages = appendHtmlPages(frame.doc, content);
    await waitForContent(frame.doc);
    const tile = options.getTile ? await options.getTile(RASTER_SCALE) : null;
    const pdf = await PDFDocument.create();
    if (options.title) pdf.setTitle(options.title);
    pdf.setProducer('@swipergy/ng-docviewer');

    for (const [i, page] of pages.entries()) {
      throwIfAborted(options.signal);
      const rect = page.getBoundingClientRect();
      const canvas = await domToCanvas(page, {
        scale: RASTER_SCALE,
        backgroundColor: '#fff',
        width: rect.width,
        height: rect.height,
        // Keine Worker: der Viewer soll ohne zusätzliche Asset-Konfiguration funktionieren.
        workerNumber: 0,
        // Inhalte sind bereits bereinigt und enthalten nur data:/blob:-Ressourcen.
        fetch: { requestInit: { cache: 'force-cache', credentials: 'omit' } },
      });
      if (tile) paintWatermark(canvas.getContext('2d')!, tile, canvas.width, canvas.height, canvas.width / rect.width);
      const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      canvas.width = canvas.height = 0;
      const image = await pdf.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      const pdfPage = pdf.addPage([rect.width * PT_PER_PX, rect.height * PT_PER_PX]);
      pdfPage.drawImage(image, { x: 0, y: 0, width: pdfPage.getWidth(), height: pdfPage.getHeight() });
      options.onProgress?.(i + 1, pages.length);
    }
    return await pdf.save();
  } finally {
    frame.destroy();
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Abgebrochen', 'AbortError');
}
