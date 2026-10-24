import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { DocViewerError } from '../core/errors';
import { DocRenderer, PrintContent, RenderContext } from '../core/renderer';
import { canvasToBlob } from '../watermark/watermark-rasterizer';

/** PDF-Punkte → CSS-Pixel (72 dpi → 96 dpi). */
const CSS_UNITS = 96 / 72;
/** Obergrenze für Canvas-Pixel pro Seite (Speicher, Safari-Limit). */
const MAX_CANVAS_PIXELS = 16_777_216;

let workerConfigured = false;

export async function loadPdfJs(workerSrc: string | (() => Worker)) {
  const pdfjs = await import('pdfjs-dist');
  if (!workerConfigured) {
    if (typeof workerSrc === 'string') {
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    } else {
      pdfjs.GlobalWorkerOptions.workerPort = workerSrc();
    }
    workerConfigured = true;
  }
  return pdfjs;
}

/**
 * Rendert PDFs seitenweise in Canvas-Elemente. Nur Seiten in Sichtnähe werden gerendert,
 * weit entfernte Seiten geben ihren Canvas-Speicher wieder frei. Kein Textlayer (kein Kopieren).
 */
export class PdfRenderer implements DocRenderer {
  pages: HTMLElement[] = [];
  contentWidth = 0;

  private loadingTask: PDFDocumentLoadingTask | null = null;
  private pdf: PDFDocumentProxy | null = null;
  private pageProxies: PDFPageProxy[] = [];
  private sizes: { width: number; height: number }[] = [];
  private zoom = 1;
  private tasks = new Map<number, RenderTask>();
  private renderedAt = new Map<number, number>();
  private visible = new Set<number>();
  private observer: IntersectionObserver | null = null;
  private destroyed = false;

  constructor(private readonly ctx: RenderContext) {}

  async render(): Promise<void> {
    const pdfjs = await loadPdfJs(this.ctx.config.pdfWorkerSrc);
    // pdf.js übernimmt den Buffer (Transfer an den Worker) – Kopie, weil der Export das Original braucht.
    const task = (this.loadingTask = pdfjs.getDocument({ data: new Uint8Array(this.ctx.doc.data.slice(0)), enableXfa: false }));
    try {
      this.pdf = await task.promise;
    } catch (e) {
      if ((e as Error)?.name === 'PasswordException') throw new DocViewerError('passwordProtected', {}, { cause: e });
      throw e;
    }
    const pdf = this.pdf;

    // Seiten parallel anfragen – nacheinander wären es bei großen PDFs tausende Worker-Roundtrips.
    this.pageProxies = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
    if (this.destroyed) return;
    this.sizes = this.pageProxies.map((page) => {
      const vp = page.getViewport({ scale: CSS_UNITS });
      return { width: vp.width, height: vp.height };
    });
    this.contentWidth = Math.max(...this.sizes.map((s) => s.width));

    this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), {
      root: this.ctx.scrollContainer,
      rootMargin: '100% 0px',
    });
    this.pages = this.sizes.map((_, i) => {
      const el = document.createElement('div');
      el.className = 'sy-page sy-pdf-page';
      el.dataset['page'] = String(i);
      el.appendChild(document.createElement('canvas'));
      this.ctx.host.appendChild(el);
      this.observer!.observe(el);
      return el;
    });
    this.applySize();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.applySize();
    for (const i of this.visible) this.renderPage(i);
  }

  async printContent(): Promise<PrintContent> {
    const images: Blob[] = [];
    // Ein Canvas für alle Seiten; JPEG statt PNG hält den Speicherbedarf auch bei vielen Seiten klein.
    const canvas = document.createElement('canvas');
    try {
      for (const page of this.pageProxies) {
        if (this.destroyed) throw new DOMException('Viewer wurde geschlossen', 'AbortError');
        // ~150 dpi für den Druck
        const viewport = page.getViewport({ scale: CSS_UNITS * 1.5625 });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvas, viewport, intent: 'print' }).promise;
        images.push(await canvasToBlob(canvas, 'image/jpeg', 0.92));
        // Druck-Ressourcen der Seite im Worker freigeben (Anzeige rendert bei Bedarf neu).
        if (!this.renderedAt.has(page.pageNumber - 1)) page.cleanup();
      }
    } finally {
      canvas.width = canvas.height = 0;
    }
    return { kind: 'images', images };
  }

  destroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.tasks.forEach((t) => t.cancel());
    this.tasks.clear();
    void this.loadingTask?.destroy();
    this.pdf = null;
  }

  private applySize(): void {
    this.pages.forEach((el, i) => {
      el.style.width = `${Math.floor(this.sizes[i].width * this.zoom)}px`;
      el.style.height = `${Math.floor(this.sizes[i].height * this.zoom)}px`;
    });
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const i = Number((entry.target as HTMLElement).dataset['page']);
      if (entry.isIntersecting) {
        this.visible.add(i);
        this.renderPage(i);
      } else {
        this.visible.delete(i);
        this.release(i);
      }
    }
  }

  private renderPage(i: number): void {
    if (this.renderedAt.get(i) === this.zoom || !this.pdf) return;
    this.tasks.get(i)?.cancel();
    const page = this.pageProxies[i];
    const cssScale = CSS_UNITS * this.zoom;
    let outputScale = Math.max(1, devicePixelRatio || 1);
    const { width, height } = page.getViewport({ scale: cssScale });
    if (width * height * outputScale * outputScale > MAX_CANVAS_PIXELS) {
      outputScale = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
    }
    const viewport = page.getViewport({ scale: cssScale * outputScale });
    // Neues Canvas verhindert Flackern: das alte bleibt bis zum Ende sichtbar.
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const task = page.render({ canvas, viewport });
    this.tasks.set(i, task);
    task.promise.then(
      () => {
        this.tasks.delete(i);
        this.renderedAt.set(i, this.zoom);
        const old = this.pages[i].querySelector('canvas');
        if (old) old.width = old.height = 0;
        this.pages[i].replaceChildren(canvas);
      },
      (err: unknown) => {
        this.tasks.delete(i);
        if ((err as Error)?.name !== 'RenderingCancelledException') console.error(err);
      },
    );
  }

  private release(i: number): void {
    this.tasks.get(i)?.cancel();
    this.tasks.delete(i);
    if (!this.renderedAt.has(i)) return;
    this.renderedAt.delete(i);
    const canvas = this.pages[i].querySelector('canvas');
    if (canvas) canvas.width = canvas.height = 0;
  }
}
