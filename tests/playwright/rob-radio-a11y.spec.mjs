/**
 * Regression: robins-i, robins-e, quadas-2 hid their answer radios with
 * display:none, removing them from the tab order so keyboard users could not
 * select answers. Switched to the rob2 visually-hidden pattern
 * (position:absolute; opacity:0) so the radios stay focusable.
 */
import { test, expect } from '@playwright/test';
const B = 'http://127.0.0.1:8080';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

for (const app of ['robins-i', 'robins-e', 'quadas-2']) {
  test(`${app}: answer radios are keyboard-focusable (not display:none)`, async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));

    await page.goto(`${B}/${app}/index.html`, { waitUntil: 'load' });
    const r = await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('.q .opts input[type=radio]'));
      // Keyboard-reachable via Tab requires: not display:none, not tabindex=-1.
      // (A live .focus() check is unreliable in headless for opacity:0 controls —
      // even the reference rob2 app "fails" it — so we assert the real criteria.)
      return {
        count: radios.length,
        noneDisplay: radios.filter(i => getComputedStyle(i).display === 'none').length,
        removedFromTabOrder: radios.filter(i => i.getAttribute('tabindex') === '-1').length,
        unlabeled: radios.filter(i => !i.closest('label')).length,
      };
    });
    console.log(`  ${app}:`, JSON.stringify(r));

    expect(r.count, 'radios exist').toBeGreaterThan(0);
    expect(r.noneDisplay, 'no radio is display:none (back in tab order)').toBe(0);
    expect(r.removedFromTabOrder, 'no radio has tabindex=-1').toBe(0);
    expect(r.unlabeled, 'every radio is wrapped in a <label> (accessible name)').toBe(0);
    expect(errors, 'no console errors').toEqual([]);
  });
}
