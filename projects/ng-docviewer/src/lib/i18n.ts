import { DocViewerErrorCode } from './core/errors';

export interface DocViewerLabels {
  loading: string;
  error: string;
  previousPage: string;
  nextPage: string;
  page: string;
  zoomIn: string;
  zoomOut: string;
  fitWidth: string;
  rotate: string;
  fullscreen: string;
  download: string;
  print: string;
  printBlocked: string;
  tampered: string;
  audioDownloadDisabled: string;
  downloadPdf: string;
  /** Fehlermeldungen; `{param}` wird durch Werte des Fehlers ersetzt (z. B. `{status}`, `{fileName}`). */
  errors: Record<DocViewerErrorCode, string>;
}

export const DOC_VIEWER_LABELS_DE: DocViewerLabels = {
  loading: 'Dokument wird geladen …',
  error: 'Das Dokument konnte nicht angezeigt werden.',
  previousPage: 'Vorherige Seite',
  nextPage: 'Nächste Seite',
  page: 'Seite',
  zoomIn: 'Vergrößern',
  zoomOut: 'Verkleinern',
  fitWidth: 'An Breite anpassen',
  rotate: 'Drehen',
  fullscreen: 'Vollbild',
  download: 'Herunterladen',
  print: 'Drucken',
  printBlocked: 'Bitte die Druckfunktion des Viewers verwenden.',
  tampered: 'Die Anzeige wurde aufgrund einer Manipulation des Wasserzeichens gesperrt.',
  audioDownloadDisabled: 'Download nicht verfügbar: Audiodateien können kein Wasserzeichen tragen.',
  downloadPdf: 'Als PDF herunterladen',
  errors: {
    loadFailed: 'Dokument konnte nicht geladen werden (HTTP {status}).',
    unsupportedFormat: 'Nicht unterstütztes Dateiformat: {fileName}',
    audioUnsupported: 'Das Audioformat wird vom Browser nicht unterstützt.',
    audioNoWatermark: 'Audiodateien können kein Wasserzeichen tragen.',
    encryptedPdf: 'Verschlüsselte PDFs (auch mit reinem Berechtigungsschutz) können nicht mit Wasserzeichen exportiert werden.',
    passwordProtected: 'Das Dokument ist passwortgeschützt.',
    watermarkImage: 'Wasserzeichen-Bild konnte nicht geladen werden: {src}',
    canvasExport: 'Das Bild konnte nicht erzeugt werden.',
    pdfUnavailable: 'Für diesen Dokumenttyp kann kein PDF erzeugt werden.',
  },
};

export const DOC_VIEWER_LABELS_EN: DocViewerLabels = {
  loading: 'Loading document …',
  error: 'The document could not be displayed.',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  page: 'Page',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitWidth: 'Fit to width',
  rotate: 'Rotate',
  fullscreen: 'Fullscreen',
  download: 'Download',
  print: 'Print',
  printBlocked: 'Please use the viewer’s print function.',
  tampered: 'The view has been locked because the watermark was tampered with.',
  audioDownloadDisabled: 'Download unavailable: audio files cannot carry a watermark.',
  downloadPdf: 'Download as PDF',
  errors: {
    loadFailed: 'The document could not be loaded (HTTP {status}).',
    unsupportedFormat: 'Unsupported file format: {fileName}',
    audioUnsupported: 'This audio format is not supported by the browser.',
    audioNoWatermark: 'Audio files cannot carry a watermark.',
    encryptedPdf: 'Encrypted PDFs (including permission-only protection) cannot be exported with a watermark.',
    passwordProtected: 'The document is password protected.',
    watermarkImage: 'The watermark image could not be loaded: {src}',
    canvasExport: 'The image could not be generated.',
    pdfUnavailable: 'A PDF cannot be generated for this document type.',
  },
};
