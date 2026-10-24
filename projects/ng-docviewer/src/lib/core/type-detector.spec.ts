import { detectDocumentType, extensionOf, sniff } from './type-detector';

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const zipWith = (entry: string) => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode(`....${entry}`)]);

describe('detectDocumentType', () => {
  it('bevorzugt den expliziten Typ', () => {
    expect(detectDocumentType({ explicit: 'pdf', fileName: 'x.png' }).kind).toBe('pdf');
  });

  it('nutzt den MIME-Typ vor der Endung', () => {
    expect(detectDocumentType({ mimeType: 'application/pdf; charset=binary', fileName: 'x.png' })).toEqual({ kind: 'pdf', mimeType: 'application/pdf' });
  });

  it('ignoriert generische MIME-Typen', () => {
    expect(detectDocumentType({ mimeType: 'application/octet-stream', fileName: 'Bericht.DOCX' }).kind).toBe('docx');
    expect(detectDocumentType({ mimeType: 'application/zip', bytes: zipWith('ppt/presentation.xml') }).kind).toBe('pptx');
  });

  it('erkennt Audio über MIME-Typ und Endung', () => {
    expect(detectDocumentType({ mimeType: 'audio/x-m4a' }).kind).toBe('audio');
    expect(detectDocumentType({ fileName: 'a.wav' })).toEqual({ kind: 'audio', mimeType: 'audio/wav' });
  });

  it('fällt auf Magic Bytes zurück', () => {
    expect(detectDocumentType({ bytes: bytes(0x25, 0x50, 0x44, 0x46) }).kind).toBe('pdf');
  });

  it('wirft bei unbekanntem Format', () => {
    expect(() => detectDocumentType({ fileName: 'x.xlsx', bytes: bytes(1, 2, 3) })).toThrowError(/x\.xlsx/);
  });
});

describe('sniff', () => {
  it.each([
    [bytes(0x89, 0x50, 0x4e, 0x47), 'image', 'image/png'],
    [bytes(0xff, 0xd8, 0xff, 0xe0), 'image', 'image/jpeg'],
    [bytes(0x49, 0x44, 0x33), 'audio', 'audio/mpeg'],
    [bytes(0xff, 0xfb, 0x90), 'audio', 'audio/mpeg'],
    [bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45), 'audio', 'audio/wav'],
    [bytes(0x4f, 0x67, 0x67, 0x53), 'audio', 'audio/ogg'],
    [zipWith('word/document.xml'), 'docx', undefined],
  ])('erkennt Signatur %#', (input, kind, mime) => {
    const result = sniff(input)!;
    expect(result.kind).toBe(kind);
    if (mime) expect(result.mimeType).toBe(mime);
  });

  it('erkennt beliebige ZIPs nicht als Office', () => {
    expect(sniff(zipWith('foo/bar.txt'))).toBeUndefined();
  });
});

describe('extensionOf', () => {
  it('ignoriert Query und Fragment', () => {
    expect(extensionOf('https://x.de/a/Datei.PDF?token=1#p=2')).toBe('pdf');
    expect(extensionOf('ohne-endung')).toBeUndefined();
  });
});
