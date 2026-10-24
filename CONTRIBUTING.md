# Contributing

Thanks for helping to improve `@swipergy/ng-docviewer`! Bug reports, sample documents that render badly, and pull requests are all welcome.

> Security issues: please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Prerequisites

- Node.js 24 or newer (see `.nvmrc`), npm 11
- Playwright browsers for tests: `npx playwright install`
- Only needed to regenerate fixtures: `ffmpeg` and macOS `say`

## Setup

```bash
npm ci
npm start          # demo app on http://localhost:4200 with sample files of every format
npm run fixtures   # regenerate the sample files (needs ffmpeg + macOS `say`)
```

## Project layout

```
projects/ng-docviewer/      the library (published as @swipergy/ng-docviewer)
  src/lib/core/             loading, type detection, sanitizing, errors
  src/lib/renderers/        one renderer per format (lazy-loaded)
  src/lib/watermark/        rasterizer, placeholders, overlay + tamper guard
  src/lib/export/           watermarked downloads, print, HTML → PDF
projects/demo/              demo app, also the target of the E2E tests
e2e/                        Playwright tests (Chromium, Firefox, WebKit)
scripts/                    fixture generator
```

[docs/architecture.md](docs/architecture.md) explains how rendering, the watermark and the exports fit together.

## Checks

Every pull request must pass the same checks as CI:

```bash
npm run lint
npm test           # unit tests, Vitest in headless Chromium
npm run build      # library + demo
npm run e2e        # Playwright in Chromium, Firefox and WebKit
```

## Guidelines

- **Tests:** add or adjust unit tests for logic, and E2E tests for user-visible behaviour. Exporters are tested by re-opening the result (pdf-lib, JSZip/DOMParser).
- **Formats:** files produced by the DOCX/PPTX exporters must stay schema-valid (ECMA-376). Please mention it in the PR if you checked them in Word/PowerPoint/LibreOffice.
- **Security:** document content is untrusted. HTML from Office renderers must go through `core/sanitize.ts`, and no code path may load external resources while a document is displayed.
- **Bundle size:** format libraries are loaded with dynamic `import()`. Do not import them statically from code that is part of the initial bundle.
- **Public API:** everything exported from `src/public-api.ts` is public. Breaking changes need a note in `CHANGELOG.md`.
- **Style:** Prettier + ESLint configuration of the repository, standalone components, signals, `OnPush`.
- **Commits:** small, focused commits with a meaningful message. [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` …) are appreciated.

## Changelog

Add a line to the `Unreleased` section of [CHANGELOG.md](CHANGELOG.md) for every user-visible change.

## Releasing (maintainers)

1. Move the `Unreleased` entries in `CHANGELOG.md` to a new version heading.
2. Bump `version` in `projects/ng-docviewer/package.json`.
3. Commit, tag `vX.Y.Z` and push the tag. CI runs all checks and publishes to npm with provenance. The tag must match the package version.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
