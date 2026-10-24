import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Document, Packer, PageBreak, Paragraph } from 'docx';
import { provideDocViewer } from './config';
import { DocViewer, DocViewerLoadedEvent, DocViewerTamperEvent } from './doc-viewer';
import { DOC_VIEWER_LABELS_EN } from './i18n';
import { WatermarkConfig } from './watermark/watermark.model';

async function pngBlob(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  canvas.getContext('2d')!.fillRect(0, 0, 200, 100);
  return new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
}

/** DOCX mit zwei Seitenumbrüchen → drei Seiten. */
async function threePageDocx(): Promise<File> {
  const children = [1, 2, 3].flatMap((n) => [new Paragraph(`Seite ${n}`), ...(n < 3 ? [new Paragraph({ children: [new PageBreak()] })] : [])]);
  const doc = new Document({ sections: [{ children }] });
  return new File([await Packer.toBlob(doc)], 'drei.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

@Component({
  imports: [DocViewer],
  template: `<sy-doc-viewer style="height: 400px" [src]="src()" [watermark]="watermark()" [watermarkContext]="{ user: 'tester' }"
    (loaded)="loaded.set($event)" (viewerError)="error.set($event)" (tamper)="tamper.set($event)" (pageChange)="pages.push($event)" />`,
})
class Host {
  src = signal<Blob | null>(null);
  watermark = signal<WatermarkConfig | null>({ text: '{user}' });
  loaded = signal<DocViewerLoadedEvent | null>(null);
  error = signal<Error | null>(null);
  tamper = signal<DocViewerTamperEvent | null>(null);
  pages: number[] = [];
}

describe('DocViewer', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const el = () => fixture.nativeElement as HTMLElement;
  const until = async (fn: () => unknown, timeout = 3000) => {
    const start = Date.now();
    while (!fn()) {
      if (Date.now() - start > timeout) throw new Error('Timeout');
      await new Promise((r) => setTimeout(r, 20));
      await fixture.whenStable();
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideDocViewer({ labels: DOC_VIEWER_LABELS_EN, tamperThreshold: 2 })] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => fixture.nativeElement.remove());

  it('zeigt ohne Quelle nichts an', async () => {
    await fixture.whenStable();
    expect(el().querySelector('.sy-content')).toBeNull();
    expect(el().querySelector('.sy-status')).toBeNull();
  });

  it('lädt ein Bild und legt das Wasserzeichen darüber', async () => {
    host.src.set(new File([await pngBlob()], 'bild.png', { type: 'image/png' }));
    await until(() => host.loaded());
    expect(host.loaded()).toEqual({ kind: 'image', fileName: 'bild.png', pageCount: 1 });
    expect(el().querySelector('.sy-content img')).not.toBeNull();
    const stage = el().querySelector('.sy-stage')!;
    expect(stage.lastElementChild!.classList.contains('sy-scroll')).toBe(false);
    expect(getComputedStyle(stage.lastElementChild!).backgroundImage).toContain('data:image/png');
    expect(el().querySelector('.sy-title')!.textContent).toBe('bild.png');
    // Englische Labels aus der Konfiguration
    expect(el().querySelector('[aria-label="Download"]')).not.toBeNull();
  });

  it('entfernt das Wasserzeichen bei `null`', async () => {
    host.src.set(await pngBlob());
    await until(() => host.loaded());
    host.watermark.set(null);
    await fixture.whenStable();
    await until(() => el().querySelector('.sy-stage')!.children.length === 1);
  });

  it('meldet Fehler bei nicht unterstützten Dateien', async () => {
    host.src.set(new File(['hallo'], 'notiz.txt', { type: 'text/plain' }));
    await until(() => host.error());
    expect(host.error()).toMatchObject({ code: 'unsupportedFormat', params: { fileName: 'notiz.txt' } });
    const alert = el().querySelector('[role=alert]')!.textContent;
    expect(alert).toContain('could not be displayed');
    // Meldung aus den (englischen) Labels statt fest verdrahtetem Text
    expect(alert).toContain('Unsupported file format: notiz.txt');
  });

  it('sperrt nach wiederholter Manipulation', async () => {
    host.src.set(await pngBlob());
    await until(() => host.loaded());
    const stage = el().querySelector('.sy-stage')!;
    stage.lastElementChild!.remove();
    await until(() => host.tamper()?.count === 1);
    stage.lastElementChild!.remove();
    await until(() => host.tamper()?.locked);
    await fixture.whenStable();
    expect(el().querySelector('.sy-content')).toBeNull();
    expect(el().querySelector('[role=alert]')!.textContent).toContain('tampered');
  });

  it('bleibt gesperrt, auch wenn die Quelle wechselt', async () => {
    host.src.set(await pngBlob());
    await until(() => host.loaded());
    const stage = el().querySelector('.sy-stage')!;
    stage.lastElementChild!.remove();
    await until(() => host.tamper()?.count === 1);
    stage.lastElementChild!.remove();
    await until(() => host.tamper()?.locked);
    host.loaded.set(null);
    host.src.set(null);
    await fixture.whenStable();
    host.src.set(await pngBlob());
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 300));
    expect(host.loaded()).toBeNull();
    expect(el().querySelector('.sy-content')).toBeNull();
    expect(el().querySelector('[role=alert]')!.textContent).toContain('tampered');
  });

  it('bricht das Laden ab, wenn der Viewer währenddessen zerstört wird', async () => {
    const errors: unknown[] = [];
    const onError = (e: PromiseRejectionEvent) => errors.push(e.reason);
    window.addEventListener('unhandledrejection', onError);
    try {
      host.src.set(await pngBlob());
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r));
      fixture.destroy();
      await new Promise((r) => setTimeout(r, 500));
      expect(host.loaded()).toBeNull();
      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener('unhandledrejection', onError);
    }
  });

  it('meldet pageChange auch bei Navigation über die Toolbar', async () => {
    host.src.set(await threePageDocx());
    await until(() => host.loaded());
    expect(host.loaded()!.pageCount).toBe(3);
    (el().querySelector('[aria-label="Next page"]') as HTMLButtonElement).click();
    await until(() => host.pages.includes(2));
    const viewer = fixture.debugElement.query(By.directive(DocViewer)).componentInstance as DocViewer;
    viewer.goToPage(3);
    await until(() => host.pages.at(-1) === 3);
    // Die letzte Seite bleibt aktuell, auch wenn sie sich nicht ganz nach oben scrollen lässt.
    await new Promise((r) => setTimeout(r, 200));
    expect(host.pages.at(-1)).toBe(3);
    expect((el().querySelector('.sy-page-indicator input') as HTMLInputElement).value).toBe('3');
  });

  it('fängt Strg+S nur ab, wenn der Viewer ein Dokument zeigt und den Fokus hat', async () => {
    const press = () => {
      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press()).toBe(false); // kein Dokument
    host.src.set(await pngBlob());
    await until(() => host.loaded());
    const viewer = fixture.debugElement.query(By.directive(DocViewer)).componentInstance as DocViewer;
    const download = vi.spyOn(viewer, 'download').mockResolvedValue();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(press()).toBe(false); // Fokus außerhalb
    (el().querySelector('.sy-scroll') as HTMLElement).focus();
    expect(press()).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
  });
});
