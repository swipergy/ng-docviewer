/** Unterstützte Dokumentarten. */
export type DocumentKind = 'pdf' | 'docx' | 'pptx' | 'image' | 'audio';

/** Quelle eines Dokuments: URL, Blob/File oder Rohdaten. */
export type DocSource = string | Blob | ArrayBuffer | Uint8Array;

/** Geladenes Dokument inkl. erkannter Art und MIME-Typ. */
export interface LoadedDocument {
  kind: DocumentKind;
  mimeType: string;
  data: ArrayBuffer;
  fileName: string;
}

export const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
};
