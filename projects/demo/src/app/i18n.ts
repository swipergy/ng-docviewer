export type Lang = 'en' | 'de';

/** Language from `?lang=de|en`, otherwise from the browser. Read once, because the viewer labels are global config. */
export const LANG: Lang = (() => {
  const param = new URLSearchParams(location.search).get('lang');
  if (param === 'de' || param === 'en') {
    return param;
  }
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
})();

export const LOCALE = LANG === 'de' ? 'de-DE' : 'en-GB';

const TEXTS = {
  en: {
    title: 'Document Viewer for Angular',
    lead: 'Angular component that displays PDF, Word, PowerPoint, images and audio entirely in the browser, with a tamper-resistant watermark that is burned into every download and print-out.',
    install: 'Install',
    copy: 'Copy',
    copied: 'Copied',
    features: [
      ['All formats, no backend', 'PDF, DOCX, PPTX, JPG, PNG and audio are rendered client-side. Format libraries are lazy-loaded.'],
      ['Watermark burned in', 'Text with placeholders and/or a logo, also in downloads, print-outs and Word/PowerPoint → PDF.'],
      ['Tamper protection', 'Removed or hidden watermarks are restored, attempts are reported, and the viewer locks after repeated tampering.'],
    ],
    playground: 'Try it',
    playgroundHint: 'Pick a sample or open your own file. It never leaves your browser.',
    samples: 'Samples',
    ownFile: 'Open your own file',
    watermark: 'Watermark',
    enabled: 'enabled',
    text: 'Text',
    logo: 'Logo',
    opacity: 'Opacity',
    angle: 'Angle',
    layout: 'Layout',
    tiled: 'tiled',
    centered: 'centered',
    protect: 'Tamper protection',
    output: 'Download & print',
    allowDownload: 'Download',
    allowPdfDownload: 'Download as PDF (Word/PowerPoint)',
    allowPrint: 'Print',
    events: 'Events',
    watermarkText: 'CONFIDENTIAL\n{user} · {datetime}',
    loaded: (file: string, kind: string, pages: number) => `loaded: ${file} (${kind}, ${pages} pages)`,
    error: (message: string) => `Error: ${message}`,
    tamper: (reason: string, count: number, locked: boolean) => `Tampering detected (${reason}), count ${count}${locked ? ' – locked' : ''}`,
    license: 'Released under the MIT License.',
    legalNotice: 'Legal Notice',
    privacy: 'Privacy Policy',
  },
  de: {
    title: 'Dokumenten-Viewer für Angular',
    lead: 'Angular-Komponente, die PDF, Word, PowerPoint, Bilder und Audio komplett im Browser anzeigt – mit manipulationsgeschütztem Wasserzeichen, das in jeden Download und jeden Ausdruck eingebrannt wird.',
    install: 'Installation',
    copy: 'Kopieren',
    copied: 'Kopiert',
    features: [
      ['Alle Formate, kein Backend', 'PDF, DOCX, PPTX, JPG, PNG und Audio werden im Browser gerendert. Die Format-Bibliotheken werden bei Bedarf nachgeladen.'],
      ['Eingebranntes Wasserzeichen', 'Text mit Platzhaltern und/oder Logo, auch in Downloads, Ausdrucken und Word/PowerPoint → PDF.'],
      ['Manipulationsschutz', 'Entfernte oder versteckte Wasserzeichen werden wiederhergestellt, Versuche gemeldet, und nach mehreren Versuchen sperrt der Viewer.'],
    ],
    playground: 'Ausprobieren',
    playgroundHint: 'Beispiel wählen oder eigene Datei öffnen. Sie verlässt Ihren Browser nicht.',
    samples: 'Beispiele',
    ownFile: 'Eigene Datei',
    watermark: 'Wasserzeichen',
    enabled: 'aktiv',
    text: 'Text',
    logo: 'Logo',
    opacity: 'Deckkraft',
    angle: 'Winkel',
    layout: 'Layout',
    tiled: 'gekachelt',
    centered: 'mittig',
    protect: 'Manipulationsschutz',
    output: 'Download & Druck',
    allowDownload: 'Download',
    allowPdfDownload: 'Als PDF herunterladen (Word/PowerPoint)',
    allowPrint: 'Drucken',
    events: 'Ereignisse',
    watermarkText: 'VERTRAULICH\n{user} · {datetime}',
    loaded: (file: string, kind: string, pages: number) => `geladen: ${file} (${kind}, ${pages} Seiten)`,
    error: (message: string) => `Fehler: ${message}`,
    tamper: (reason: string, count: number, locked: boolean) => `Manipulation erkannt (${reason}), Anzahl ${count}${locked ? ' – gesperrt' : ''}`,
    license: 'Veröffentlicht unter der MIT-Lizenz.',
    legalNotice: 'Impressum',
    privacy: 'Datenschutz',
  },
};

export const T = TEXTS[LANG];
