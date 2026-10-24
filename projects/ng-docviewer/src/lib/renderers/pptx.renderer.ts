import { DocRenderer, PrintContent, RenderContext } from '../core/renderer';
import { sanitizeHtml } from '../core/sanitize';
import { readSlideSize } from '../export/ooxml';
import { DOCUMENT_TYPOGRAPHY } from '../core/document-style';
import { ShadowHtmlRenderer } from './shadow';

const SLIDE_WIDTH = 960;

const BASE_CSS = `
  :host { display: block; ${DOCUMENT_TYPOGRAPHY} }
  .sy-body { display: flex; flex-direction: column; align-items: center; gap: var(--sy-page-gap, 16px); }
  .sy-slide { position: relative; overflow: hidden; background: #fff; box-shadow: var(--sy-page-shadow, 0 1px 4px rgba(0,0,0,.25)); }
`;

/** Rendert PowerPoint-Präsentationen (PPTX) per pptx-to-html. */
export class PptxRenderer extends ShadowHtmlRenderer implements DocRenderer {
  constructor(private readonly ctx: RenderContext) {
    super(ctx.host, BASE_CSS);
  }

  async render(): Promise<void> {
    const [{ pptxToHtml }, { default: JSZip }] = await Promise.all([import('@jvmr/pptx-to-html'), import('jszip')]);
    const size = await readSlideSize(await JSZip.loadAsync(this.ctx.doc.data));
    const width = SLIDE_WIDTH;
    const height = Math.round((SLIDE_WIDTH * size.cy) / size.cx);
    const slides = await pptxToHtml(this.ctx.doc.data.slice(0), { width, height, scaleToFit: true, letterbox: false });
    this.pages = slides.map((html) => {
      const slide = document.createElement('div');
      slide.className = 'sy-page sy-slide';
      slide.style.width = `${width}px`;
      slide.style.height = `${height}px`;
      slide.appendChild(sanitizeHtml(html));
      this.body.appendChild(slide);
      return slide;
    });
    this.contentWidth = width;
  }

  async printContent(): Promise<PrintContent> {
    return {
      kind: 'html',
      css: BASE_CSS + '\n.sy-slide { box-shadow: none; }',
      pages: this.pages.map((p) => p.cloneNode(true) as HTMLElement),
      landscape: this.pages[0] ? this.pages[0].offsetWidth >= this.pages[0].offsetHeight : true,
    };
  }
}

