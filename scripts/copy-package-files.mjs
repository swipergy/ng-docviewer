// Copies the repository documents into the built package so that npm shows the same README,
// license, changelog and security policy as GitHub (single source of truth in the repo root).
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

const dest = 'dist/swipergy/ng-docviewer';
for (const file of ['README.md', 'LICENSE', 'CHANGELOG.md', 'SECURITY.md']) {
  copyFileSync(file, join(dest, file));
}
console.log(`Copied package documents to ${dest}`);
