import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { DOC_VIEWER_LABELS_DE, DOC_VIEWER_LABELS_EN, provideDocViewer } from '@swipergy/ng-docviewer';
import { LANG, LOCALE } from './i18n';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideDocViewer({
      // Resolved against <base href>, so the demo also works from a subfolder of a webspace.
      pdfWorkerSrc: new URL('pdf.worker.min.mjs', document.baseURI).href,
      labels: LANG === 'de' ? DOC_VIEWER_LABELS_DE : DOC_VIEWER_LABELS_EN,
      locale: LOCALE,
    }),
  ],
};
