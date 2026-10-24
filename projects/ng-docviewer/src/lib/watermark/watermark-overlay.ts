import { WatermarkTile } from './watermark-rasterizer';

export type TamperReason = 'removed' | 'modified' | 'hidden';

export interface WatermarkOverlayOptions {
  /** Manipulationen erkennen und rückgängig machen. */
  protect: boolean;
  /** Wird bei jeder erkannten Manipulation aufgerufen. */
  onTamper?: (reason: TamperReason) => void;
  /** Intervall der Style-Prüfung in ms. */
  checkInterval?: number;
}

/**
 * Legt das Wasserzeichen als Ebene über einen Container. Mit `protect` wird die Ebene
 * per MutationObserver und periodischer Style-Prüfung gegen Entfernen/Ausblenden geschützt.
 *
 * Hinweis: Das ist Abschreckung, kein DRM – wer den Quellcode der Seite kontrolliert,
 * kann jeden clientseitigen Schutz umgehen.
 */
export class WatermarkOverlay {
  private element: HTMLElement | null = null;
  private tile: WatermarkTile | null = null;
  private dataUrl = '';
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  // Zufälliges Attribut, damit die Ebene nicht per statischem CSS-Selektor ausgeblendet werden kann.
  private readonly marker = `data-w${Math.random().toString(36).slice(2, 10)}`;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: WatermarkOverlayOptions,
  ) {}

  setTile(tile: WatermarkTile | null): void {
    this.tile = tile;
    this.dataUrl = tile ? tile.canvas.toDataURL('image/png') : '';
    if (!tile) {
      this.stopGuard();
      this.element?.remove();
      this.element = null;
      return;
    }
    this.mount();
    if (this.options.protect) this.startGuard();
  }

  destroy(): void {
    this.stopGuard();
    this.element?.remove();
    this.element = null;
  }

  private mount(): void {
    const el = this.element?.isConnected ? this.element : document.createElement('div');
    el.setAttribute(this.marker, '');
    el.setAttribute('aria-hidden', 'true');
    el.removeAttribute('class');
    el.removeAttribute('hidden');
    el.style.cssText = '';
    for (const [prop, value] of Object.entries(this.styles())) {
      el.style.setProperty(prop, value, 'important');
    }
    // Immer als letztes Kind, damit die Ebene über dem Inhalt liegt.
    if (el.parentNode !== this.container || el !== this.container.lastElementChild) {
      this.container.appendChild(el);
    }
    if (this.element !== el) this.observer?.observe(el, { attributes: true });
    this.element = el;
    // Eigene Mutationen nicht als Manipulation werten.
    this.observer?.takeRecords();
  }

  private styles(): Record<string, string> {
    const tile = this.tile!;
    return {
      position: 'absolute',
      inset: '0',
      width: 'auto',
      height: 'auto',
      'max-width': 'none',
      'max-height': 'none',
      // Verschieben/Verkleinern per Stylesheet (margin, padding, border) gar nicht erst zulassen.
      margin: '0',
      padding: '0',
      border: '0',
      'box-sizing': 'border-box',
      'offset-path': 'none',
      'position-area': 'none',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      'pointer-events': 'none',
      'z-index': '2147483646',
      'background-image': `url("${this.dataUrl}")`,
      'background-size': `${tile.width}px ${tile.height}px`,
      'background-repeat': tile.layout === 'center' ? 'no-repeat' : 'repeat',
      'background-position': tile.layout === 'center' ? 'center' : '0 0',
      'background-clip': 'border-box',
      'background-origin': 'padding-box',
      transform: 'none',
      scale: 'none',
      rotate: 'none',
      translate: 'none',
      zoom: '1',
      'content-visibility': 'visible',
      mask: 'none',
      filter: 'none',
      'clip-path': 'none',
      'mix-blend-mode': 'normal',
      'print-color-adjust': 'exact',
      '-webkit-print-color-adjust': 'exact',
    };
  }

  private startGuard(): void {
    if (this.observer) return;
    this.observer = new MutationObserver((records) => {
      if (!this.element) return;
      const removed = !this.element.isConnected || this.element.parentNode !== this.container;
      const modified = records.some((r) => r.type === 'attributes' && r.target === this.element);
      const coveredByLaterSibling = this.container.lastElementChild !== this.element;
      if (removed || modified || coveredByLaterSibling) {
        this.restore(removed ? 'removed' : 'modified');
      }
    });
    this.observer.observe(this.container, { childList: true });
    if (this.element) this.observer.observe(this.element, { attributes: true });
    this.timer = setInterval(() => this.check(), this.options.checkInterval ?? 1000);
  }

  private stopGuard(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Prüft die tatsächlich wirksamen Styles (z. B. Manipulation über Stylesheets). */
  private check(): void {
    const el = this.element;
    if (!el || !this.tile) return;
    if (!el.isConnected) return this.restore('removed');
    const cs = getComputedStyle(el);
    const hidden =
      cs.display === 'none' ||
      cs.visibility !== 'visible' ||
      parseFloat(cs.opacity) < 1 ||
      !cs.backgroundImage.includes('data:image/png') ||
      cs.contentVisibility === 'hidden';
    // Ebene muss den Container exakt abdecken (erkennt Verschieben/Verkleinern über Stylesheets).
    const rect = el.getBoundingClientRect();
    const host = this.container.getBoundingClientRect();
    const displaced =
      host.width > 0 &&
      host.height > 0 &&
      (Math.abs(rect.left - host.left) > 1 || Math.abs(rect.top - host.top) > 1 || rect.width < host.width - 1 || rect.height < host.height - 1);
    if (hidden || displaced) this.restore('hidden');
  }

  private restore(reason: TamperReason): void {
    if (reason === 'removed' || !this.element?.isConnected) {
      this.element = null;
    }
    this.mount();
    this.options.onTamper?.(reason);
  }
}
