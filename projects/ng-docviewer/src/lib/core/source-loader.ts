import { DocViewerError } from './errors';
import { DocSource } from './types';

export interface LoadedSource {
  data: ArrayBuffer;
  mimeType?: string;
  fileName?: string;
}

/** Lädt eine Quelle vollständig in einen ArrayBuffer. */
export async function loadSource(src: DocSource, init?: RequestInit, signal?: AbortSignal): Promise<LoadedSource> {
  if (typeof src === 'string') {
    const response = await fetch(src, { ...init, signal });
    if (!response.ok) throw new DocViewerError('loadFailed', { status: response.status });
    return {
      data: await response.arrayBuffer(),
      mimeType: response.headers.get('content-type') ?? undefined,
      fileName: fileNameFromResponse(response) ?? fileNameFromUrl(src),
    };
  }
  if (src instanceof Blob) {
    return {
      data: await src.arrayBuffer(),
      mimeType: src.type || undefined,
      fileName: src instanceof File ? src.name : undefined,
    };
  }
  if (src instanceof Uint8Array) {
    return { data: src.slice().buffer as ArrayBuffer };
  }
  return { data: src };
}

export function fileNameFromResponse(response: Response): string | undefined {
  const disposition = response.headers.get('content-disposition');
  if (!disposition) return undefined;
  // RFC 5987: filename*=charset'sprache'prozent-kodiert – hat Vorrang vor filename=
  const star = disposition.match(/filename\*\s*=\s*"?([\w!#$&+.^`|~-]*)'[^']*'([^;"]+)"?/i);
  if (star) {
    const decoded = decodeExtValue(star[2].trim(), star[1]);
    if (decoded) return decoded;
  }
  return disposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1]?.trim();
}

function decodeExtValue(value: string, charset: string): string | undefined {
  try {
    if (/^utf-?8$/i.test(charset)) return decodeURIComponent(value);
    // ISO-8859-1 u. ä.: jedes %XX ist ein Zeichen
    return value.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  } catch {
    return undefined; // ungültige Kodierung → auf filename= zurückfallen
  }
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const name = new URL(url, 'http://localhost').pathname.split('/').pop();
    return name ? decodeURIComponent(name) : undefined;
  } catch {
    return undefined;
  }
}
