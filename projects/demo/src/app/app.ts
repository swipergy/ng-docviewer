import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DocSource, DocViewer, DocViewerLoadedEvent, DocViewerTamperEvent, WatermarkConfig } from '@swipergy/ng-docviewer';

interface Sample {
  label: string;
  url: string;
}

@Component({
  selector: 'app-root',
  imports: [DocViewer, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly samples: Sample[] = [
    { label: 'PDF', url: '/samples/sample.pdf' },
    { label: 'Word', url: '/samples/sample.docx' },
    { label: 'PowerPoint', url: '/samples/sample.pptx' },
    { label: 'JPG', url: '/samples/sample.jpg' },
    { label: 'PNG', url: '/samples/sample.png' },
    { label: 'Audio', url: '/samples/sample.mp3' },
  ];

  protected readonly src = signal<DocSource | null>(this.samples[0].url);
  protected readonly fileName = signal<string | undefined>(undefined);

  protected readonly text = signal('VERTRAULICH\n{user} · {datetime}');
  protected readonly user = signal('max.mustermann@swipergy.com');
  protected readonly withLogo = signal(false);
  protected readonly opacity = signal(0.15);
  protected readonly angle = signal(-30);
  protected readonly layout = signal<'tile' | 'center'>('tile');
  protected readonly protect = signal(true);
  protected readonly enabled = signal(true);

  protected readonly watermark = computed<WatermarkConfig | null>(() =>
    this.enabled()
      ? {
          text: this.text(),
          image: this.withLogo() ? '/logo.svg' : undefined,
          opacity: this.opacity(),
          angle: this.angle(),
          layout: this.layout(),
        }
      : null,
  );
  protected readonly context = computed(() => ({ user: this.user() }));

  protected readonly log = signal<string[]>([]);

  protected open(sample: Sample): void {
    this.fileName.set(undefined);
    this.src.set(sample.url);
  }

  protected onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.fileName.set(file.name);
      this.src.set(file);
    }
  }

  protected onLoaded(e: DocViewerLoadedEvent): void {
    this.write(`geladen: ${e.fileName} (${e.kind}, ${e.pageCount} Seiten)`);
  }

  protected onError(e: Error): void {
    this.write(`Fehler: ${e.message}`);
  }

  protected onTamper(e: DocViewerTamperEvent): void {
    this.write(`Manipulation erkannt (${e.reason}), Anzahl ${e.count}${e.locked ? ' – gesperrt' : ''}`);
  }

  private write(line: string): void {
    this.log.update((l) => [`${new Date().toLocaleTimeString('de-DE')}  ${line}`, ...l].slice(0, 20));
  }
}
