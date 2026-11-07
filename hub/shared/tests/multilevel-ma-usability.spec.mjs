// multilevel-ma — recorded "easy to use" walkthrough (lane ux, 2026-10-19).
//
// Six items: zero install (http + file:// offline), one-click example, core output in <=3 clicks,
// clear input errors, WCAG 2.1 AA (axe-core) + keyboard + focus + 375 px, sensible defaults.
// Known defects are expected failures (test.fail) carrying an ISSUE note; the assertion states the
// behaviour we want, so the test flips to "unexpectedly passed" the day the defect is fixed.
// Findings and proposed diffs: C:\mh-lanes\p6-9\scratch\ux\USABILITY.md (lane report).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const APP = 'multilevel-ma';
const PAGE = `/${APP}/index.html`;
const FILE_URL = new URL(`../../../${APP}/index.html`, import.meta.url).href;
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/|file:|data:|blob:|about:)/;
const INPUT = '#src';
const MESSAGES = ['#summary', '#body'];
const DEFAULT_POOLED = '0.313'; // MoM pooled estimate of the bundled example

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
  await expect(page.locator('#summary')).toContainText('REML');
  await expect(page.locator('#summary')).toContainText('Pooled estimate');
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

  test('2 example dataset: a control restores and analyses the example in one click', async ({ page }) => {
    await page.goto(PAGE);
    await enter(page, '1, 0.5, 0.1, a\n2, 0.4, 0.1, b\n3, 0.3, 0.1, c');
    expect(await page.getByRole('button', { name: /example/i }).count(), 'an example control exists').toBeGreaterThan(0);
    await page.getByRole('button', { name: /example/i }).first().click({ timeout: 2000 }); // click 1
    await expect(page.locator('#summary')).toContainText(DEFAULT_POOLED);
  });

  test('3 core output in <=3 clicks from a fresh load', async ({ page }, info) => {
    await page.goto(PAGE);
    await coreVisible(page); // 0 clicks: the bundled example is analysed on load
    await page.locator('#btn-run').click(); // click 1
    await coreVisible(page);
    info.annotations.push({ type: 'clicks', description: '0 (auto-run on load); path: open page -> Run analysis (1)' });
  });

  const CASES = [
    { name: 'non-numeric', text: '1, a, b, x\n1, c, d, y\n2, e, f, z\n3, g, h, w', want: /non-numeric|not a number|must be numbers|could not read/i,
      known: 'ISSUE: nothing is shown; run() returns silently when fewer than 3 rows parse and the PREVIOUS data set\'s results stay on screen.' },
    { name: 'negative SE', text: '1, 0.35, 0.12, A\n1, 0.28, -0.11, B\n2, 0.18, 0.09, C\n2, 0.22, 0.10, D\n3, 0.50, 0.15, E\n3, 0.48, 0.14, F', want: /line 2.*(SE|standard error)/i,
      known: 'ISSUE: the row with SE = -0.11 is dropped silently and the model is fitted to 5 rows with no note.' },
    { name: 'k = 1', text: '1, 0.35, 0.12, A', want: /at least 3|need/i },
    { name: 'empty', text: '', want: /no studies|nothing entered|empty|enter (one|at least)/i,
      known: 'ISSUE: no message; the previous data set\'s pooled estimate stays on screen.' },
    { name: 'mismatched columns', text: '1, 0.35\n1, 0.28, 0.11, B, extra\n2, 0.18, 0.09\n0.22, 0.10\n3, 0.50, 0.15, E', want: /column/i,
      known: 'ISSUE: short rows are dropped silently (the two-column row "0.22, 0.10" is read as cluster "0.22" with no SE) and the fit uses 3 rows.' },
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
    await expect(page.locator('#summary')).toContainText(DEFAULT_POOLED);
    await enter(page, '');
    await expect(page.locator('#summary')).not.toContainText(DEFAULT_POOLED);
  });

  test('5a axe-core WCAG 2.1 A/AA: no serious or critical violations', async ({ page }, info) => {
    await page.goto(PAGE);
    await coreVisible(page);
    // Measure the settled page: hub/app-style.css fades main/.panel in over 300 ms (+60 ms delay), and axe run
    // mid-fade blends the ancestor opacity into every colour (see c9e5b8f; #165 CI color-contrast).
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const summary = r.violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}`);
    info.annotations.push({ type: 'axe', description: `axe-core ${r.testEngine.version}: ${summary.join('; ') || 'no violations'}` });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });

  test('5b keyboard only: reach Run, run, reach CSV export, download; focus is visible', async ({ page }, info) => {
    await page.goto(PAGE);
    await coreVisible(page);
    await page.evaluate(() => { document.getElementById('src').value = document.getElementById('src').value.replace('1, 0.35, 0.12', '1, 0.95, 0.12'); });
    let tabsToRun = 0;
    while (tabsToRun < 25 && !(await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-run'))) { await page.keyboard.press('Tab'); tabsToRun++; }
    expect(tabsToRun).toBeLessThan(25);
    await page.waitForTimeout(300);
    const focused = await page.locator('#btn-run').evaluate((e) => { const s = getComputedStyle(e); return s.outlineStyle + s.outlineWidth + s.boxShadow; });
    const before = await page.locator('#summary').innerText();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('#summary').innerText()).not.toBe(before);
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
    test.fail(true, 'ISSUE: the page scrolls horizontally at 375 px (wider than the viewport; export button row does not wrap; grid column sized by content).');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(PAGE);
    await coreVisible(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test('6 defaults: REML (the validated estimator, per the paper) is the primary result', async ({ page }) => {
    test.fail(true, 'ISSUE: the method-of-moments table is shown first, the forest-plot diamond and the CSV/JSON exports use MoM, while the footer and paper call REML the recommended, validated result.');
    await page.goto(PAGE);
    // The validation adapter reads '#summary table' by index, so the REML lead must not reorder the tables.
    await expect(page.locator('#summary > *').first()).toContainText('REML');
    await expect(page.locator('#summary table').nth(1)).toContainText('REML');
  });
});
