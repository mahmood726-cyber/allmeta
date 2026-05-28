/**
 * Regression for the off-by-one aria-label bug: every <label>-wrapped numeric
 * input in effect-size-converter and mcid carried the NEXT field's label as an
 * aria-label, which overrides the wrapping <label> — so screen readers announced
 * the wrong field. The bogus aria-labels were removed so the wrapping <label>
 * provides the correct name.
 *
 * Correct invariants (NOT "zero aria-labels": standalone inputs like the shared
 * axis-controls min/max legitimately use aria-label):
 *  1. every <input> has an accessible name (wrapped in <label> OR has aria-label);
 *  2. no <label>-WRAPPED input also has an aria-label (that's the override bug).
 */
import { test, expect } from '@playwright/test';
const B = 'http://127.0.0.1:8080';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

for (const app of ['effect-size-converter', 'mcid']) {
  test(`${app}: every input named; no wrapped input has a conflicting aria-label`, async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));

    await page.goto(`${B}/${app}/index.html`, { waitUntil: 'load' });
    const r = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type=number], input[type=text]'));
      const wrapped = (i) => !!i.closest('label');
      const aria = (i) => i.getAttribute('aria-label');
      return {
        total: inputs.length,
        unnamed: inputs.filter(i => !wrapped(i) && !aria(i)).length,         // no name at all
        wrappedWithAria: inputs.filter(i => wrapped(i) && aria(i)).length,    // the override bug
      };
    });
    console.log(`  ${app}:`, JSON.stringify(r));
    expect(r.total, 'inputs exist').toBeGreaterThan(0);
    expect(r.unnamed, 'every input has an accessible name').toBe(0);
    expect(r.wrappedWithAria, 'no <label>-wrapped input carries a conflicting aria-label').toBe(0);
    expect(errors, 'no console errors').toEqual([]);
  });
}
