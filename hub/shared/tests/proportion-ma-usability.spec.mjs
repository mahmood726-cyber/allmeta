// proportion-ma — recorded "easy to use" walkthrough (lane ux, 2026-10-19).
//
// Six items: zero install (http + file:// offline), one-click example, core output in <=3 clicks,
// clear input errors, WCAG 2.1 AA (axe-core) + keyboard + focus + 375 px, sensible defaults.
// Plus the user-visible replays: "Replay published corpus (stored references)" (original paper,
// 298,116 checks) and "Replay GLMM corpus" in "Validate the extras in R" (7,248 checks), clicked
// through the page as a user would, reading the counts the page prints.
// Findings: C:\mh-lanes\p6-9\scratch\ux\USABILITY.md (lane report).
// This spec runs against the frozen proportion-ma page (pinned by validate/check-plus.mjs). Defects that the page
// does not fix are expected failures (test.fail) carrying an ISSUE note; the assertion states the behaviour we want,
// so the test flips to "unexpectedly passed" the day the defect is fixed. Missing elements fail as assertions,
// not timeouts, so an expected failure cannot be satisfied by a hang.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const APP = 'proportion-ma';
const PAGE = `/${APP}/index.html`;
const FILE_URL = new URL(`../../../${APP}/index.html`, import.meta.url).href;
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/|file:|data:|blob:|about:)/;
const INPUT = '#src';
const MESSAGES = ['#parse-warn', '#res-body', '#het', '#k-warn'];
const DEFAULT_POOLED = /8\.\d%/;

function watch(page) {
  const w = { external: [], errors: [] };
  page.on('request', (r) => { if (!LOCAL.test(r.url())) w.external.push(r.url()); });
  page.on('pageerror', (e) => w.errors.push(e.message));
  return w;
}
async function shown(page) {
  const parts = [];
  for (const sel of MESSAGES) if (await page.locator(sel).count()) parts.push((await page.locator(sel).innerText()).replace(/\s+/g, ' ').trim());
  return parts.filter(Boolean).join(' | ');
}
async function enter(page, text) {
  await page.locator(INPUT).fill(text);
  await page.locator('#btn-run').click();
}
const coreVisible = async (page) => {
  await expect(page.locator('#res-body .pooled-row')).toContainText(DEFAULT_POOLED);
  await expect(page.locator('#forest polygon')).toHaveCount(1);
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

  test('2 example dataset: "Load example" restores and analyses the example in one click', async ({ page }) => {
    test.fail(true, 'ISSUE: there is no "Load example" control; the example is pre-filled on first load only, so a user who has edited the data cannot get it back in one click.');
    await page.goto(PAGE);
    await enter(page, '1, 100, a\n2, 100, b\n3, 100, c');
    await expect(page.locator('#res-body tr')).toHaveCount(4);
    await expect(page.locator('#res-body .pooled-row')).not.toContainText(DEFAULT_POOLED);
    await expect(page.getByRole('button', { name: 'Load example', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Load example', exact: true }).click(); // click 1
    await coreVisible(page);
    await expect(page.locator('#res-body tr')).toHaveCount(8); // 7 studies + pooled row
  });

  test('3 core output in <=3 clicks from a fresh load', async ({ page }, info) => {
    await page.goto(PAGE);
    await coreVisible(page); // 0 clicks: the bundled example is analysed on load
    await page.locator('#btn-run').click(); // click 1
    await coreVisible(page);
    info.annotations.push({ type: 'clicks', description: '0 (auto-run on load); path: open page -> Run analysis (1)' });
  });

  const CASES = [
    { name: 'non-numeric', text: 'a, b, A\nc, d, B\ne, f, C', want: /Line 1: events and total must be numbers.*Need at least 2 studies/,
      known: 'ISSUE: only "Need at least 2 studies." is shown; no line says which values were not numbers.' },
    { name: 'negative count / events above total', text: '12, 150, A\n-8, 90, B\n20, 220, C\n30, 20, D', want: /Line 2: events cannot be negative.*Line 4: events \(30\) exceed total \(20\)/,
      known: 'ISSUE: the rows with events = -8 and with events 30 > total 20 are dropped silently; the model is fitted to 2 of 4 studies with no note.' },
    { name: 'k = 1', text: '12, 150, A', want: /Need at least 2 studies/ },
    { name: 'empty', text: '', want: /No studies entered.*Need at least 2 studies/,
      known: 'ISSUE: empty input reports only "Need at least 2 studies." instead of saying that no studies were entered.' },
    { name: 'mismatched columns', text: '12\n8, 90, B, extra, 7\n20\n5, 60, D', want: /Line 1: needs events and total.*Line 2: has 5 columns/,
      known: 'ISSUE: the one-column lines are dropped and the extra columns ignored, silently; the fit uses 2 of 4 lines.' },
    { name: 'non-integer counts', text: '12.5, 150, A\n8, 90, B', want: /Line 1: events and total should be whole numbers; read as 12, 150/,
      known: 'ISSUE: 12.5 events are read as 12 silently (no "read as" note).' },
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
    await enter(page, '12, 150, A');
    await expect(page.locator('#res-body')).toHaveText('Need at least 2 studies.');
    await expect(page.locator('#het')).toBeEmpty();
    await expect(page.locator('#forest polygon')).toHaveCount(0);
  });

  test('5a axe-core WCAG 2.1 A/AA: no serious or critical violations (after invalid input)', async ({ page }, info) => {
    await page.goto(PAGE);
    await coreVisible(page);
    await enter(page, '12, 150, A\n-8, 90, B\n20, 220, C');
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
    await page.evaluate(() => { const t = document.getElementById('src'); t.value = t.value.replace('12, 150, Study A', '60, 150, Study A'); });
    let tabsToRun = 0;
    while (tabsToRun < 25 && !(await page.evaluate(() => document.activeElement && document.activeElement.id === 'btn-run'))) { await page.keyboard.press('Tab'); tabsToRun++; }
    expect(tabsToRun).toBeLessThan(25);
    await page.waitForTimeout(300);
    const focused = await page.locator('#btn-run').evaluate((e) => { const s = getComputedStyle(e); return s.outlineStyle + s.outlineWidth + s.boxShadow; });
    // A focus indicator must be painted (outline or box-shadow) and differ from the unfocused state (checked below).
    // On the frozen page it is a 3 px box-shadow ring; the 2 px solid outline was part of the page edit split off from #156.
    expect(focused).toMatch(/^(?!none)|rgba?\(/);
    const before = await page.locator('#res-body').innerText();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('#res-body').innerText()).not.toBe(before);
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
    test.fail(true, 'ISSUE: the page scrolls horizontally at 375 px (wider than the viewport; measured 414 px in Edge).');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(PAGE);
    await coreVisible(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test('6 defaults: logit transformation with Paule-Mandel tau2 (paper Methods; FT shown with its caveat)', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('#trans')).toHaveValue('logit');
    await expect(page.locator('#tau-est')).toHaveValue('PM');
    await expect(page.locator('#trans').locator('xpath=..')).toContainText('Schwarzer');
  });

  test('extras: "Replay published corpus (stored references)" through the page prints 298116/298116', async ({ page }, info) => {
    test.setTimeout(600000);
    await page.goto(PAGE);
    await page.getByRole('button', { name: 'Replay published corpus (stored references)', exact: true }).click();
    const status = page.locator('#alm-validate [role=status]').first();
    await expect(status).toContainText(/\d+\/\d+ passed; \d+ failed checks/, { timeout: 540000 });
    const text = await status.innerText();
    info.annotations.push({ type: 'replay', description: text });
    expect(text).toMatch(/^298116\/298116 passed; 0 failed checks\. Paper: 298116 checks\./);
    expect(text).not.toMatch(/FAIL/);
  });

  test('extras: "Replay GLMM corpus" in "Validate the extras in R", offline, prints 7248/7248', async ({ page, context }, info) => {
    test.setTimeout(600000);
    await page.goto(PAGE);
    await page.evaluate(() => AlmPropPlusValidation.prepare()); // cache pinned files, then cut the network
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Replay GLMM corpus', exact: true }).click();
    const status = page.locator('#alm-validate-plus [role=status]').first();
    await expect(status).toContainText(/\d+\/\d+ passed; \d+ failed checks/, { timeout: 540000 });
    const text = await status.innerText();
    info.annotations.push({ type: 'replay', description: text });
    expect(text).toMatch(/^7248\/7248 passed; 0 failed checks\. Paper: 7248 checks\./);
    expect(text).not.toMatch(/FAIL/);
  });
});
