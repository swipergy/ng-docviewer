/*
 * Public API Surface of @swipergy/ng-docviewer
 */
export { DocViewer } from './lib/doc-viewer';
export type { DocViewerLoadedEvent, DocViewerTamperEvent, ViewerStatus } from './lib/doc-viewer';
export { provideDocViewer, DOC_VIEWER_CONFIG, DEFAULT_DOC_VIEWER_CONFIG } from './lib/config';
export type { DocViewerConfig, DocViewerOptions } from './lib/config';
export { DOC_VIEWER_LABELS_DE, DOC_VIEWER_LABELS_EN } from './lib/i18n';
export type { DocViewerLabels } from './lib/i18n';
export type { DocSource, DocumentKind } from './lib/core/types';
export type { WatermarkConfig, WatermarkContext } from './lib/watermark/watermark.model';
export type { TamperReason } from './lib/watermark/watermark-overlay';
export { DocViewerError } from './lib/core/errors';
export type { DocViewerErrorCode } from './lib/core/errors';
export { detectDocumentType } from './lib/core/type-detector';
export { resolvePlaceholders } from './lib/watermark/placeholder';
