import { DocRenderer, PrintContent, RenderContext } from '../core/renderer';

/** Zeigt JPG/PNG mit Zoom und Drehung an. */
export class ImageRenderer implements DocRenderer {
  pages: HTMLElement[] = [];
  contentWidth = 0;

  private url = '';
  private img = new Image();
  private frame = document.createElement('div');
  private zoom = 1;
  private rotation = 0;

  constructor(private readonly ctx: RenderContext) {}

  async render(): Promise<void> {
    this.url = URL.createObjectURL(new Blob([this.ctx.doc.data], { type: this.ctx.doc.mimeType }));
    this.img.alt = this.ctx.doc.fileName;
    this.img.draggable = false;
    this.img.src = this.url;
    await this.img.decode();
    this.frame.className = 'sy-page sy-image-page';
    this.frame.style.position = 'relative';
    this.img.style.position = 'absolute';
    this.img.style.left = '50%';
    this.img.style.top = '50%';
    this.frame.appendChild(this.img);
    this.ctx.host.appendChild(this.frame);
    this.pages = [this.frame];
    this.layout();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.layout();
  }

  rotate(): void {
    this.rotation = (this.rotation + 90) % 360;
    this.layout();
  }

  async printContent(): Promise<PrintContent> {
    return { kind: 'images', images: [new Blob([this.ctx.doc.data], { type: this.ctx.doc.mimeType })] };
  }

  destroy(): void {
    URL.revokeObjectURL(this.url);
  }

  private layout(): void {
    const w = this.img.naturalWidth * this.zoom;
    const h = this.img.naturalHeight * this.zoom;
    const sideways = this.rotation % 180 !== 0;
    this.contentWidth = sideways ? this.img.naturalHeight : this.img.naturalWidth;
    this.frame.style.width = `${sideways ? h : w}px`;
    this.frame.style.height = `${sideways ? w : h}px`;
    this.img.style.width = `${w}px`;
    this.img.style.height = `${h}px`;
    this.img.style.transform = `translate(-50%, -50%) rotate(${this.rotation}deg)`;
  }
}
