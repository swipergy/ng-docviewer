import { expect, Page } from '@playwright/test';

export const SAMPLES = {
  PDF: { file: 'sample.pdf', kind: 'pdf', pages: 3 },
  Word: { file: 'sample.docx', kind: 'docx', pages: 2 },
  PowerPoint: { file: 'sample.pptx', kind: 'pptx', pages: 3 },
  JPG: { file: 'sample.jpg', kind: 'image', pages: 1 },
  PNG: { file: 'sample.png', kind: 'image', pages: 1 },
  Audio: { file: 'sample.mp3', kind: 'audio', pages: 0 },
} as const;

export type SampleName = keyof typeof SAMPLES;

export async function openSample(page: Page, name: SampleName): Promise<void> {
  const s = SAMPLES[name];
  await page.click(`[data-sample="${name}"]`);
  await expect(page.getByTestId('log').locator('li').first()).toContainText(`geladen: ${s.file} (${s.kind}, ${s.pages} Seiten)`);
  await expect(page.locator('sy-doc-viewer .sy-status')).toHaveCount(0);
}

/** Selektor der Wasserzeichen-Ebene (zufälliges Attribut → über Position im Stage finden). */
export function overlay(page: Page) {
  return page.locator('sy-doc-viewer .sy-stage > div:not(.sy-scroll)');
}
