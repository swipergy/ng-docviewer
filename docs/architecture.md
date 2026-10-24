# Architecture

This document is for contributors. It explains how the viewer is built and why. For usage, see the [README](../README.md).

## Overview

```
src (URL | Blob | File | ArrayBuffer)
  │
  ▼
core/source-loader ──► core/type-detector ──► renderers/<format> (lazy import)
                        type input → MIME →        │
                        extension → magic bytes    ▼
                                         scroll container (pages)
                                                   │
                       watermark/watermark-rasterizer ──► watermark-overlay (+ tamper guard)
                                   │
                                   └──► export/* (download, print, HTML → PDF)
```

`DocViewer` (`doc-viewer.ts`) is the only component. It coordinates loading, the active renderer, the watermark overlay, toolbar state and exports. It does this with signals: inputs drive two `afterRenderEffect`s, one for the document and one for the watermark. Stale async results are discarded through a load id plus an `AbortController`.

## Loading and detection

- `core/source-loader.ts` turns every `DocSource` into an `ArrayBuffer`. The file name comes from the input, `File.name`, `Content-Disposition` (including RFC 5987 `filename*=`) or the URL. Failures become `DocViewerError('loadFailed')`.
- `core/type-detector.ts` decides the format. Precedence: explicit `type` input, then MIME type, then file extension, then magic bytes. For ZIP files, the entries (`word/` vs. `ppt/`) decide between DOCX and PPTX.

## Renderers

Each format has a renderer (`core/renderer.ts` → `DocRenderer`). Its third-party library is loaded with dynamic `import()`, so it only lands in a lazy chunk.

| Format | Library | Notes |
|---|---|---|
| PDF | `pdfjs-dist` (peer) | One canvas per page, rendered when visible. No text layer, so text cannot be selected or copied. |
| DOCX | `docx-preview` | Rendered into a detached element, sanitized, then moved into a shadow root. |
| PPTX | `@jvmr/pptx-to-html` | Same pipeline as DOCX. The slide size is read from `presentation.xml`. |
| Image | native | `<img>` with zoom and rotation. |
| Audio | native `<audio>` | Custom controls, no native download button. |

Office HTML comes from untrusted input. `core/sanitize.ts` runs a private DOMPurify instance that does the following:

- It removes scripts, event handlers, forms, `<style>`/`<link>` outside the renderer's own styles, and SVG animation attributes.
- It allows only `data:image`, `blob:` and fragment URLs for resources, and `http(s)`, `mailto`, `tel` and fragments for links. Links get `target=_blank rel=noopener noreferrer`.
- It runs `sanitizeCss` on the renderer's style sheets. This blocks `@import` and external `url()`.

As a result, opening a document never contacts a third-party server.

`core/document-style.ts` holds the base typography of document pages. The shadow roots and the print/PDF iframes share it, so the host app's styles cannot leak in and screen, print and PDF lay out identically.

## Watermark

- `watermark/placeholder.ts` resolves `{date}`, `{time}`, `{datetime}` and custom context keys.
- `watermark/watermark-rasterizer.ts` is the single source of truth. It draws text and logo into a tile canvas. A `WatermarkTileSource` (`(minScale) => Promise<WatermarkTile>`) lets each consumer request the resolution it needs: screen DPR, print, export. Tiles are cached per scale.
- `watermark/watermark-overlay.ts` places the tile as a background over the scroll container. Its styles are set inline with `!important`, under a random attribute name.
  - A `MutationObserver` restores the overlay when it is removed or changed.
  - A periodic check of computed style and bounding rect catches stylesheet attacks (hiding, shrinking, covering).
  - Every detection emits `tamper`. Once the count reaches `tamperThreshold`, the content is destroyed and the component stays locked.

## Exports

`export/index.ts` → `exportWithWatermark(doc, getTile)`:

| Format | Exporter | Technique |
|---|---|---|
| PDF | `pdf.exporter.ts` | pdf-lib draws the tile PNG on every page. Encrypted PDFs fail with `encryptedPdf`. |
| JPG/PNG | `image.exporter.ts` | Canvas composition in the original format. |
| DOCX | `docx.exporter.ts` | DOM-based OOXML edit (details below). |
| PPTX | `pptx.exporter.ts` | A locked `<p:pic>` (`noSelect`, `noMove`, …) as the top-most shape of each slide, inserted before a trailing `<p:extLst>`. |

DOCX details:

- Each section receives the watermark as an anchored picture in its headers.
- The exporter follows the header inheritance rules of ECMA-376 §17.10.5. It handles `titlePg`, `evenAndOddHeaders`, and headers inherited from previous sections.
- A header shared by sections with different page sizes is copied per size. Drawing ids in the copies are renumbered.
- `sectPr` inside `sectPrChange` (tracked changes) is left untouched.

The other export paths:

- **Print** (`print.ts`) uses a hidden iframe.
  - PDF and images are printed from their watermarked raster.
  - Office pages are copied into the iframe with a watermark layer per page.
- **HTML → PDF** (`html-pdf.exporter.ts`), for DOCX and PPTX:
  - The rendered pages are copied into an off-screen iframe (`page-frame.ts`).
  - Each page is rasterized with `modern-screenshot`, which uses SVG `foreignObject`, at 2× scale (~192 dpi).
  - The watermark is painted onto the raster and the page is encoded as JPEG.
  - pdf-lib assembles the PDF at the original page size.
  - No server and no Office installation is involved.

## Errors and i18n

Known failures are `DocViewerError` instances with a `code` (`DocViewerErrorCode`) and `params`. The visible message comes from `labels.errors[code]` with `{param}` substitution. German and English labels are shipped, and every text can be overridden through `provideDocViewer({ labels })`.

## Testing

- **Unit** (`*.spec.ts`, Vitest in headless Chromium): detection, sanitizer, rasterizer, overlay/tamper, exporters (results are re-parsed with pdf-lib/JSZip/DOMParser), component behaviour.
- **E2E** (`e2e/`, Playwright against the demo app in Chromium, Firefox and WebKit): every format renders, tamper attempts are detected, downloads carry the watermark, PDF conversion produces correct page counts and sizes, and keyboard handling works.
- Exported DOCX/PPTX files were additionally validated against the ECMA-376 schemas.
