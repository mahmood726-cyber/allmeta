// pubbias-tests: axe WCAG 2.1 AA in light and dark (as loaded and after the one-click worked example), and
// autosave isolation of the #alm-plus extras (the defect class of #133/#149/#151).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const URL_ = '/pubbias-tests/index.html';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
test.describe.configure({ timeout: 120000 });

const violations = async page => (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations
  .flatMap(v => v.nodes.map(n => `${v.id} ${n.target} ${(n.html || '').slice(0, 80)}`));

for (const scheme of ['light', 'dark']) {
  test.describe(`scheme=${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`axe clean as loaded and after the worked example (${scheme})`, async ({ page }) => {
      await page.goto(URL_);
      await page.waitForTimeout(800);
      expect(await violations(page)).toEqual([]);
      await page.locator('#plus-example').click();
      await expect(page.locator('#plus-status')).toContainText('Leave-one-out complete');
      expect(await violations(page)).toEqual([]);
    });
  });
}

test('dark scheme: verdict chips have at least 4.5:1 contrast (white on the dark tokens did not)', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(URL_);
  await expect(page.locator('#body .chip').first()).toBeVisible();
  const ratio = (fg, bg) => {
    const L = c => { const v = c.match(/\d+/g).slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const [a, b] = [L(fg), L(bg)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05);
  };
  const chips = await page.locator('#body .chip').evaluateAll(els => els.map(e => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]));
  expect(chips.length).toBeGreaterThan(0);
  for (const [fg, bg] of chips) expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  // Planted negative: the previous chip ink (white) on the same dark backgrounds fails the bound.
  expect(chips.some(([, bg]) => ratio('rgb(255, 255, 255)', bg) < 4.5)).toBe(true);
  await ctx.close();
});

// Keys the ORIGINAL app's autosave writes on main (74ff0a7), captured with the same procedure (lane p610b probe).
const MAIN_AUTOSAVE_KEYS = ['alm-plot-1-format', 'alm-plot-1-physical-width', 'alm-plot-1-resolution', 'format', 'idx:1', 'idx:10',
  'idx:11', 'idx:12', 'idx:13', 'idx:3', 'idx:7', 'idx:8', 'idx:9', 'src'];
test('original autosave keys are exactly those on main; the extras are never saved into them', async ({ page }) => {
  await page.goto(URL_);
  const keysOf = appKey => page.evaluate(k => Object.keys((JSON.parse(localStorage.getItem('alm-autosave:' + k) || '{}').values) || {}).sort(), appKey);
  await page.evaluate(() => { localStorage.clear(); document.getElementById('src').dispatchEvent(new Event('input', { bubbles: true })); });
  await expect.poll(() => keysOf('pubbias-tests'), { timeout: 10000 }).toEqual(MAIN_AUTOSAVE_KEYS);
  // Using the extras must not write to (or re-index) the original key.
  await page.locator('#plus-example').click();
  await expect(page.locator('#plus-status')).toContainText('Leave-one-out complete');
  await page.evaluate(() => localStorage.clear());
  await page.locator('#plus-only-flagged').check();
  await page.waitForTimeout(1500);
  expect(await keysOf('pubbias-tests')).toEqual([]);
  await page.evaluate(() => document.getElementById('src').dispatchEvent(new Event('input', { bubbles: true })));
  await expect.poll(() => keysOf('pubbias-tests'), { timeout: 10000 }).toEqual(MAIN_AUTOSAVE_KEYS);
  // Planted negative: an autosave installed with the default selectors picks up the extras.
  await page.evaluate(() => { AlmAutosave.install({ appKey: 'p6-negative' }); document.getElementById('src').dispatchEvent(new Event('input', { bubbles: true })); });
  await expect.poll(() => keysOf('p6-negative'), { timeout: 10000 }).toContain('plus-only-flagged');
  expect(await keysOf('p6-negative')).not.toEqual(MAIN_AUTOSAVE_KEYS);
});
