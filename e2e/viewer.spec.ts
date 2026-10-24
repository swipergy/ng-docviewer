import { expect, test } from '@playwright/test';
import { openSample, overlay, SAMPLES, SampleName } from './helpers';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/?lang=de');
});

for (const name of Object.keys(SAMPLES) as SampleName[]) {
  test(`rendert ${name} mit Wasserzeichen`, async ({ page }) => {
    await openSample(page, name);
    const wm = overlay(page);
    await expect(wm).toHaveCount(1);
    await expect(wm).toHaveCSS('background-image', /data:image\/png/);
    await expect(wm).toHaveCSS('pointer-events', 'none');

    const viewer = page.locator('sy-doc-viewer');
    if (SAMPLES[name].pages > 1) {
      await expect(viewer.locator('.sy-page-indicator')).toContainText(`/ ${SAMPLES[name].pages}`);
    }
    if (name === 'PDF') {
      // Erste Seite ist tatsächlich gerendert (Canvas mit Größe)
      await expect.poll(() => viewer.locator('.sy-pdf-page canvas').first().evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(100);
    }
  });
}

test('Seitennavigation und Zoom', async ({ page }) => {
  await openSample(page, 'PDF');
  const viewer = page.locator('sy-doc-viewer');
  await viewer.getByRole('button', { name: 'Nächste Seite' }).click();
  await expect(viewer.locator('.sy-page-indicator input')).toHaveValue('2');
  const zoom = viewer.locator('.sy-zoom');
  const before = await zoom.textContent();
  await viewer.getByRole('button', { name: 'Vergrößern' }).click();
  await expect(zoom).not.toHaveText(before!);
  await expect(viewer.getByRole('button', { name: 'An Breite anpassen' })).toHaveAttribute('aria-pressed', 'false');
});

test('Wasserzeichen wird nach Entfernen wiederhergestellt', async ({ page }) => {
  await openSample(page, 'PDF');
  await overlay(page).evaluate((el) => el.remove());
  await expect(overlay(page)).toHaveCount(1);
  await expect(overlay(page)).toHaveCSS('display', 'block');
  await expect(page.getByTestId('log')).toContainText('Manipulation erkannt (removed), Anzahl 1');
});

test('Ausblenden per Style und per Stylesheet wird erkannt', async ({ page }) => {
  await openSample(page, 'Word');
  await overlay(page).evaluate((el) => (el.style.display = 'none'));
  await expect(page.getByTestId('log')).toContainText('Manipulation erkannt (modified)');
  await expect(overlay(page)).toHaveCSS('display', 'block');

  // Stylesheets können die Ebene nicht verschieben oder verkleinern (Inline-Styles mit !important).
  await page.addStyleTag({
    content: '.sy-stage > div:not(.sy-scroll) { margin-top: 200vh !important; padding: 50px !important; border: 40px solid red !important; offset-path: path("M0,2000") !important }',
  });
  await page.waitForTimeout(1500);
  const [layer, stage] = await Promise.all([overlay(page).boundingBox(), page.locator('sy-doc-viewer .sy-stage').boundingBox()]);
  expect(layer).toEqual(stage);
  await expect(page.getByTestId('log')).not.toContainText('gesperrt');
});

test('Inhalt wird nach wiederholter Manipulation gesperrt', async ({ page }) => {
  await openSample(page, 'PDF');
  for (let i = 0; i < 3; i++) {
    await overlay(page).evaluate((el) => el.remove());
    await expect(page.getByTestId('log')).toContainText(`Anzahl ${i + 1}`);
  }
  await expect(page.getByTestId('log')).toContainText('gesperrt');
  await expect(page.locator('sy-doc-viewer [role=alert]')).toContainText('Manipulation');
  await expect(page.locator('sy-doc-viewer .sy-content')).toHaveCount(0);
});

test('ohne Manipulationsschutz keine Wiederherstellung', async ({ page }) => {
  await page.getByLabel('Manipulationsschutz').uncheck();
  await openSample(page, 'PNG');
  await overlay(page).evaluate((el) => el.remove());
  await page.waitForTimeout(1500);
  await expect(overlay(page)).toHaveCount(0);
});

test('Kontextmenü und Strg+S/Strg+P werden abgefangen', async ({ page }) => {
  await page.addInitScript(() => {
    // Druckdialog im Druck-iframe unterdrücken und Aufrufe zählen
    const w = window as unknown as { __prints: number };
    w.__prints = 0;
    new MutationObserver((records) => {
      for (const node of records.flatMap((r) => Array.from(r.addedNodes))) {
        if (node instanceof HTMLIFrameElement && node.contentWindow) node.contentWindow.print = () => void w.__prints++;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/?lang=de');
  await openSample(page, 'JPG');
  const press = (key: string) =>
    page.evaluate((k) => {
      const ev = new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(ev);
      return ev.defaultPrevented;
    }, key);

  const ctxPrevented = await page.locator('sy-doc-viewer .sy-scroll').evaluate((el) => {
    const ctx = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(ctx);
    return ctx.defaultPrevented;
  });
  expect(ctxPrevented).toBe(true);

  // Fokus außerhalb des Viewers: Shortcuts der App bleiben unberührt
  await page.locator('input[type=file]').focus();
  expect(await press('s')).toBe(false);
  expect(await press('p')).toBe(false);

  // Fokus im Viewer: Weiterleitung auf Download/Druck mit Wasserzeichen
  await page.locator('sy-doc-viewer .sy-scroll').focus();
  const downloadEvent = page.waitForEvent('download');
  expect(await press('s')).toBe(true);
  expect((await downloadEvent).suggestedFilename()).toBe('sample.jpg');
  expect(await press('p')).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
});

test('Audio: Download bei Wasserzeichen deaktiviert, kein Drucken', async ({ page }) => {
  await openSample(page, 'Audio');
  const viewer = page.locator('sy-doc-viewer');
  await expect(viewer.getByRole('button', { name: /Download nicht verfügbar/ })).toBeDisabled();
  await expect(viewer.getByRole('button', { name: 'Drucken' })).toHaveCount(0);
});

test('Audio: ohne Wasserzeichen ist Download möglich', async ({ page }) => {
  await page.getByLabel('aktiv').uncheck();
  await openSample(page, 'Audio');
  await expect(page.locator('sy-doc-viewer').getByRole('button', { name: 'Herunterladen', exact: true })).toBeEnabled();
});
