import { DocRenderer, RenderContext } from '../core/renderer';
import { DocumentKind } from '../core/types';

/** Lädt den passenden Renderer lazy – Libraries werden nur bei Bedarf nachgeladen. */
export async function createRenderer(kind: DocumentKind, ctx: RenderContext): Promise<DocRenderer> {
  switch (kind) {
    case 'pdf':
      return new (await import('./pdf.renderer')).PdfRenderer(ctx);
    case 'docx':
      return new (await import('./docx.renderer')).DocxRenderer(ctx);
    case 'pptx':
      return new (await import('./pptx.renderer')).PptxRenderer(ctx);
    case 'image':
      return new (await import('./image.renderer')).ImageRenderer(ctx);
    case 'audio':
      return new (await import('./audio.renderer')).AudioRenderer(ctx);
  }
}
