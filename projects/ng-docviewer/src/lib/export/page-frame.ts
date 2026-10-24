import { DOCUMENT_TYPOGRAPHY } from '../core/document-style';
import { PrintContent } from '../core/renderer';

export type HtmlPageContent = Extract<PrintContent, { kind: 'html' }>;

/** Grundlayout der Seiten im iframe – gemeinsam für Druck und PDF-Erzeugung. */
const BASE_CSS = `
  html, body { margin: 0; padding: 0; background: #fff; }
  body { ${DOCUMENT_TYPOGRAPHY} }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sy-print-page { position: relative; overflow: hidden; margin: 0 auto; }
  /* Eigener Formatierungskontext: Ränder des Inhalts dürfen nicht aus der Seite herauskollabieren (Seitengröße). */
  .sy-print-page > * { display: flow-root; }
  .sy-print-page > img { display: block; width: 100%; height: auto; }
`;

export interface PageFrame {
  readonly win: Window;
  readonly doc: Document;
  destroy(): void;
}

/**
 * Legt ein iframe mit eigenem Dokument an, in dem Seiten außerhalb des Shadow-Roots und
 * unabhängig vom Zoom des Viewers gelayoutet werden.
 * `frameStyle` bestimmt, wie das iframe versteckt wird (Druck: 0×0, Rastern: außerhalb des Bildschirms).
 */
export function createPageFrame(title: string, css: string, frameStyle: string): PageFrame {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  iframe.style.cssText = frameStyle;
  document.body.appendChild(iframe);
  const win = iframe.contentWindow!;
  const doc = win.document;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  doc.close();
  doc.title = title;
  // Gleiche Sprache wie die Seite → gleiche Silbentrennung (hyphens: auto) wie in der Anzeige.
  if (document.documentElement.lang) doc.documentElement.lang = document.documentElement.lang;
  const style = doc.createElement('style');
  style.textContent = BASE_CSS + css;
  doc.head.appendChild(style);
  return { win, doc, destroy: () => iframe.remove() };
}

/** Übernimmt die HTML-Seiten des Renderers (je Seite ein `.sy-print-page`-Container). */
export function appendHtmlPages(doc: Document, content: HtmlPageContent, decorate?: (page: HTMLElement) => void): HTMLElement[] {
  return content.pages.map((source) => {
    const page = doc.createElement('div');
    page.className = 'sy-print-page';
    // Auch direkt an der Seite: beim Rastern wird nur dieser Knoten übernommen, nicht <html lang>.
    if (doc.documentElement.lang) page.lang = doc.documentElement.lang;
    page.style.width = source.style.width;
    page.appendChild(doc.importNode(source, true));
    decorate?.(page);
    doc.body.appendChild(page);
    return page;
  });
}

/** Wartet, bis Bilder dekodiert und Schriften geladen sind. */
export async function waitForContent(doc: Document): Promise<void> {
  await Promise.all(Array.from(doc.images, (img) => img.decode().catch(() => undefined)));
  await doc.fonts?.ready;
}
