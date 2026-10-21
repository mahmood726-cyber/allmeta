// correlation-ma plus panel in a real browser: rendering, keyboard path, R-script download,
// axe-core on the new regions, forest stroke contrast in both colour schemes.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const open = async (page) => { await page.goto('/correlation-ma/index.html'); await page.waitForFunction(() => window._almCorrPlus && window._almCorrPlus()); };

test('plus panel renders the 12-cell sensitivity table for the built-in example', async ({ page }) => {
  await open(page);
  await expect(page.locator('#alm-plus-sens tbody tr')).toHaveCount(12);
  await expect(page.locator('#alm-plus-sens tr[aria-current=true] th')).toHaveText('REML');
  const plus = await page.evaluate(() => window._almCorrPlus());
  expect(plus._schema).toBe('corr-ma-plus-v1');
  expect(plus.k).toBe(8);
  // FE x HKSJ is reported, not computed
  await expect(page.locator('#alm-plus-sens tbody tr').nth(10).locator('td').nth(1)).toHaveText('not applicable');
});

test('keyboard path: choose HKSJ with arrow keys, run leave-one-out with Enter', async ({ page }) => {
  await open(page);
  await page.locator('input[name=alm-plus-test][value=z]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[name=alm-plus-test][value=knha]')).toBeChecked();
  await expect(page.locator('#alm-plus-sens tr[aria-current=true] td').first()).toContainText('HKSJ');
  await page.locator('#alm-plus-loo-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#alm-plus-loo tbody tr')).toHaveCount(8);
  await expect(page.locator('#alm-plus-loo svg')).toHaveAttribute('role', 'img');
});

// The generated file is read from the Blob handed to the download anchor (native Edge download
// completion is not exercised here; on the test host it hangs for the unmodified v1 page as well).
test('Download R script (Enter) hands one runnable metafor script to the download anchor', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    // The page CSP (connect-src 'self') forbids fetching blob: URLs, so capture the Blob itself.
    window.__dl = []; window.__blobs = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__blobs.push(b); return create(b); };
    HTMLAnchorElement.prototype.click = function () { window.__dl.push(this.download); };
  });
  await page.locator('input[name=alm-plus-test][value=knha]').check();
  await page.locator('#alm-plus-rloo').check();
  await page.locator('#alm-plus-r').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#alm-plus-rmsg')).toContainText('R script downloaded');
  const got = await page.evaluate(async () => ({ name: window.__dl[0], text: await window.__blobs[window.__blobs.length - 1].text(), n: window.__dl.length }));
  expect(got.n).toBe(1);
  expect(got.name).toBe('correlation-ma-REML-knha.R');
  expect(got.text.match(/ALMJSON:/g)).toHaveLength(1);
  expect(got.text).toContain('test = "knha"');
  expect(got.text).toContain('leave1out(fit)');
  expect(got.text).toContain('qt(0.975, df = k - 1)');
});

test('usability tools: notice, clear, example, convert', async ({ page }) => {
  await open(page);
  await page.locator('#f-data').fill('a, .2, 20\nb, 1, 30\nc, -.3, 30');
  await expect(page.locator('#f-notice')).toBeVisible();
  await expect(page.locator('#f-notice')).toContainText('|r| >= 1');
  await page.locator('#f-tools button[data-tool=clear]').click();
  await expect(page.locator('#headline')).toHaveText('Enter at least 2 studies (label, r, n).');
  await page.locator('#f-tools button[data-tool=example]').click();
  await expect(page.locator('#alm-plus-sens tbody tr')).toHaveCount(12);
  await page.locator('#f-data').fill('a\t0,2\t20\nb\t-0,3\t30');
  await page.locator('#f-tools button[data-tool=convert]').click();
  await expect(page.locator('#f-data')).toHaveValue('a, 0.2, 20\nb, -0.3, 30');
  await expect(page.locator('#f-notice')).toBeHidden();
});

for (const scheme of ['light', 'dark']) test(`axe-core on the new regions and forest stroke contrast (${scheme})`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: scheme });
  await open(page);
  await page.locator('#alm-plus-loo-btn').click();
  await page.locator('#f-data').fill(await page.locator('#f-data').inputValue() + '\nbad, 2, 30');
  await expect(page.locator('#f-notice')).toBeVisible();
  const r = await new AxeBuilder({ page }).include('#alm-plus').include('#f-tools').include('#f-notice').include('#forest-host').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const v = r.violations.map((x) => x.id + ': ' + x.nodes.map((n) => n.target.join(' ')).join(' | '));
  console.log(`[axe ${scheme}] violations=${r.violations.length} passes=${r.passes.length} ${v.join(' ;; ')}`);
  expect(v).toEqual([]);
  const ratio = await page.evaluate(() => {
    const line = document.querySelector("#forest-host svg line[stroke='#6aa6d4']");
    const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = (c) => { const a = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
    const bg = document.querySelector('#forest-host svg rect').getAttribute('fill');
    const hex = (h) => { if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
    const x = lum(rgb(getComputedStyle(line).stroke)), y = lum(hex(bg));
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  });
  console.log(`[contrast ${scheme}] forest study CI stroke ${ratio.toFixed(2)}:1`);
  expect(ratio).toBeGreaterThanOrEqual(3);
});
