/**
 * Regression for the 2026-05-31 nma-dose-response-app dark-theme contrast fix.
 *
 * The app is an intentional dark "Glass" theme, but the shared hub/app-style.css
 * (loaded after the app's <style>) imposes its light-OS palette by clobbering the
 * design tokens (--panel/--input-bg/--panel-raised=#fff, --ink dark, --bg near-white),
 * so app-style.css's own rules painted white surfaces with dark text on top of the
 * app's dark regions — a battleground of 22 axe color-contrast nodes (dark-on-dark
 * where the app won, light-on-white where it lost). Fixed by re-asserting the app's
 * dark token values on html:root (winning specificity) so both stylesheets resolve
 * dark, plus light panel-heading text. This pins it at zero.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('nma-dose-response-app has zero colour-contrast violations', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/nma-dose-response-app/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const results = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
  const contrast = results.violations.filter(v => v.id === 'color-contrast');
  const nodes = contrast.flatMap(v => v.nodes.map(n => {
    const d = (n.any || []).find(x => x.id === 'color-contrast')?.data || {};
    return `${d.contrastRatio} fg=${d.fgColor} bg=${d.bgColor} ${n.target}`;
  }));
  expect(nodes, 'colour-contrast failures:\n' + nodes.join('\n')).toEqual([]);
});
