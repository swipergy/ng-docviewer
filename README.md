# @swipergy/ng-docviewer

[![npm](https://img.shields.io/npm/v/@swipergy/ng-docviewer.svg)](https://www.npmjs.com/package/@swipergy/ng-docviewer)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/swipergy/ng-docviewer/blob/main/LICENSE)

Angular component that displays **PDF, Word (DOCX), PowerPoint (PPTX), JPG, PNG and audio** entirely in the browser and lays a **custom watermark** over it: text with placeholders and/or a logo. The watermark resists tampering in the viewer and is **burned into downloads, print-outs and generated PDFs**.

- **No backend, no installed software.** All rendering and conversion happens client-side, including **Word/PowerPoint → PDF**.
- **Traceable watermark** with placeholders such as `{user}` and `{datetime}`, tiled or centered, text and/or logo.
- **Tamper protection.** The watermark is restored when it is removed or hidden, `tamper` events are emitted, and the viewer locks after repeated attempts.
- **Safe by default.** Office content is sanitized (DOMPurify) and isolated in a shadow root, and opening a document never contacts third-party servers.
- **Modern Angular.** Standalone component, signal inputs, `OnPush`, zoneless-ready, SSR-safe.
- **Small.** Format libraries are **lazy-loaded**, so you only pay for the formats you actually open.
- German and English UI, themeable via CSS custom properties, keyboard and screen-reader friendly.

| Format | Rendering | Download with watermark | Print with watermark | Download as PDF |
|---|---|---|---|---|
| PDF | pdf.js (canvas, rendered lazily per page) | ✅ drawn onto every page | ✅ | – |
| DOCX | docx-preview | ✅ locked image in every section header | ✅ | ✅ |
| PPTX | pptx-to-html | ✅ locked image on top of every slide | ✅ | ✅ |
| JPG / PNG | native | ✅ burned into the pixels, format preserved | ✅ | – |
| Audio (mp3, wav, ogg, m4a, …) | native `<audio>` | ❌ disabled by default (audio cannot carry a visual watermark) | – | – |

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [API](#api): [inputs](#inputs), [outputs](#outputs), [methods](#methods), [global configuration](#global-configuration)
- [Watermark](#watermark)
- [PDF from Word/PowerPoint](#pdf-from-wordpowerpoint--in-the-browser)
- [Errors](#errors)
- [Labels / i18n](#labels--i18n) · [Theming](#theming) · [Accessibility](#accessibility)
- [Security model](#security-model) · [Content Security Policy](#content-security-policy)
- [Troubleshooting](#troubleshooting) · [Browser support](#browser-support)

## Installation

```bash
npm install @swipergy/ng-docviewer pdfjs-dist
```

Requires Angular **22**. `pdfjs-dist` is a peer dependency. This ensures that the library and the worker you copy below always come from the same version, because pdf.js refuses to run with mismatched API and worker versions.

Copy the pdf.js worker into your app's assets (`angular.json` → `build.options.assets`):

```json
{ "glob": "pdf.worker.min.mjs", "input": "node_modules/pdfjs-dist/build", "output": "/" }
```

Optionally, silence the CommonJS warnings of transitive dependencies:

```json
"allowedCommonJsDependencies": ["jszip", "pako"]
```

## Quick start

```ts
// app.config.ts
import { provideDocViewer, DOC_VIEWER_LABELS_EN } from '@swipergy/ng-docviewer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideDocViewer({
      labels: DOC_VIEWER_LABELS_EN,         // default: German
      watermark: { opacity: 0.15 },         // defaults for every viewer
    }),
  ],
};
```

```ts
import { DocViewer } from '@swipergy/ng-docviewer';

@Component({
  imports: [DocViewer],
  template: `
    <sy-doc-viewer
      style="height: 80vh"
      [src]="file"
      [watermark]="{ text: 'CONFIDENTIAL\n{user} · {datetime}', image: '/logo.svg' }"
      [watermarkContext]="{ user: currentUser.email }"
      (loaded)="onLoaded($event)"
      (viewerError)="onError($event)"
      (tamper)="onTamper($event)"
    />
  `,
})
export class MyComponent {}
```

The viewer fills its host element. Give it a height, as in the example above, or place it in a flex/grid layout.

To load documents from a protected API, pass `fetch` options:

```html
<sy-doc-viewer [src]="'/api/files/42'" [requestInit]="{ headers: { Authorization: token } }" />
```

## API

### Inputs

| Input | Type | Default | Description |
|---|---|---|---|
| `src` | `string \| Blob \| File \| ArrayBuffer \| Uint8Array \| null` | `null` | URL or data of the document |
| `type` | `'auto' \| 'pdf' \| 'docx' \| 'pptx' \| 'image' \| 'audio'` | `'auto'` | Detected via MIME type → file extension → file signature |
| `fileName` | `string` | from `File`, `Content-Disposition` or URL | Display and download name |
| `requestInit` | `RequestInit` | – | `fetch` options for URLs (headers, credentials, …) |
| `watermark` | `WatermarkConfig \| null` | global default | `null` disables the watermark |
| `watermarkContext` | `Record<string, string \| number>` | `{}` | Values for `{placeholders}` |
| `protect` | `boolean` | `true` | Tamper protection; blocks the context menu, copy and drag, and the native print and save shortcuts |
| `allowDownload` | `boolean` | `true` | Show the download button (original format, watermarked) |
| `allowPrint` | `boolean` | `true` | Show the print button |
| `allowPdfDownload` | `boolean` | `true` | Word/PowerPoint: additional “Download as PDF” button. The PDF is generated in the browser ([details](#pdf-from-wordpowerpoint--in-the-browser)) |
| `allowUnwatermarkedDownload` | `boolean` | `false` | Allow audio downloads even though a watermark is set |
| `toolbar` | `boolean` | `true` | Show the toolbar |
| `initialZoom` | `number \| 'fit-width'` | `'fit-width'` | `1` = 100 % |

### Outputs

| Output | Payload |
|---|---|
| `loaded` | `{ kind, fileName, pageCount }` |
| `viewerError` | `Error` from loading, rendering, export or printing. Known failures are a [`DocViewerError`](#errors) |
| `tamper` | `{ reason: 'removed' \| 'modified' \| 'hidden', count, locked }` |
| `pageChange` | current page (1-based), on scrolling and on navigation via toolbar or API |

### Methods

Access the component via `viewChild(DocViewer)`:

| Method | Description |
|---|---|
| `goToPage(n)`, `nextPage()`, `previousPage()` | Navigation (pages/slides) |
| `setZoom(z)`, `zoomIn()`, `zoomOut()`, `fitToWidth()` | Zoom (`1` = 100 %) |
| `rotate()` | Rotate images by 90° |
| `toggleFullscreen()` | Fullscreen for the viewer element |
| `download()` | Download in the original format, with the watermark burned in |
| `downloadPdf()` | Word/PowerPoint: download as PDF (generated client-side) |
| `exportPdf(): Promise<Blob>` | PDF as `Blob` for your own use (upload, attachment, …). PDFs: the watermarked file |
| `print()` | Print with the watermark, via a hidden iframe |

### Global configuration

`provideDocViewer(options)` sets defaults for all viewers of the application:

| Option | Default | Description |
|---|---|---|
| `pdfWorkerSrc` | `'/pdf.worker.min.mjs'` | URL of the pdf.js worker, or a factory `() => Worker` |
| `watermark` | – | Default `WatermarkConfig`, merged with the `watermark` input |
| `labels` | German | UI texts; partial objects are merged, including `labels.errors` |
| `locale` | browser locale | Locale for `{date}`, `{time}`, `{datetime}` |
| `tamperThreshold` | `3` | Number of tamper detections after which the viewer locks |

## Watermark

```ts
interface WatermarkConfig {
  text?: string;          // placeholders: {date}, {time}, {datetime} + your own context keys; '\n' for line breaks
  image?: string;         // URL/data URL of a logo (must be CORS-enabled when cross-origin)
  imageWidth?: number;    // 120
  opacity?: number;       // 0.18
  angle?: number;         // -30 (degrees)
  color?: string;         // '#000'
  fontSize?: number;      // 20
  fontFamily?: string;    // 'sans-serif'
  fontWeight?: string | number; // 600
  gap?: number;           // 80 (space between tiles)
  layout?: 'tile' | 'center'; // 'tile'
}
```

- Placeholders are resolved when the document is displayed, downloaded or printed. `resolvePlaceholders()` is exported if you want the same text elsewhere.
- If a watermark is configured but cannot be rendered (for example, the logo fails to load), the document is **not** shown.
- The same rendered tile is used for the screen, downloads, print-outs and PDFs, so the watermark looks identical everywhere. It is rendered at the resolution each target needs.

## PDF from Word/PowerPoint — in the browser

DOCX and PPTX are rendered entirely client-side. No backend, no conversion service and no installed Office software is involved. On request (the toolbar button, `downloadPdf()`, or `exportPdf()` to get the `Blob`), the viewer turns the rendered pages into a PDF on the fly:

- Every page is rasterized at ~192 dpi, the watermark is burned into the page image, and the pages are assembled with `pdf-lib`.
- Page sizes match the document (A4/Letter, slide size).
- The PDF looks exactly like the viewer, because it is made from the same rendering. The flip side: fidelity is that of the browser-side renderers (`docx-preview`, `pptx-to-html`), not of Microsoft Office.
- Text in the PDF is an image and cannot be searched or copied. This is intentional, so the watermark cannot be removed the way it can in Word/PowerPoint.
- The converter is loaded on first use and is not part of your initial bundle.

**PDF-only distribution of Office files:** set `[allowDownload]="false"` and keep `allowPdfDownload` enabled.

## Errors

Known failures are emitted via `viewerError` as `DocViewerError` with a `code` and `params`:

```ts
import { DocViewerError } from '@swipergy/ng-docviewer';

onError(error: Error) {
  if (error instanceof DocViewerError && error.code === 'loadFailed') {
    console.warn('HTTP status', error.params['status']);
  }
}
```

| Code | When |
|---|---|
| `loadFailed` | The URL could not be fetched (`{status}`) |
| `unsupportedFormat` | The format is unknown or not supported (`{fileName}`) |
| `passwordProtected` | The PDF needs an open password |
| `encryptedPdf` | An encrypted PDF cannot be exported with a watermark |
| `audioUnsupported` | The browser cannot play the audio format |
| `audioNoWatermark` | Audio download refused because a watermark is set |
| `watermarkImage` | The watermark logo could not be loaded (`{src}`) |
| `canvasExport` | An image could not be generated (e.g. the browser's canvas limits were exceeded) |
| `pdfUnavailable` | `exportPdf()` was called for a format without PDF output |

The message shown in the viewer comes from `labels.errors[code]`.

## Labels / i18n

German labels are the default. English labels are included:

```ts
import { DOC_VIEWER_LABELS_EN, provideDocViewer } from '@swipergy/ng-docviewer';
provideDocViewer({ labels: DOC_VIEWER_LABELS_EN });
```

Every text can be overridden individually, including the error messages: `provideDocViewer({ labels: { download: 'Save', errors: { loadFailed: 'Not found ({status})' } } })`.

## Theming

```css
sy-doc-viewer {
  --sy-viewer-bg: #e5e7eb;
  --sy-toolbar-bg: #fff;
  --sy-toolbar-fg: #1f2937;
  --sy-toolbar-border: #d1d5db;
  --sy-accent: #2563eb;
  --sy-error: #b91c1c;
  --sy-page-gap: 16px;
  --sy-page-shadow: 0 1px 4px rgb(0 0 0 / 25%);
}
```

Document pages always use their own typography, so your application's styles (font, line height, …) do not affect how documents are laid out.

## Accessibility

- The toolbar is a `role="toolbar"` with labelled buttons (all labels are translatable). The zoom level is announced via `aria-live`.
- Every function is reachable by keyboard. While the viewer has focus, `Ctrl/Cmd+P` and `Ctrl/Cmd+S` trigger the viewer's watermarked print and download.
- Loading and error states are announced to screen readers.

Note that PDFs are rendered without a text layer and Office files with selection disabled, both as part of the protection. Screen readers therefore cannot read the document *content*. If accessible content is a requirement, set `[protect]="false"` or offer an accessible version separately.

## Security model

The protection is a **deterrent, not DRM**. Anything a browser can display can be captured by someone who controls that browser.

What the viewer does:

- The watermark layer sits above the content with `pointer-events: none` and `!important` inline styles, under a random attribute name.
- A `MutationObserver` restores the layer immediately when it is removed, modified or covered. A periodic check catches stylesheet tricks (hiding, moving, shrinking).
- Every attempt emits `tamper`. After `tamperThreshold` attempts (default 3), the content is removed and the viewer stays locked for the rest of its lifetime. Changing `src` does not unlock it; re-create the component instead.
- Context menu, text selection, copy and drag are blocked. PDFs are rendered without a text layer.
- While the viewer has focus and shows a document, `Ctrl/Cmd+P` and `Ctrl/Cmd+S` are routed to the watermarked print and download. Elsewhere in your app these shortcuts are left alone, and the native print output of the page hides the document anyway.
- Downloads, print-outs and generated PDFs always carry the watermark (except audio, see above).

Office files are rendered to HTML in an isolated shadow root and sanitized with DOMPurify before they are displayed:

- Scripts, event handlers, forms and dangerous URLs are removed.
- **External resources (images, stylesheets, `@import`, `url()`) are blocked**, so opening a document never contacts third-party servers (no tracking pixels).
- Links stay clickable and open in a new tab with `rel="noopener noreferrer"`.

Limitations:

- Watermarks burned into DOCX/PPTX files are regular locked images, and recipients can remove them in Word/PowerPoint. Use the PDF export if this matters.
- Encrypted PDFs can be viewed but not exported with a watermark. This includes the common case of PDFs that only carry permission restrictions (an owner password, but no open password). `download()` then fails with `encryptedPdf`.
- PDFs are printed as raster images (~150 dpi), because the watermark is burned in.
- Screenshots, devtools and network inspection cannot be prevented. If the original file must never reach the client, render it server-side instead.

To report a vulnerability, see [SECURITY.md](https://github.com/swipergy/ng-docviewer/blob/main/SECURITY.md).

### Content Security Policy

The viewer works with a strict CSP:

```
script-src 'self';
worker-src 'self';
img-src 'self' data: blob:;
media-src 'self' blob:;
font-src 'self' data: blob:;
style-src 'self' 'unsafe-inline';
```

`style-src 'unsafe-inline'` is needed because Word/PowerPoint formatting is converted to inline styles. If documents are loaded by URL, add their origin to `connect-src`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| PDFs do not load; 404 for `pdf.worker.min.mjs` | Copy the worker into your assets ([Installation](#installation)) or set `pdfWorkerSrc` |
| “The API version does not match the Worker version” | The worker comes from a different `pdfjs-dist` version. Copy it from your installed `pdfjs-dist` as shown above; don't use a CDN URL of another version |
| Document not shown, error `watermarkImage` | The logo URL is unreachable or not CORS-enabled. Use a same-origin URL or a data URL |
| Images in Word/PowerPoint missing | Only embedded images are shown; linked external images are blocked on purpose |
| Office layout differs from Microsoft Office | Rendering is done by browser libraries; complex layouts (SmartArt, charts, special fonts) can differ. Fonts that are not installed on the client are substituted |
| `encryptedPdf` on download | The PDF has permission restrictions. Remove them on the server or allow viewing only |
| Viewer has zero height | The component fills its host. Give the host a height |

## Browser support

Current versions of Chrome, Edge, Firefox and Safari. Tested in CI with Chromium, Firefox and WebKit.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](https://github.com/swipergy/ng-docviewer/blob/main/CONTRIBUTING.md) for setup, tests and guidelines, and [docs/architecture.md](https://github.com/swipergy/ng-docviewer/blob/main/docs/architecture.md) for how the viewer works internally. Release notes are in [CHANGELOG.md](https://github.com/swipergy/ng-docviewer/blob/main/CHANGELOG.md).

## License

[MIT](https://github.com/swipergy/ng-docviewer/blob/main/LICENSE) © Swipergy

Bundled third-party libraries keep their own licenses: docx-preview (Apache-2.0), DOMPurify (Apache-2.0 / MPL-2.0), JSZip (MIT / GPL-3.0, used under MIT), pdf-lib, pptx-to-html and modern-screenshot (MIT). The peer dependency pdf.js is licensed under Apache-2.0.
