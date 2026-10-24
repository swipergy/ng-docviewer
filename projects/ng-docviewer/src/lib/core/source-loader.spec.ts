import { fileNameFromResponse, loadSource } from './source-loader';

const withDisposition = (value: string) => new Response('', { headers: { 'content-disposition': value } });

describe('fileNameFromResponse', () => {
  it('bevorzugt filename* (UTF-8) vor filename', () => {
    expect(fileNameFromResponse(withDisposition(`attachment; filename="a.pdf"; filename*=UTF-8''%C3%9Cbersicht.pdf`))).toBe('Übersicht.pdf');
  });

  it('dekodiert ISO-8859-1 und ignoriert die Sprachangabe', () => {
    expect(fileNameFromResponse(withDisposition(`attachment; filename*=ISO-8859-1'de'%E4nderung.pdf`))).toBe('änderung.pdf');
  });

  it('fällt bei ungültiger Kodierung auf filename zurück statt zu werfen', () => {
    expect(fileNameFromResponse(withDisposition(`attachment; filename="ok.pdf"; filename*=UTF-8''%E0%A4%A.pdf`))).toBe('ok.pdf');
  });

  it('liest einfaches filename', () => {
    expect(fileNameFromResponse(withDisposition('inline; filename=bericht.docx'))).toBe('bericht.docx');
  });
});

describe('loadSource', () => {
  it('meldet HTTP-Fehler mit Code und Status', async () => {
    const blobUrl = 'data:text/plain,x';
    // data:-URLs liefern immer 200 – daher fetch gezielt ersetzen
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response('', { status: 404 });
    try {
      await expect(loadSource(blobUrl)).rejects.toMatchObject({ code: 'loadFailed', params: { status: 404 } });
    } finally {
      globalThis.fetch = original;
    }
  });
});
