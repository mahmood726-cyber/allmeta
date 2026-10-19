// pubbias-tests — recorded "easy to use" walkthrough (lane ux, 2026-10-19).
//
// Six items: zero install (http + file:// offline), one-click example, core output in <=3 clicks,
// clear input errors, WCAG 2.1 AA (axe-core) + keyboard + focus + 375 px, sensible defaults.
// Known defects are expected failures (test.fail) carrying an ISSUE note; the assertion states the
// behaviour we want, so the test flips to "unexpectedly passed" the day the defect is fixed.
// Findings and proposed diffs: C:\mh-lanes\p6-9\scratch\ux\USABILITY.md (lane report).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const APP = 'pubbias-tests';
const PAGE = `/${APP}/index.html`;
const FILE_URL = new URL(`../../../${APP}/index.html`, import.meta.url).href;
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/|file:|data:|blob:|about:)/;
const INPUT = '#src';
const MESSAGES = ['#body'];
const DEFAULT_ROWS = 10;

function watch(page) {
  const w = { external: [], errors: [] };
  page.on('request', (r) => { if (!LOCAL.test(r.url())) w.external.push(r.url()); });
  page.on('pageerror', (e) => w.errors.push(e.message));
  return w;
}
async function shown(page) {
  const parts = [];
  for (const sel of MESSAGES) parts.push((await page.locator(sel).innerText()).replace(/\s+/g, ' ').trim());
  return parts.join(' | ');
}
async function enter(page, text) {
  await page.locator(INPUT).fill(text);
  await page.locator('#btn-run').click();
}
const coreVisible = async (page) => {
  await expect(page.locator('#body')).toContainText('Egger');
  await expect(page.locator('#body')).toContainText('Trim-and-fill');
};

test.describe(`${APP} usability`, () => {
  // pc2 is shared by several lanes; page loads alone have taken >30 s there.
  test.describe.configure({ timeout: 120000 });

  test('1a zero install: http load computes, no external hosts, no page errors', async ({ page }) => {
    const w = watch(page);
    await page.goto(PAGE);
    await coreVisible(page);
    await page.locator('#btn-run').click();
    await coreVisible(page);
    expect(w.external).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test('1b zero install: file:// with the network offline', async ({ page, context }) => {
    const w = watch(page);
    await context.setOffline(true);
    await page.goto(FILE_URL);
    await coreVisible(page);
    await expect(page.locator('#funnel circle')).toHaveCount(DEFAULT_ROWS);
    await page.locator('#btn-run').click();
    await coreVisible(page);
    expect(w.external).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test('2 example dataset: one action on the benchmark selector loads and analyses BCG (k = 13)', async ({ page }) => {
    test.fail(true, 'ISSUE: the "Try with" selector writes "label, logRR, SE" lines; parseTESE() reads the year in the label as the effect and drops 10 of 13 trials (k = 3), and the loader does not run the analysis (results marked out of date).');
    await page.goto(PAGE);
    await page.locator('#alm-hero-mount select').selectOption('bcg'); // action 1
    await expect(page.locator('#analysis-stale')).toBeHidden();
    await expect(page.locator('#funnel circle')).toHaveCount(13);
    await coreVisible(page);
  });

  test('3 core output in <=3 clicks from a fresh load', async ({ page }, info) => {
    await page.goto(PAGE);
    await coreVisible(page); // 0 clicks: the bundled example is analysed on load
    await page.locator('#btn-run').click(); // click 1
    await coreVisible(page);
    info.annotations.push({ type: 'clicks', description: '0 (auto-run on load); path: open page -> Run analysis (1)' });
  });

  const CASES = [
    { name: 'non-numeric', text: 'a, b\nc, d\ne, f\ng, h\ni, j\nk, l', want: /non-numeric|not a number|must be numbers|could not read/i,
      known: 'ISSUE: every line rejected but the page only says "very low power below k=10. Current k = 0".' },
    { name: 'negative SE', text: '0.25, 0.08\n0.18, -0.10\n0.40, 0.15\n0.30, 0.09\n0.12, 0.07\n0.55, 0.20\n0.22, 0.08\n0.32, 0.12\n0.45, 0.17\n0.28, 0.10', want: /line 2.*(SE|standard error)/i,
      known: 'ISSUE: the row with SE = -0.10 is dropped silently and the tests run on k = 9 with no note.' },
    { name: 'k = 1', text: '0.25, 0.08', want: /k = 1/ },
    { name: 'empty', text: '', want: /no studies|nothing entered|empty|enter (one|at least)/i,
      known: 'ISSUE: empty input reports "very low power below k=10. Current k = 0" instead of saying no data were entered.' },
    { name: 'mismatched columns', text: '0.25\n0.18, 0.10, 7\n0.40, 0.15\n0.30\n0.12, 0.07\n0.55, 0.20\n0.22, 0.08\n0.32, 0.12, 9, 9', want: /column/i,
      known: 'ISSUE: one-column lines are dropped and extra columns ignored, silently; tests run on k = 6.' },
  ];
  for (const c of CASES) {
    test(`4 input error: ${c.name}`, async ({ page }, info) => {
      if (c.known) test.fail(true, c.known);
      const w = watch(page);
      await page.goto(PAGE);
      await enter(page, c.text);
      const msg = await shown(page);
      info.annotations.push({ type: 'message', description: msg.slice(0, 300) });
      expect(w.errors).toEqual([]);
      expect(msg).not.toMatch(/TypeError|ReferenceError|undefined|NaN/);
      expect(msg).toMatch(c.want);
    });
  }

  test('4 refusal does not leave the previous plot on screen', async ({ page }) => {
    test.fail(true, 'ISSUE: when k < 5 runAnalysis() returns before drawFunnel(), so the previous funnel plot stays visible beside the refusal.');
    await page.goto(PAGE);
    await expect(page.locator('#funnel circle')).toHaveCount(DEFAULT_ROWS);
    await enter(page, '');
    await expect(page.locator('#funnel circle')).toHaveCount(0);
  });

  test('5a axe-core WCAG 2.1 A/AA: no serious or critical violations', async ({ page }, info) => {
    await page.goto(PAGE);
    await coreVisible(page);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const summary = r.violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}`);
    info.annotations.push({ type: 'axe', description: `axe-core ${r.testEngine.version}: ${summary.join('; ') || 'no violations'}` });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });

  test('5b keyboard only: reach Run, run, reach CSV export, download; focus is visible', async ({ page }, info) => {
    await page.goto(PAGE);
    await coreVisible(page);
    await page.evaluate(() => { document.getElementById('src').value = document.getElementById('src').value.replace('0.25, 0.08', '0.95, 0.08'); });
    let tabsToRun = 0;
    while (tabsToRun < 25 && !(await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-run'))) { await page.keyboard.press('Tab'); tabsToRun++; }
    expect(tabsToRun).toBeLessThan(25);
    await page.waitForTimeout(300); // focus styles are transitioned
    const focused = await page.locator('#btn-run').evaluate((e) => { const s = getComputedStyle(e); return s.outlineStyle + s.outlineWidth + s.boxShadow; });
    const before = await page.locator('#body').innerText();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('#body').innerText()).not.toBe(before);
    let tabsToCsv = 0;
    while (tabsToCsv < 80 && (await page.evaluate(() => (document.activeElement.innerText || '').trim())) !== 'CSV') { await page.keyboard.press('Tab'); tabsToCsv++; }
    expect(tabsToCsv).toBeLessThan(80);
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await page.locator('#btn-run').evaluate((e) => e.blur());
    await page.waitForTimeout(300);
    const blurred = await page.locator('#btn-run').evaluate((e) => { const s = getComputedStyle(e); return s.outlineStyle + s.outlineWidth + s.boxShadow; });
    expect(focused).not.toBe(blurred);
    info.annotations.push({ type: 'keyboard', description: `Tab x${tabsToRun} -> Run, Enter; Tab x${tabsToCsv} -> CSV, Enter` });
  });

  test('5c 375 px: no horizontal page scroll', async ({ page }) => {
    test.fail(true, 'ISSUE: page is 476 px wide at 375 px (single grid column sized by the results table and form controls).');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(PAGE);
    await coreVisible(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test('6 defaults: generic effect + SE input; Egger t test and L0/REML trim-and-fill as in the paper', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('#format')).toHaveValue('te-se');
    await expect(page.locator('header')).toContainText('Trim-and-fill uses L0 and REML');
    await expect(page.locator('header')).toContainText('t test with k-2 degrees of freedom');
    await expect(page.locator('#body')).toContainText('not validated against metafor'); // selection model labelled experimental
  });
});
