// meta-regression — recorded "easy to use" walkthrough (lane ux, 2026-10-19).
//
// Six items: zero install (http + file:// offline), one-click example, core output in <=3 clicks,
// clear input errors, WCAG 2.1 AA (axe-core) + keyboard + focus + 375 px, sensible defaults.
// Known defects are expected failures (test.fail) carrying an ISSUE note; the assertion states the
// behaviour we want, so the test flips to "unexpectedly passed" the day the defect is fixed.
// Findings and proposed diffs: C:\mh-lanes\p6-9\scratch\ux\USABILITY.md (lane report).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const APP = 'meta-regression';
const PAGE = `/${APP}/index.html`;
const FILE_URL = new URL(`../../../${APP}/index.html`, import.meta.url).href;
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/|file:|data:|blob:|about:)/;
const INPUT = '#f-data';
const MESSAGES = ['#stats-wrap', '#warn-banner', '#svg-host'];

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
const kShown = (page) => page.locator('#stats-wrap .stat .v').first();
const coreVisible = async (page) => {
  await expect(page.locator('#stats-wrap')).toContainText(/slope/i);
  await expect(page.locator('#svg-host svg circle').first()).toBeVisible();
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
    await page.locator('#btn-run').click();
    await coreVisible(page);
    expect(w.external).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  test('2a example dataset: "Load example" restores and analyses the example in one click', async ({ page }) => {
    await page.goto(PAGE);
    await enter(page, '');
    await expect(kShown(page)).toHaveText('0');
    await page.locator('#btn-example').click(); // click 1
    await expect(kShown(page)).toHaveText('8');
    await coreVisible(page);
  });

  test('2b example dataset: the benchmark selector loads and analyses BCG with its latitude moderator (k = 13)', async ({ page }) => {
    test.fail(true, 'ISSUE: the "Try with" BCG loader writes three-column "label, logRR, SE" lines (no moderator), so every line is rejected ("need 4 columns", k = 0) and the analysis is not re-run.');
    await page.goto(PAGE);
    await page.locator('#alm-hero-mount select').selectOption('bcg'); // action 1
    await expect(kShown(page)).toHaveText('13');
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
    { name: 'non-numeric', text: 'A, x, y, z\nB, p, q, r\nC, s, t, u\nD, v, w, k', want: /non-numeric/i },
    { name: 'negative SE', text: 'A, -0.28, 0.12, 32\nB, -0.22, -0.09, 35\nC, -0.15, 0.11, 42\nD, -0.10, 0.13, 48\nE, 0.04, 0.15, 55', want: /Line 2: SE≤0/ },
    { name: 'k = 1', text: 'A, -0.28, 0.12, 32', want: /k = 1 .*needs k ≥ 4/ },
    { name: 'empty', text: '', want: /Need ≥3 studies/ },
    { name: 'mismatched columns (too few and too many)', text: 'A, -0.28, 0.12\nB, -0.22, 0.09, 35, 9\nC, -0.15, 0.11, 42\nD, -0.10, 0.13, 48\nE, 0.04, 0.15, 55\nF, -0.05, 0.14, 51', want: /Line 1.*Line 2/s,
      known: 'ISSUE: a five-column line "B, -0.22, 0.09, 35, 9" is read from the LAST three fields (estimate 0.09, SE 35, moderator 9) with label "B, -0.22", silently; only the short line is reported.' },
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

  test('4 refusal does not leave the previous result on screen', async ({ page }) => {
    await page.goto(PAGE);
    await coreVisible(page);
    await enter(page, '');
    await expect(page.locator('#stats-wrap')).not.toContainText(/slope/i);
    await expect(page.locator('#svg-host svg circle')).toHaveCount(0);
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
    await page.evaluate(() => { const t = document.getElementById('f-data'); t.value = t.value.replace('Trial A, -0.28', 'Trial A, -0.98'); });
    let tabsToRun = 0;
    while (tabsToRun < 25 && !(await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-run'))) { await page.keyboard.press('Tab'); tabsToRun++; }
    expect(tabsToRun).toBeLessThan(25);
    await page.waitForTimeout(300);
    const focused = await page.locator('#btn-run').evaluate((e) => { const s = getComputedStyle(e); return s.outlineStyle + s.outlineWidth + s.boxShadow; });
    const before = await page.locator('#stats-wrap').innerText();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('#stats-wrap').innerText()).not.toBe(before);
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
    test.fail(true, 'ISSUE: the page scrolls horizontally at 375 px (wider than the viewport; measured 432-606 px depending on browser and fonts; fieldset min-content width, axis-control number inputs, unwrapped export row).');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(PAGE);
    await coreVisible(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test('6 defaults: Paule-Mandel tau2 with the floored Knapp-Hartung test, as in the paper', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('#stats-wrap')).toContainText(/τ² \(PM\)/i);
    await expect(page.locator('#stats-wrap')).toContainText(/HKSJ q/i);
    await expect(page.locator('#stats-wrap')).toContainText(/t\(6\)/); // k - 2 df for the 8-study example
    await expect(page.locator('#f-scale')).not.toBeChecked(); // experimental location-scale fit is opt-in
  });
});
