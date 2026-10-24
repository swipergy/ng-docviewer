import { DocViewerError } from '../core/errors';
import { DocRenderer, RenderContext } from '../core/renderer';

/**
 * So lange wird höchstens auf die Metadaten gewartet. iOS Safari ignoriert `preload` und lädt
 * erst beim Abspielen – dort käme `loadedmetadata` nie, der Player muss trotzdem erscheinen.
 */
const METADATA_TIMEOUT = 1500;

const ICON = `<svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>`;

/** Audio-Wiedergabe über das native Element, ohne Download-Option in den Controls. */
export class AudioRenderer implements DocRenderer {
  pages: HTMLElement[] = [];
  contentWidth = 480;

  private url = '';
  private audio = document.createElement('audio');

  constructor(private readonly ctx: RenderContext) {}

  async render(): Promise<void> {
    this.url = URL.createObjectURL(new Blob([this.ctx.doc.data], { type: this.ctx.doc.mimeType }));
    const card = document.createElement('div');
    card.className = 'sy-audio';
    const icon = document.createElement('div');
    icon.className = 'sy-audio-icon';
    icon.innerHTML = ICON;
    const title = document.createElement('div');
    title.className = 'sy-audio-title';
    title.textContent = this.ctx.doc.fileName;
    this.audio.controls = true;
    this.audio.preload = 'metadata';
    this.audio.setAttribute('controlslist', 'nodownload noplaybackrate');
    this.audio.src = this.url;
    card.append(icon, title, this.audio);
    this.ctx.host.appendChild(card);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, METADATA_TIMEOUT);
      this.audio.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      this.audio.onerror = () => {
        clearTimeout(timer);
        reject(new DocViewerError('audioUnsupported'));
      };
    });
  }

  setZoom(): void {
    // Kein Zoom für Audio
  }

  destroy(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    URL.revokeObjectURL(this.url);
  }
}
