import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { DOC_VIEWER_LABELS_DE, DocViewerLabels } from './i18n';
import { WatermarkConfig } from './watermark/watermark.model';

export interface DocViewerConfig {
  /**
   * URL des pdf.js-Workers oder Factory, die einen Worker liefert.
   * Standard: `/pdf.worker.min.mjs` (per `angular.json`-Asset aus `pdfjs-dist/build` kopieren).
   */
  pdfWorkerSrc: string | (() => Worker);
  /** Standard-Wasserzeichen, wird mit dem `watermark`-Input zusammengeführt. */
  watermark?: WatermarkConfig;
  /** Beschriftungen der Oberfläche. Standard: Deutsch. */
  labels: DocViewerLabels;
  /** Locale für `{date}`/`{time}`. Standard: Browser-Locale. */
  locale?: string;
  /** Ab so vielen erkannten Manipulationen wird der Inhalt gesperrt. Standard: 3. */
  tamperThreshold: number;
}

export const DEFAULT_DOC_VIEWER_CONFIG: DocViewerConfig = {
  pdfWorkerSrc: '/pdf.worker.min.mjs',
  labels: DOC_VIEWER_LABELS_DE,
  tamperThreshold: 3,
};

export const DOC_VIEWER_CONFIG = new InjectionToken<DocViewerConfig>('DOC_VIEWER_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_DOC_VIEWER_CONFIG,
});

export type DocViewerOptions = Partial<Omit<DocViewerConfig, 'labels'>> & {
  labels?: Partial<Omit<DocViewerLabels, 'errors'>> & { errors?: Partial<DocViewerLabels['errors']> };
};

/** Globale Konfiguration des Viewers, z. B. in `app.config.ts`. */
export function provideDocViewer(options: DocViewerOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: DOC_VIEWER_CONFIG,
      useValue: {
        ...DEFAULT_DOC_VIEWER_CONFIG,
        ...options,
        labels: {
          ...DEFAULT_DOC_VIEWER_CONFIG.labels,
          ...options.labels,
          errors: { ...DEFAULT_DOC_VIEWER_CONFIG.labels.errors, ...options.labels?.errors },
        },
      } satisfies DocViewerConfig,
    },
  ]);
}
