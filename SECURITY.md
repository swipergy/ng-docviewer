# Security Policy

## Supported versions

Security fixes are released for the latest minor version. Before 1.0, only the most recent `0.x` release receives fixes.

| Version | Supported |
|---|---|
| 0.1.x (latest) | ✅ |
| older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately via GitHub ([Security → Report a vulnerability](https://github.com/swipergy/ng-docviewer/security/advisories/new)) or by email to **[info@swipergy.com](mailto:info@swipergy.com)** with the subject “Security: ng-docviewer”.

Please include:

- affected version(s) and browser(s),
- a description of the issue and its impact,
- steps or a sample document to reproduce it. Please strip confidential content from sample files.

What to expect:

| Step | Target |
|---|---|
| Acknowledgement | within 3 business days |
| Initial assessment (severity, scope) | within 10 business days |
| Fix for confirmed critical/high issues | as fast as possible, usually within 30 days |

We coordinate disclosure with you: a GitHub Security Advisory (with CVE where applicable) is published once a fixed version is available on npm. We are happy to credit reporters unless you prefer to stay anonymous.

## Scope

**In scope**, for example:

- Script execution or HTML/CSS injection through crafted PDF, DOCX, PPTX or image files (XSS, sanitizer bypass).
- Opening a document makes the browser contact third-party servers (tracking pixels, external stylesheets, `@import`, `url()`), although external resources are supposed to be blocked.
- Exports or print-outs that should carry the watermark but don't, or that leak an un-watermarked copy of the document.
- Removing or hiding the watermark in the viewer without triggering tamper detection, using only page content or a crafted document, i.e. without browser devtools, extensions or modified JavaScript.
- Vulnerabilities in bundled dependencies (`docx-preview`, `@jvmr/pptx-to-html`, `dompurify`, `jszip`, `pdf-lib`, `modern-screenshot`) that are reachable through this library.

**Out of scope**, by design (see [Security model](README.md#security-model)):

- Screenshots, screen recording, photographing the screen.
- Bypassing the watermark or protections with devtools, browser extensions, a modified bundle, or by reading the original file from the network/your own `src`.
- Removing the watermark from exported DOCX/PPTX files in Word or PowerPoint. It is a regular locked image there; use the PDF export if this matters.
- Vulnerabilities in `pdfjs-dist` itself. It is a peer dependency, so please report those to [Mozilla pdf.js](https://github.com/mozilla/pdf.js/security) and keep `pdfjs-dist` up to date.
- Issues in the demo application that do not affect the published package.

## Hardening recommendations for applications

- Keep `@swipergy/ng-docviewer` and `pdfjs-dist` up to date (Dependabot/Renovate).
- Use a Content Security Policy. The viewer works with:
  ```
  script-src 'self';
  worker-src 'self';
  img-src 'self' data: blob:;
  media-src 'self' blob:;
  font-src 'self' data: blob:;
  style-src 'self' 'unsafe-inline';
  ```
  `style-src 'unsafe-inline'` is required because Word/PowerPoint formatting is converted to inline styles. Add your API origin to `connect-src` if documents are loaded by URL.
- Serve documents with authentication and short-lived URLs. The watermark protects against careless redistribution, not against a determined user who already has the file.
- Put user-identifying values (e.g. `{user}`) into the watermark. A traceable watermark is the most effective deterrent.
