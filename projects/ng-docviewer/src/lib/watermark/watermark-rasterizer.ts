import { DocViewerError } from '../core/errors';
import { WATERMARK_DEFAULTS, WatermarkConfig, WatermarkContext } from './watermark.model';
import { resolvePlaceholders } from './placeholder';

export interface WatermarkTile {
  canvas: HTMLCanvasElement;
  /** Größe der Kachel in CSS-Pixeln (Canvas ist um `scale` größer). */
  width: number;
  height: number;
  scale: number;
  layout: 'tile' | 'center';
}

/**
 * Liefert eine Kachel mit mindestens der angegebenen Auflösung (Canvas-Pixel je CSS-Pixel).
 * Export und Druck fordern so die Schärfe an, die das jeweilige Ziel braucht.
 */
export type WatermarkTileSource = (minScale: number) => Promise<WatermarkTile>;

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  let cached = imageCache.get(src);
  if (!cached) {
    cached = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new DocViewerError('watermarkImage', { src: src.length > 120 ? `${src.slice(0, 120)}…` : src }));
      img.src = src;
    });
    cached.catch(() => imageCache.delete(src));
    imageCache.set(src, cached);
  }
  return cached;
}

/**
 * Rendert das Wasserzeichen in eine Kachel. Dieselbe Kachel wird für Anzeige,
 * Export und Druck verwendet, damit das Wasserzeichen überall gleich aussieht.
 */
export async function rasterizeWatermark(
  config: WatermarkConfig,
  context: WatermarkContext = {},
  options: { scale?: number; locale?: string } = {},
): Promise<WatermarkTile> {
  const c = { ...WATERMARK_DEFAULTS, ...stripUndefined(config) };
  const scale = options.scale ?? (typeof devicePixelRatio === 'number' ? Math.max(1, devicePixelRatio) : 1);
  const lines = c.text ? resolvePlaceholders(c.text, context, options.locale).split('\n') : [];
  const image = c.image ? await loadImage(c.image) : undefined;

  const font = `${c.fontWeight} ${c.fontSize}px ${c.fontFamily}`;
  // Web-Fonts erst laden – sonst zeichnet Canvas stillschweigend mit der Ersatzschrift.
  if (lines.length && typeof document !== 'undefined' && document.fonts) {
    await document.fonts.load(font, lines.join(' ')).catch(() => undefined);
  }
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const lineHeight = c.fontSize * 1.3;
  const textWidth = Math.max(0, ...lines.map((l) => measure.measureText(l).width));
  const imageWidth = image ? c.imageWidth : 0;
  const imageHeight = image ? imageAspect(image) * c.imageWidth : 0;
  const spacing = image && lines.length ? c.fontSize * 0.5 : 0;

  // Inhalt (unrotiert)
  const contentW = Math.max(textWidth, imageWidth);
  const contentH = imageHeight + spacing + lines.length * lineHeight;

  // Bounding Box nach Rotation
  const rad = (c.angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rotW = contentW * cos + contentH * sin;
  const rotH = contentW * sin + contentH * cos;
  const pad = c.layout === 'tile' ? c.gap : 0;
  const width = Math.ceil(rotW + pad);
  const height = Math.ceil(rotH + pad);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.globalAlpha = c.opacity;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rad);
  let y = -contentH / 2;
  if (image) {
    ctx.drawImage(image, -imageWidth / 2, y, imageWidth, imageHeight);
    y += imageHeight + spacing;
  }
  ctx.font = font;
  ctx.fillStyle = c.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const line of lines) {
    ctx.fillText(line, 0, y + lineHeight / 2);
    y += lineHeight;
  }
  return { canvas, width, height, scale, layout: c.layout };
}

/**
 * Zeichnet das Wasserzeichen auf eine Fläche (`width`×`height` in Zielpixeln).
 * `unit` = Zielpixel pro CSS-Pixel der Kachel.
 */
export function paintWatermark(ctx: CanvasRenderingContext2D, tile: WatermarkTile, width: number, height: number, unit = 1): void {
  ctx.save();
  const tw = tile.width * unit;
  const th = tile.height * unit;
  if (tile.layout === 'center') {
    // Mittig, auf max. 80 % der Fläche begrenzt
    const fit = Math.min(1, (width * 0.8) / tw, (height * 0.8) / th);
    ctx.drawImage(tile.canvas, (width - tw * fit) / 2, (height - th * fit) / 2, tw * fit, th * fit);
  } else {
    for (let y = 0; y < height; y += th) {
      for (let x = 0; x < width; x += tw) {
        ctx.drawImage(tile.canvas, x, y, tw, th);
      }
    }
  }
  ctx.restore();
}

/** Erzeugt ein PNG der vollen Fläche – für Office-Exporte. */
export async function watermarkSheetPng(tile: WatermarkTile, cssWidth: number, cssHeight: number, pixelScale = 2): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cssWidth * pixelScale));
  canvas.height = Math.max(1, Math.round(cssHeight * pixelScale));
  paintWatermark(canvas.getContext('2d')!, tile, canvas.width, canvas.height, pixelScale);
  return canvasToPng(canvas);
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await canvasToBlob(canvas, 'image/png');
  return new Uint8Array(await blob.arrayBuffer());
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new DocViewerError('canvasExport'))), type, quality),
  );
}

/** Höhe/Breite des Bildes. SVGs ohne eigene Größe liefern teils 0 – dann quadratisch annehmen. */
function imageAspect(image: HTMLImageElement): number {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  return w > 0 && h > 0 ? h / w : 1;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
