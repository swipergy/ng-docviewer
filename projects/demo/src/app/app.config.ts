import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideDocViewer } from '@swipergy/ng-docviewer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideDocViewer({ pdfWorkerSrc: '/pdf.worker.min.mjs', locale: 'de-DE' }),
  ],
};
