/**
 * Verifies the DTA glossary tooltips resolve (regression for the missing
 * TP/FP/Se/Sp/... keys in hub/shared/glossary.json). Before the fix, a miss
 * echoed the bare abbreviation; now each should show its definition.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://127.0.0.1:8080/dta-sroc/index.html';

test('DTA glossary abbreviations resolve to definitions, not bare echoes', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  // tooltips.js fetches glossary.json then scans; wait for tip spans to attach.
  await page.waitForFunction(
    () => document.querySelector('abbr[data-gloss="Se"][aria-describedby]') !== null,
    { timeout: 10000 }
  );

  const results = await page.evaluate(() => {
    const want = ['TP', 'FP', 'FN', 'TN', 'Se', 'Sp', 'FPR', 'ROC', 'DTA'];
    const out = {};
    for (const term of want) {
      const ab = document.querySelector(`abbr[data-gloss="${term}"][aria-describedby]`);
      if (!ab) { out[term] = '(no abbr on page)'; continue; }
      const tip = document.getElementById(ab.getAttribute('aria-describedby'));
      out[term] = tip ? tip.textContent.trim() : '(no tip)';
    }
    return out;
  });
  console.log('  tooltip text:', JSON.stringify(results, null, 0));

  // Every term that appears on the page must resolve to more than its echo.
  for (const [term, text] of Object.entries(results)) {
    if (text.startsWith('(no abbr')) continue; // term not used on this page
    expect(text, `${term} tooltip should be a definition, not the bare echo`).not.toBe(term);
    expect(text.length, `${term} tooltip should be substantive`).toBeGreaterThan(term.length + 5);
  }
  // Se must resolve (it's definitely on the SROC page).
  expect(results.Se.toLowerCase()).toContain('sensitivity');
});
