import { DocViewerError } from './errors';
import { DocumentKind, MIME_TYPES } from './types';

export interface DetectionInput {
  /** Explizit vom Consumer gesetzte Art (hat Vorrang). */
  explicit?: DocumentKind | 'auto';
  mimeType?: string;
  fileName?: string;
  /** Die ersten Bytes der Datei (mind. 4 KB empfohlen, für OOXML wird das ZIP-Verzeichnis durchsucht). */
  bytes?: Uint8Array;
}

export interface DetectionResult {
  kind: DocumentKind;
  mimeType: string;
}

/**
 * Ermittelt die Dokumentart: explizit > MIME-Typ > Dateiendung > Magic Bytes.
 * Wirft, wenn das Format nicht unterstützt wird.
 */
export function detectDocumentType(input: DetectionInput): DetectionResult {
  const ext = extensionOf(input.fileName);
  const mime = normalizeMime(input.mimeType);

  if (input.explicit && input.explicit !== 'auto') {
    return { kind: input.explicit, mimeType: mime ?? mimeFor(input.explicit, ext, input.bytes) };
  }
  const byMime = mime ? kindFromMime(mime) : undefined;
  if (byMime) return { kind: byMime, mimeType: mime! };

  const byExt = ext ? kindFromExtension(ext) : undefined;
  if (byExt) return { kind: byExt, mimeType: MIME_TYPES[ext!] };

  const sniffed = input.bytes ? sniff(input.bytes) : undefined;
  if (sniffed) return sniffed;

  throw new DocViewerError('unsupportedFormat', { fileName: input.fileName ?? '' });
}

export function extensionOf(fileName?: string): string | undefined {
  const clean = fileName?.split(/[?#]/)[0];
  const match = clean?.match(/\.([a-z0-9]+)$/i);
  return match?.[1].toLowerCase();
}

function normalizeMime(mime?: string): string | undefined {
  const m = mime?.split(';')[0].trim().toLowerCase();
  // Generische Typen sagen nichts über das Format aus.
  return m && m !== 'application/octet-stream' && m !== 'binary/octet-stream' && m !== 'application/zip' ? m : undefined;
}

function kindFromMime(mime: string): DocumentKind | undefined {
  if (mime === MIME_TYPES['pdf']) return 'pdf';
  if (mime === MIME_TYPES['docx']) return 'docx';
  if (mime === MIME_TYPES['pptx']) return 'pptx';
  if (mime === 'image/jpeg' || mime === 'image/png') return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return undefined;
}

function kindFromExtension(ext: string): DocumentKind | undefined {
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'docx':
      return 'docx';
    case 'pptx':
      return 'pptx';
    case 'jpg':
    case 'jpeg':
    case 'png':
      return 'image';
    default:
      return MIME_TYPES[ext]?.startsWith('audio/') ? 'audio' : undefined;
  }
}

function mimeFor(kind: DocumentKind, ext?: string, bytes?: Uint8Array): string {
  if (ext && MIME_TYPES[ext]) return MIME_TYPES[ext];
  const sniffed = bytes ? sniff(bytes) : undefined;
  if (sniffed?.kind === kind) return sniffed.mimeType;
  return { pdf: MIME_TYPES['pdf'], docx: MIME_TYPES['docx'], pptx: MIME_TYPES['pptx'], image: 'image/png', audio: 'audio/mpeg' }[kind];
}

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/** Erkennt das Format anhand der Signatur der Datei. */
export function sniff(b: Uint8Array): DetectionResult | undefined {
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return { kind: 'pdf', mimeType: MIME_TYPES['pdf'] }; // %PDF
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return { kind: 'image', mimeType: 'image/png' };
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { kind: 'image', mimeType: 'image/jpeg' };
  if (startsWith(b, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { kind: 'audio', mimeType: 'audio/mpeg' }; // ID3 / MPEG-Frame
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x41, 0x56, 0x45], 8)) return { kind: 'audio', mimeType: 'audio/wav' };
  if (startsWith(b, [0x4f, 0x67, 0x67, 0x53])) return { kind: 'audio', mimeType: 'audio/ogg' };
  if (startsWith(b, [0x66, 0x4c, 0x61, 0x43])) return { kind: 'audio', mimeType: 'audio/flac' };
  if (startsWith(b, [0x66, 0x74, 0x79, 0x70], 4) && startsWith(b, [0x4d, 0x34, 0x41], 8)) return { kind: 'audio', mimeType: 'audio/mp4' }; // ftypM4A
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    // OOXML: Dateinamen der ZIP-Einträge stehen im Klartext in den lokalen Headern.
    const text = new TextDecoder('latin1').decode(b);
    if (text.includes('word/')) return { kind: 'docx', mimeType: MIME_TYPES['docx'] };
    if (text.includes('ppt/')) return { kind: 'pptx', mimeType: MIME_TYPES['pptx'] };
  }
  return undefined;
}
