import { DocRenderer, PrintContent, RenderContext } from '../core/renderer';
import { sanitizeCss, sanitizeTree } from '../core/sanitize';
import { DOCUMENT_TYPOGRAPHY } from '../core/document-style';
import { ShadowHtmlRenderer } from './shadow';

const BASE_CSS = `
  :host { display: block; ${DOCUMENT_TYPOGRAPHY} }
  .sy-body { display: flex; flex-direction: column; align-items: center; }
  .docx-wrapper { background: transparent !important; padding: 0 !important; display: flex; flex-direction: column; align-items: center; gap: var(--sy-page-gap, 16px); }
  .docx-wrapper > section.docx { margin: 0 !important; box-shadow: var(--sy-page-shadow, 0 1px 4px rgba(0,0,0,.25)) !important; }
  /* docx-preview rendert frei positionierte Bilder (wrapNone) als 0×0-inline-block; ohne dies würde
     deren Baseline die Zeile auf Bildhöhe aufblähen (z. B. Wasserzeichen in Kopfzeilen). */
  div[style*="width: 0px; height: 0px"][style*="position: relative"] { vertical-align: top !important; }
`;

/** Rendert Word-Dokumente (DOCX) per docx-preview. */
export class DocxRenderer extends ShadowHtmlRenderer implements DocRenderer {
  constructor(private readonly ctx: RenderContext) {
    super(ctx.host, BASE_CSS);
  }

  async render(): Promise<void> {
    const { renderAsync } = await import('docx-preview');
    // Erst außerhalb des Dokuments rendern und bereinigen, dann anzeigen.
    const staging = document.createElement('div');
    const styleContainer = document.createElement('div');
    await renderAsync(this.ctx.doc.data.slice(0), staging, styleContainer, {
      className: 'docx',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderComments: false,
      renderChanges: false,
      useBase64URL: true,
      hideWrapperOnPrint: false,
    });
    sanitizeTree(staging);
    for (const style of Array.from(styleContainer.querySelectorAll('style'))) {
      style.textContent = sanitizeCss(style.textContent ?? '');
    }
    const styles = Array.from(styleContainer.querySelectorAll('style'));
    this.body.before(...styles);
    this.body.append(...Array.from(staging.childNodes));
    this.pages = Array.from(this.body.querySelectorAll<HTMLElement>('section.docx'));
    this.contentWidth = Math.max(0, ...this.pages.map((p) => p.offsetWidth));
  }

  async printContent(): Promise<PrintContent> {
    return {
      kind: 'html',
      css: this.collectCss() + '\nsection.docx { margin: 0 !important; box-shadow: none !important; }',
      pages: this.pages.map((p) => p.cloneNode(true) as HTMLElement),
    };
  }
}
