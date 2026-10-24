import { DocViewerError } from '../core/errors';
import { LoadedDocument } from '../core/types';
import { WatermarkTileSource } from '../watermark/watermark-rasterizer';

/**
 * Liefert die Datei mit eingebranntem Wasserzeichen.
 * Audio kann kein Wasserzeichen tragen → Fehler (der Viewer deaktiviert den Download vorher).
 */
export async function exportWithWatermark(doc: LoadedDocument, getTile: WatermarkTileSource): Promise<Blob> {
  if (doc.kind === 'image') return (await import('./image.exporter')).exportImage(doc.data, doc.mimeType, getTile);
  if (doc.kind === 'audio') throw new DocViewerError('audioNoWatermark');
  // Office-Exporte rendern mit 2 Pixeln je CSS-Pixel; 3 lässt bei PDFs Reserve fürs Hineinzoomen.
  const tile = await getTile(3);
  switch (doc.kind) {
    case 'pdf': {
      const bytes = await (await import('./pdf.exporter')).exportPdf(doc.data, tile);
      return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
    }
    case 'docx':
      return (await import('./docx.exporter')).exportDocx(doc.data, tile);
    case 'pptx':
      return (await import('./pptx.exporter')).exportPptx(doc.data, tile);
  }
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
