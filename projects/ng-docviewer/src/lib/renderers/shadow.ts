/** Gemeinsame Basis für HTML-basierte Renderer (DOCX, PPTX): Inhalt isoliert in einem Shadow-Root. */
export abstract class ShadowHtmlRenderer {
  pages: HTMLElement[] = [];
  contentWidth = 0;
  protected readonly root: ShadowRoot;
  protected readonly body: HTMLElement;

  constructor(host: HTMLElement, baseCss: string) {
    this.root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = baseCss;
    this.body = document.createElement('div');
    this.body.className = 'sy-body';
    this.root.append(style, this.body);
  }

  setZoom(zoom: number): void {
    this.body.style.zoom = String(zoom);
  }

  /** Alle Styles des Shadow-Roots – für den Druck. */
  protected collectCss(): string {
    return Array.from(this.root.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
  }

  destroy(): void {
    this.root.replaceChildren();
  }
}
