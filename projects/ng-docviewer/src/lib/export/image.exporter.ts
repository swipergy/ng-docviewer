import { canvasToBlob, paintWatermark, WatermarkTileSource } from '../watermark/watermark-rasterizer';

/** Bezugsbreite: Bei 1000 px Bildbreite entspricht ein Kachel-Pixel einem Bildpixel. */
const REFERENCE_WIDTH = 1000;
/** Obergrenze für die Kachel-Auflösung (sehr große Bilder). */
const MAX_TILE_SCALE = 8;

/**
 * Brennt das Wasserzeichen in ein Bild ein. Die Kachel wird in der Auflösung angefordert,
 * die das Zielbild braucht, damit das Wasserzeichen auch bei großen Bildern scharf bleibt.
 */
export async function burnInWatermark(image: Blob, getTile: WatermarkTileSource, type: string, quality?: number): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const unit = Math.max(1, canvas.width / REFERENCE_WIDTH);
  const tile = await getTile(Math.min(MAX_TILE_SCALE, unit));
  paintWatermark(ctx, tile, canvas.width, canvas.height, unit);
  const blob = await canvasToBlob(canvas, type, quality);
  canvas.width = canvas.height = 0;
  return blob;
}

/** Brennt das Wasserzeichen in ein JPG/PNG ein. Format bleibt erhalten. */
export function exportImage(data: ArrayBuffer, mimeType: string, getTile: WatermarkTileSource): Promise<Blob> {
  const type = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  return burnInWatermark(new Blob([data], { type: mimeType }), getTile, type, 0.92);
}
