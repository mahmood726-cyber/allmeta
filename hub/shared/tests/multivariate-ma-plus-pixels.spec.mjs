// Pixel references for the multivariate-ma joint plot and rho_w sweep plot (Windows Edge, CI job plus-pixels).
import { test, expect } from './validation-fixture.mjs';
const options = { threshold: 0.2, maxDiffPixelRatio: 0.005, animations: 'disabled', caret: 'hide' };
test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' });
for (const [name, button] of [['berkey', 'btn-ex-berkey'], ['hyp', 'btn-ex-hyp']]) test('multivariate-ma plus pixels ' + name, async ({ page }) => {
  await page.goto('/multivariate-ma/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.AlmMvPlusUI && window._almLastMultivariate());
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#' + button).click(); await page.locator('#plus-run').click();
  await expect(page.locator('#plus-status')).toContainText('19 of 19');
  await expect(page.locator('#plot-host svg')).toHaveScreenshot('mv-' + name + '-joint.png', options);
  await expect(page.locator('#plus-sweep-plot svg')).toHaveScreenshot('mv-' + name + '-sweep.png', options);
});
