# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-24

Initial release.

### Added

- `<sy-doc-viewer>` standalone component for **PDF, DOCX, PPTX, JPG, PNG and audio**, rendered entirely in the browser. Format libraries are lazy-loaded.
- Format detection via `type` input, MIME type, file extension and file signature. Sources can be a URL (with `requestInit`), `Blob`, `File`, `ArrayBuffer` or `Uint8Array`.
- Watermark with text placeholders (`{date}`, `{time}`, `{datetime}`, custom context) and/or a logo, tiled or centered.
- Tamper protection:
  - The watermark is restored when it is removed, modified or hidden, including through stylesheet tricks.
  - Every attempt emits a `tamper` event, and the viewer locks after `tamperThreshold` attempts.
  - Context menu, selection, copy and drag are blocked.
  - `Ctrl/Cmd+P/S` are routed to the watermarked print and download.
- Watermark burned into every output:
  - Downloads: PDF (every page), JPG/PNG (pixels), DOCX (locked image in every section header, ECMA-376 header inheritance respected) and PPTX (locked image on every slide).
  - Print-outs.
- **Word/PowerPoint → PDF in the browser** via the toolbar button, `downloadPdf()` or `exportPdf()`. No backend and no Office installation are needed.
- Toolbar with page navigation, zoom, fit-to-width, rotation (images), fullscreen, download and print. Matching methods on the component.
- `DocViewerError` with machine-readable `code`; localized messages via `labels.errors`.
- German and English labels, `provideDocViewer()` for global defaults, CSS custom properties for theming.

### Security

- Office HTML is sanitized with DOMPurify and isolated in a shadow root. External resources (images, stylesheets, `@import`, `url()`) are blocked, so opening a document never contacts third-party servers.
- PDFs are rendered without a text layer.

[Unreleased]: https://github.com/swipergy/ng-docviewer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/swipergy/ng-docviewer/releases/tag/v1.0.0
