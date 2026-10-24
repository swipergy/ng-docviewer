import { PrintContent } from '../core/renderer';
import { WatermarkTileSource } from '../watermark/watermark-rasterizer';
import { burnInWatermark } from './image.exporter';
import { appendHtmlPages, createPageFrame, waitForContent } from './page-frame';

/**
 * Druckt über ein verstecktes iframe. Das Wasserzeichen wird bei Bildern eingebrannt
 * bzw. bei HTML-Seiten als Ebene pro Seite ergänzt.
 */
export async function printWithWatermark(content: PrintContent, getTile: WatermarkTileSource | null, title: string): Promise<void> {
  // Für die HTML-Ebene reicht eine Kachel in Druckauflösung.
  const tile = getTile ? await getTile(3) : null;
  const urls: string[] = [];
  const wmUrl = tile ? tile.canvas.toDataURL('image/png') : '';
  const frame = createPageFrame(
    title,
    `
    @page { margin: 0; ${content.kind === 'html' && content.landscape ? 'size: landscape;' : ''} }
    .sy-print-page { break-after: page; page-break-after: always; }
    .sy-print-page:last-child { break-after: auto; page-break-after: auto; }
    .sy-print-wm { position: absolute; inset: 0; pointer-events: none; z-index: 2147483646;
      background-image: url("${wmUrl}");
      background-size: ${tile ? `${tile.width}px ${tile.height}px` : 'auto'};
      background-repeat: ${tile?.layout === 'center' ? 'no-repeat' : 'repeat'};
      background-position: ${tile?.layout === 'center' ? 'center' : '0 0'}; }
    ${content.kind === 'html' ? content.css : ''}
  `,
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden',
  );
  const { win, doc } = frame;

  if (content.kind === 'images') {
    for (const image of content.images) {
      const blob = getTile ? await burnInWatermark(image, getTile, image.type || 'image/png', 0.92) : image;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const page = doc.createElement('div');
      page.className = 'sy-print-page';
      const img = doc.createElement('img');
      img.src = url;
      page.appendChild(img);
      doc.body.appendChild(page);
    }
  } else {
    appendHtmlPages(doc, content, (page) => {
      if (!tile) return;
      const wm = doc.createElement('div');
      wm.className = 'sy-print-wm';
      page.appendChild(wm);
    });
  }

  await waitForContent(doc);

  const cleanup = () => {
    frame.destroy();
    urls.forEach((u) => URL.revokeObjectURL(u));
  };
  win.addEventListener('afterprint', () => setTimeout(cleanup, 0), { once: true });
  // Fallback, falls `afterprint` nicht feuert
  setTimeout(cleanup, 60_000);
  win.focus();
  win.print();
}
