/** Fehlerarten des Viewers; die Anzeige-Texte kommen aus `DocViewerLabels.errors`. */
export type DocViewerErrorCode =
  | 'loadFailed'
  | 'unsupportedFormat'
  | 'audioUnsupported'
  | 'audioNoWatermark'
  | 'encryptedPdf'
  | 'passwordProtected'
  | 'watermarkImage'
  | 'canvasExport'
  | 'pdfUnavailable';

/** Fehler mit Code und Parametern, damit die Meldung übersetzt angezeigt werden kann. */
export class DocViewerError extends Error {
  override readonly name = 'DocViewerError';

  constructor(
    readonly code: DocViewerErrorCode,
    readonly params: Record<string, string | number> = {},
    options?: ErrorOptions,
  ) {
    super(`${code}${Object.keys(params).length ? ` ${JSON.stringify(params)}` : ''}`, options);
  }
}

/** Setzt `{name}`-Parameter in einen Meldungstext ein. */
export function formatErrorMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}
