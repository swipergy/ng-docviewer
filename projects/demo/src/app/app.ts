import { Component, computed, signal } from '@angular/core';
import { disabled, form, FormField, max, min } from '@angular/forms/signals';
import { DocSource, DocViewer, DocViewerLoadedEvent, DocViewerTamperEvent, WatermarkConfig } from '@swipergy/ng-docviewer';
import { version } from '../../../ng-docviewer/package.json';
import { LANG, LOCALE, T } from './i18n';

interface Sample {
  label: string;
  url: string;
}

interface Settings {
  enabled: boolean;
  text: string;
  user: string;
  withLogo: boolean;
  opacity: number;
  angle: number;
  layout: 'tile' | 'center';
  protect: boolean;
  allowDownload: boolean;
  allowPdfDownload: boolean;
  allowPrint: boolean;
}

const INSTALL_COMMAND = 'npm install @swipergy/ng-docviewer pdfjs-dist';

@Component({
  selector: 'app-root',
  imports: [DocViewer, FormField],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly t = T;
  protected readonly lang = LANG;
  protected readonly version = version;
  protected readonly installCommand = INSTALL_COMMAND;
  protected readonly year = new Date().getFullYear();

  // Relative URLs, resolved against <base href>, so the demo runs from any folder.
  protected readonly samples: Sample[] = [
    { label: 'PDF', url: 'samples/sample.pdf' },
    { label: 'Word', url: 'samples/sample.docx' },
    { label: 'PowerPoint', url: 'samples/sample.pptx' },
    { label: 'JPG', url: 'samples/sample.jpg' },
    { label: 'PNG', url: 'samples/sample.png' },
    { label: 'Audio', url: 'samples/sample.mp3' },
  ];

  protected readonly src = signal<DocSource | null>(this.samples[0].url);
  protected readonly fileName = signal<string | undefined>(undefined);

  protected readonly settings = signal<Settings>({
    enabled: true,
    text: T.watermarkText,
    user: 'info@swipergy.com',
    withLogo: false,
    opacity: 0.15,
    angle: -30,
    layout: 'tile',
    protect: true,
    allowDownload: true,
    allowPdfDownload: true,
    allowPrint: true,
  });
  protected readonly settingsForm = form(this.settings, (s) => {
    // Watermark fields only matter while the watermark is enabled.
    disabled(s.text, ({ valueOf }) => !valueOf(s.enabled));
    disabled(s.user, ({ valueOf }) => !valueOf(s.enabled));
    disabled(s.withLogo, ({ valueOf }) => !valueOf(s.enabled));
    disabled(s.opacity, ({ valueOf }) => !valueOf(s.enabled));
    disabled(s.angle, ({ valueOf }) => !valueOf(s.enabled));
    disabled(s.layout, ({ valueOf }) => !valueOf(s.enabled));
    min(s.opacity, 0.05);
    max(s.opacity, 0.6);
    min(s.angle, -90);
    max(s.angle, 90);
  });

  protected readonly watermark = computed<WatermarkConfig | null>(() => {
    const s = this.settings();
    return s.enabled ? { text: s.text, image: s.withLogo ? 'logo.png' : undefined, opacity: s.opacity, angle: s.angle, layout: s.layout } : null;
  });
  protected readonly context = computed(() => ({ user: this.settings().user }));

  protected readonly log = signal<string[]>([]);
  protected readonly copied = signal(false);

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

  protected async copyInstall(): Promise<void> {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // clipboard unavailable (insecure context, permission denied) — the command stays selectable
    }
  }

  protected onLoaded(e: DocViewerLoadedEvent): void {
    this.write(T.loaded(e.fileName, e.kind, e.pageCount));
  }

  protected onError(e: Error): void {
    this.write(T.error(e.message));
  }

  protected onTamper(e: DocViewerTamperEvent): void {
    this.write(T.tamper(e.reason, e.count, e.locked));
  }

  private write(line: string): void {
    this.log.update((l) => [`${new Date().toLocaleTimeString(LOCALE)}  ${line}`, ...l].slice(0, 20));
  }
}
