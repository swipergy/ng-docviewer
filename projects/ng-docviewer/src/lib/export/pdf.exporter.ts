import { DocViewerError } from '../core/errors';
import { canvasToPng, WatermarkTile } from '../watermark/watermark-rasterizer';

/** CSS-Pixel → PDF-Punkte */
const PT_PER_PX = 0.75;

/** Zeichnet das Wasserzeichen als Bild auf jede Seite des PDFs. */
export async function exportPdf(data: ArrayBuffer, tile: WatermarkTile): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
  if (pdf.isEncrypted) {
    // pdf-lib kann verschlüsselte PDFs nicht schreiben – das gilt auch für reinen Berechtigungsschutz (Owner-Passwort).
    throw new DocViewerError('encryptedPdf');
  }
  const image = await pdf.embedPng(await canvasToPng(tile.canvas));
  const tw = tile.width * PT_PER_PX;
  const th = tile.height * PT_PER_PX;

  for (const page of pdf.getPages()) {
    const box = page.getCropBox();
    // Seitenrotation ausgleichen, damit das Wasserzeichen in der Anzeige aufrecht steht.
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const sideways = rotation === 90 || rotation === 270;
    // Belegte Fläche einer Kachel nach Rotation
    const ow = sideways ? th : tw;
    const oh = sideways ? tw : th;
    const draw = (x: number, y: number, w: number, h: number) => {
      // Ankerpunkt so verschieben, dass die rotierte Kachel genau [x, x+ow]×[y, y+oh] belegt.
      const offset: Record<number, [number, number]> = { 0: [0, 0], 90: [h, 0], 180: [w, h], 270: [0, w] };
      const [dx, dy] = offset[rotation] ?? [0, 0];
      page.drawImage(image, { x: x + dx, y: y + dy, width: w, height: h, rotate: degrees(rotation) });
    };

    if (tile.layout === 'center') {
      const fit = Math.min(1, (box.width * 0.8) / ow, (box.height * 0.8) / oh);
      draw(box.x + (box.width - ow * fit) / 2, box.y + (box.height - oh * fit) / 2, tw * fit, th * fit);
    } else {
      for (let y = box.y; y < box.y + box.height; y += oh) {
        for (let x = box.x; x < box.x + box.width; x += ow) {
          draw(x, y, tw, th);
        }
      }
    }
  }
  return pdf.save();
}
