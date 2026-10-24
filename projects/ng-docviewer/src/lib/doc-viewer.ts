import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DOC_VIEWER_CONFIG } from './config';
import { DocViewerError, formatErrorMessage } from './core/errors';
import { DocRenderer } from './core/renderer';
import { loadSource } from './core/source-loader';
import { detectDocumentType } from './core/type-detector';
import { DocSource, DocumentKind, LoadedDocument } from './core/types';
import { exportWithWatermark, saveBlob } from './export';
import { exportHtmlToPdf } from './export/html-pdf.exporter';
import { printWithWatermark } from './export/print';
import { createRenderer } from './renderers';
import { hasWatermark, WatermarkConfig, WatermarkContext } from './watermark/watermark.model';
import { TamperReason, WatermarkOverlay } from './watermark/watermark-overlay';
import { rasterizeWatermark, WatermarkTile, WatermarkTileSource } from './watermark/watermark-rasterizer';

export type ViewerStatus = 'idle' | 'loading' | 'ready' | 'error' | 'locked';

export interface DocViewerLoadedEvent {
  kind: DocumentKind;
  fileName: string;
  pageCount: number;
}

export interface DocViewerTamperEvent {
  reason: TamperReason;
  count: number;
  locked: boolean;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.25;
/** Innenabstand des Scrollbereichs links + rechts in px */
const SCROLL_PADDING = 32;
/** Abstand über einer angesprungenen Seite in px */
const PAGE_SCROLL_MARGIN = 16;

@Component({
  selector: 'sy-doc-viewer',
  templateUrl: './doc-viewer.html',
  styleUrl: './doc-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.sy-protected]': 'protect()',
    '[attr.data-kind]': 'kind()',
    '(contextmenu)': 'onBlockedEvent($event)',
    '(dragstart)': 'onBlockedEvent($event)',
    '(copy)': 'onBlockedEvent($event)',
    '(cut)': 'onBlockedEvent($event)',
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class DocViewer {
  private readonly config = inject(DOC_VIEWER_CONFIG);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** URL, Blob/File oder Rohdaten des Dokuments. */
  readonly src = input<DocSource | null | undefined>(null);
  /** Dokumentart; `auto` erkennt sie über MIME-Typ, Endung und Dateisignatur. */
  readonly type = input<DocumentKind | 'auto'>('auto');
  /** Anzeigename / Dateiname für Download und Typerkennung. */
  readonly fileName = input<string | undefined>(undefined);
  /** Optionen für `fetch`, wenn `src` eine URL ist (z. B. Header, Credentials). */
  readonly requestInit = input<RequestInit | undefined>(undefined);
  /** Wasserzeichen; wird mit dem globalen Standard aus `provideDocViewer` zusammengeführt. `null` = keins. */
  readonly watermark = input<WatermarkConfig | null | undefined>(undefined);
  /** Werte für Platzhalter im Wasserzeichen-Text, z. B. `{ user: 'max@firma.de' }`. */
  readonly watermarkContext = input<WatermarkContext>({});
  readonly allowDownload = input(true);
  readonly allowPrint = input(true);
  /** Erlaubt den Download von Audio ohne Wasserzeichen, obwohl ein Wasserzeichen gesetzt ist. */
  readonly allowUnwatermarkedDownload = input(false);
  /**
   * Bietet für Word/PowerPoint zusätzlich einen PDF-Download an. Das PDF wird im Browser aus den
   * gerenderten Seiten erzeugt (kein Server, keine Office-Software) und trägt das Wasserzeichen fest im Seitenbild.
   * Für PDF-only: `allowDownload` auf `false` und dies auf `true` setzen.
   */
  readonly allowPdfDownload = input(true);
  /** Schutzmaßnahmen: Manipulationsschutz, Kontextmenü/Kopieren/Drag sperren, nativen Druck blockieren. */
  readonly protect = input(true);
  readonly toolbar = input(true);
  /** Startzoom: Zahl (1 = 100 %) oder `fit-width`. */
  readonly initialZoom = input<number | 'fit-width'>('fit-width');

  readonly loaded = output<DocViewerLoadedEvent>();
  readonly viewerError = output<Error>();
  readonly tamper = output<DocViewerTamperEvent>();
  readonly pageChange = output<number>();

  protected readonly labels = this.config.labels;
  protected readonly status = signal<ViewerStatus>('idle');
  protected readonly errorMessage = signal('');
  protected readonly doc = signal<LoadedDocument | null>(null);
  protected readonly pageCount = signal(0);
  protected readonly currentPage = signal(1);
  protected readonly zoom = signal(1);
  protected readonly fitWidth = signal(true);
  protected readonly busy = signal(false);
  protected readonly canRotate = signal(false);

  protected readonly kind = computed(() => this.doc()?.kind ?? null);
  protected readonly displayName = computed(() => this.fileName() ?? this.doc()?.fileName ?? '');
  protected readonly effectiveWatermark = computed<WatermarkConfig | null>(() => {
    const own = this.watermark();
    if (own === null) return null;
    const merged = { ...this.config.watermark, ...own };
    return hasWatermark(merged) ? merged : null;
  });
  protected readonly audioDownloadBlocked = computed(
    () => this.kind() === 'audio' && !!this.effectiveWatermark() && !this.allowUnwatermarkedDownload(),
  );
  protected readonly canDownload = computed(
    () => this.allowDownload() && this.status() === 'ready' && !this.busy() && !this.audioDownloadBlocked(),
  );
  protected readonly offerPdf = computed(() => this.allowPdfDownload() && (this.kind() === 'docx' || this.kind() === 'pptx'));
  protected readonly canDownloadPdf = computed(() => this.offerPdf() && this.status() === 'ready' && !this.busy());
  protected readonly canPrint = computed(
    () => this.allowPrint() && this.status() === 'ready' && !this.busy() && this.kind() !== 'audio',
  );
  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly scroll = viewChild.required<ElementRef<HTMLElement>>('scroll');

  private renderer: DocRenderer | null = null;
  private overlay: WatermarkOverlay | null = null;
  private tamperCount = 0;
  private loadId = 0;
  private watermarkId = 0;
  private destroyed = false;
  /** Seite, zu der zuletzt per API/Toolbar gesprungen wurde – hält die Anzeige stabil, solange sie sichtbar ist. */
  private navigatedPage: number | null = null;
  private abort: AbortController | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private overlayProtect = false;
  private watermarkReady: Promise<void> = Promise.resolve();

  constructor() {
    // Dokument laden, sobald sich Quelle oder Typ ändern
    afterRenderEffect(() => {
      const src = this.src();
      const type = this.type();
      const fileName = this.fileName();
      const init = this.requestInit();
      untracked(() => void this.load(src, type, fileName, init));
    });

    // Wasserzeichen-Ebene aktualisieren
    afterRenderEffect(() => {
      const config = this.effectiveWatermark();
      const context = this.watermarkContext();
      const protect = this.protect();
      untracked(() => void this.updateWatermark(config, context, protect));
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      // Laufende load()-Aufrufe verwerfen ihr Ergebnis, sobald sie die ID vergleichen.
      this.loadId++;
      this.watermarkId++;
      this.abort?.abort();
      this.renderer?.destroy();
      this.overlay?.destroy();
      this.resizeObserver?.disconnect();
    });
  }

  // ---------- Öffentliche API ----------

  goToPage(page: number): void {
    const target = this.renderer?.pages[page - 1];
    if (!target) return;
    // Nur im eigenen Scrollbereich scrollen – scrollIntoView würde auch die umgebende Seite bewegen.
    const scroll = this.scroll().nativeElement;
    const offset = target.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
    scroll.scrollTop += offset - PAGE_SCROLL_MARGIN;
    this.navigatedPage = page;
    this.setCurrentPage(page);
  }

  previousPage(): void {
    this.goToPage(Math.max(1, this.currentPage() - 1));
  }

  nextPage(): void {
    this.goToPage(Math.min(this.pageCount(), this.currentPage() + 1));
  }

  setZoom(zoom: number): void {
    this.fitWidth.set(false);
    this.applyZoom(zoom);
  }

  zoomIn(): void {
    this.setZoom(this.zoom() * ZOOM_STEP);
  }

  zoomOut(): void {
    this.setZoom(this.zoom() / ZOOM_STEP);
  }

  fitToWidth(): void {
    this.fitWidth.set(true);
    this.applyZoom(this.computeFitZoom());
  }

  rotate(): void {
    this.renderer?.rotate?.();
    if (this.fitWidth()) this.applyZoom(this.computeFitZoom());
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.host.requestFullscreen?.();
  }

  /** Lädt die Datei herunter – mit eingebranntem Wasserzeichen, falls konfiguriert. */
  async download(): Promise<void> {
    const doc = this.doc();
    if (!doc || !this.canDownload()) return;
    await this.withBusy(async () => {
      const wm = this.effectiveWatermark();
      const blob = wm
        ? doc.kind === 'audio'
          ? new Blob([doc.data], { type: doc.mimeType })
          : await exportWithWatermark(doc, this.tileSource(wm))
        : new Blob([doc.data], { type: doc.mimeType });
      saveBlob(blob, this.displayName() || doc.fileName);
    });
  }

  /**
   * Erzeugt das Dokument als PDF mit eingebranntem Wasserzeichen – vollständig im Browser.
   * DOCX/PPTX: aus den gerenderten Seiten; PDF: Original mit Wasserzeichen. Andere Typen: `DocViewerError('pdfUnavailable')`.
   */
  async exportPdf(): Promise<Blob> {
    const doc = this.doc();
    const renderer = this.renderer;
    if (!doc || !renderer || this.status() !== 'ready') throw new DocViewerError('pdfUnavailable');
    const wm = this.effectiveWatermark();
    if (doc.kind === 'pdf') return wm ? exportWithWatermark(doc, this.tileSource(wm)) : new Blob([doc.data], { type: 'application/pdf' });
    if ((doc.kind !== 'docx' && doc.kind !== 'pptx') || !renderer.printContent) throw new DocViewerError('pdfUnavailable');
    const content = await renderer.printContent();
    if (content.kind !== 'html') throw new DocViewerError('pdfUnavailable');
    const bytes = await exportHtmlToPdf(content, {
      title: this.displayName() || doc.fileName,
      getTile: wm ? this.tileSource(wm) : null,
      signal: this.abort?.signal,
    });
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  }

  /** Lädt Word/PowerPoint als im Browser erzeugtes PDF herunter. */
  async downloadPdf(): Promise<void> {
    if (!this.canDownloadPdf()) return;
    const name = (this.displayName() || this.doc()?.fileName || 'dokument').replace(/\.[^./\\]+$/, '');
    await this.withBusy(async () => saveBlob(await this.exportPdf(), `${name}.pdf`));
  }

  /** Druckt das Dokument mit Wasserzeichen. */
  async print(): Promise<void> {
    const renderer = this.renderer;
    if (!renderer?.printContent || !this.canPrint()) return;
    await this.withBusy(async () => {
      const wm = this.effectiveWatermark();
      await printWithWatermark(await renderer.printContent!(), wm ? this.tileSource(wm) : null, this.displayName());
    });
  }

  // ---------- Template-Handler ----------

  protected onBlockedEvent(event: Event): void {
    if (this.protect()) event.preventDefault();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.protect() || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'p' && key !== 's') return;
    // Nur wenn der Viewer ein Dokument zeigt und den Fokus hat – die übrige App bleibt unberührt.
    // Der native Druck der Seite blendet den Viewer ohnehin per @media print aus.
    if (this.status() !== 'ready' || !this.host.contains(document.activeElement)) return;
    event.preventDefault();
    if (key === 'p') void this.print();
    else void this.download();
  }

  protected onScroll(): void {
    const pages = this.renderer?.pages ?? [];
    if (pages.length < 2) return;
    const box = this.scroll().nativeElement.getBoundingClientRect();
    // Nach einem Sprung bleibt die Zielseite aktuell, solange ihr Anfang sichtbar ist
    // (z. B. letzte Seite, die sich nicht bis ganz nach oben scrollen lässt).
    if (this.navigatedPage !== null) {
      const top = pages[this.navigatedPage - 1]?.getBoundingClientRect().top ?? -Infinity;
      if (top >= box.top - 1 && top < box.bottom) return;
      this.navigatedPage = null;
    }
    // Binäre Suche: erste Seite, deren Unterkante unter der Leselinie liegt (Seiten sind vertikal sortiert).
    const line = box.top + box.height * 0.3;
    let lo = 0;
    let hi = pages.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pages[mid].getBoundingClientRect().bottom > line) hi = mid;
      else lo = mid + 1;
    }
    this.setCurrentPage(lo + 1);
  }

  protected onPageInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const page = Math.round(Number(input.value));
    if (page >= 1 && page <= this.pageCount()) this.goToPage(page);
    else input.value = String(this.currentPage());
  }

  // ---------- Intern ----------

  private setCurrentPage(page: number): void {
    if (page === this.currentPage()) return;
    this.currentPage.set(page);
    this.pageChange.emit(page);
  }

  private async load(src: DocSource | null | undefined, type: DocumentKind | 'auto', fileName: string | undefined, init?: RequestInit): Promise<void> {
    // Eine Sperre nach Manipulation gilt für die Lebensdauer des Viewers – auch ein Quellwechsel hebt sie nicht auf.
    if (this.status() === 'locked' || this.destroyed) return;
    const id = ++this.loadId;
    this.abort?.abort();
    this.renderer?.destroy();
    this.renderer = null;
    this.doc.set(null);
    this.pageCount.set(0);
    this.currentPage.set(1);
    this.navigatedPage = null;
    this.canRotate.set(false);
    const scroll = this.scroll().nativeElement;
    scroll.querySelectorAll(':scope > .sy-content').forEach((el) => el.remove());
    if (!src) {
      this.status.set('idle');
      return;
    }

    const abort = (this.abort = new AbortController());
    // Veraltet: neuer Ladevorgang, Viewer zerstört oder gesperrt (clearContent bricht ab).
    const stale = () => id !== this.loadId || abort.signal.aborted;
    this.status.set('loading');
    try {
      const source = await loadSource(src, init, abort.signal);
      if (stale()) return;
      const name = fileName ?? source.fileName ?? 'dokument';
      const detected = detectDocumentType({
        explicit: type,
        mimeType: source.mimeType,
        fileName: name,
        bytes: new Uint8Array(source.data, 0, Math.min(source.data.byteLength, 4096)),
      });
      const doc: LoadedDocument = { ...detected, data: source.data, fileName: name };
      // Inhalt erst zeigen, wenn das Wasserzeichen bereitsteht.
      await this.watermarkReady;
      if (stale()) return;

      const host = document.createElement('div');
      host.className = 'sy-content';
      scroll.appendChild(host);
      const renderer = await createRenderer(doc.kind, { host, scrollContainer: scroll, doc, config: this.config, signal: abort.signal });
      if (stale()) return renderer.destroy();
      this.renderer = renderer;
      await renderer.render();
      if (stale()) return;

      this.doc.set(doc);
      this.pageCount.set(renderer.pages.length);
      this.canRotate.set(!!renderer.rotate);
      const initial = this.initialZoom();
      this.fitWidth.set(initial === 'fit-width');
      this.applyZoom(initial === 'fit-width' ? this.computeFitZoom() : initial);
      this.observeResize();
      scroll.scrollTop = 0;
      this.status.set('ready');
      this.loaded.emit({ kind: doc.kind, fileName: name, pageCount: renderer.pages.length });
    } catch (e) {
      if (stale()) return;
      this.clearContent();
      this.fail(e);
    }
  }

  private applyZoom(zoom: number): void {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.zoom.set(z);
    this.renderer?.setZoom(z);
  }

  private computeFitZoom(): number {
    const width = this.renderer?.contentWidth ?? 0;
    if (!width) return 1;
    const available = this.scroll().nativeElement.clientWidth - SCROLL_PADDING;
    // Kleine Inhalte (z. B. Bilder) nicht über 100 % vergrößern
    const fit = available / width;
    return this.kind() === 'image' ? Math.min(1, fit) : fit;
  }

  private observeResize(): void {
    if (this.resizeObserver) return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.fitWidth() && this.status() === 'ready') this.applyZoom(this.computeFitZoom());
    });
    this.resizeObserver.observe(this.scroll().nativeElement);
  }

  private updateWatermark(config: WatermarkConfig | null, context: WatermarkContext, protect: boolean): void {
    if (!this.overlay || this.overlayProtect !== protect) {
      this.overlay?.destroy();
      this.overlayProtect = protect;
      this.overlay = new WatermarkOverlay(this.stage().nativeElement, {
        protect,
        onTamper: (reason) => this.onTamper(reason),
      });
    }
    const overlay = this.overlay;
    // Ändert sich das Wasserzeichen erneut, bevor die Kachel fertig ist, gewinnt immer die neueste Konfiguration.
    const id = ++this.watermarkId;
    this.watermarkReady = (async () => {
      const tile = config ? await rasterizeWatermark(config, context, { locale: this.config.locale }) : null;
      if (id === this.watermarkId) overlay.setTile(tile);
    })();
    this.watermarkReady.catch((e: unknown) => {
      if (id !== this.watermarkId) return;
      // Ist ein Wasserzeichen konfiguriert, aber nicht darstellbar, wird der Inhalt nicht angezeigt.
      if (this.status() !== 'ready') return; // load() behandelt den Fehler selbst
      this.clearContent();
      this.fail(e);
    });
  }

  private clearContent(): void {
    this.abort?.abort();
    this.renderer?.destroy();
    this.renderer = null;
    this.scroll().nativeElement.querySelectorAll(':scope > .sy-content').forEach((el) => el.remove());
    this.doc.set(null);
  }

  private fail(e: unknown): void {
    const err = toError(e);
    this.errorMessage.set(this.messageFor(err));
    this.status.set('error');
    this.viewerError.emit(err);
  }

  private messageFor(err: Error): string {
    return err instanceof DocViewerError ? formatErrorMessage(this.labels.errors[err.code], err.params) : err.message;
  }

  private onTamper(reason: TamperReason): void {
    this.tamperCount++;
    const locked = this.tamperCount >= this.config.tamperThreshold;
    if (locked && this.status() !== 'locked') {
      this.clearContent();
      this.status.set('locked');
    }
    this.tamper.emit({ reason, count: this.tamperCount, locked });
  }

  /** Kachel-Quelle für Export und Druck: rendert je benötigter Auflösung einmal. */
  private tileSource(config: WatermarkConfig): WatermarkTileSource {
    const context = this.watermarkContext();
    const cache = new Map<number, Promise<WatermarkTile>>();
    return (minScale) => {
      // Auf halbe Schritte runden, damit Seiten ähnlicher Größe dieselbe Kachel nutzen.
      const scale = Math.max(1, Math.ceil(minScale * 2) / 2);
      let tile = cache.get(scale);
      if (!tile) cache.set(scale, (tile = rasterizeWatermark(config, context, { scale, locale: this.config.locale })));
      return tile;
    };
  }

  private async withBusy(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await task();
    } catch (e) {
      if (!this.destroyed) this.viewerError.emit(toError(e));
    } finally {
      this.busy.set(false);
    }
  }
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
