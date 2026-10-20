// correlation-ma extras: the page's second validation widget (#alm-plus-validate) replays the pinned
// extras evidence through the real plus panel in a real browser. Planted defects must fail it.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const pinsSrc = readFileSync(new URL('../../../correlation-ma/validate/plus-pins.js', import.meta.url), 'utf8');
const CHECKS = Number(/"checks":\s*(\d+)/.exec(pinsSrc)[1]);
const open = async (page) => { await page.goto('/correlation-ma/index.html'); await page.waitForFunction(() => !!window.AlmCorrPlusValidation && window._almCorrPlus && window._almCorrPlus()); };
const replay = (page) => page.evaluate(async () => { const r = await AlmCorrPlusValidation.runCorpus(); return { checks: r.checks, passed: r.passed, failed: r.failed.slice(0, 50), nFailed: r.failed.length, byQuantity: r.failed.reduce((o, f) => (o[f.quantity] = (o[f.quantity] || 0) + 1, o), {}), summaryLines: r.summaryLines, maxima: r.maxima }; });
const state = () => ({ data: document.getElementById('f-data').value, method: document.getElementById('f-method').value,
  test: document.querySelector("input[name='alm-plus-test']:checked").value, bench: document.querySelector("input[name='alm-plus-bench']:checked").value,
  headline: document.getElementById('headline').textContent, sens: document.getElementById('alm-plus-sens').innerHTML, loo: document.getElementById('alm-plus-loo').innerHTML,
  prose: document.getElementById('alm-plus-prose').innerHTML });

test.describe.configure({ timeout: 900_000 });

test('extras replay passes N/N and restores the user state', async ({ page }) => {
  await open(page);
  await page.locator('#f-method').selectOption('DL');
  await page.locator('#f-data').fill('A, .30, 40\nB, .10, 60\nC, .45, 35\nD, .20, 80');
  await page.locator("input[name='alm-plus-test'][value='knha']").check();
  await page.locator("input[name='alm-plus-bench'][value='gignac']").check();
  await page.locator('#alm-plus-loo-btn').click();
  await page.waitForTimeout(50);
  const before = await page.evaluate(state);
  const t0 = Date.now(); const r = await replay(page); const secs = (Date.now() - t0) / 1000;
  console.log('[extras replay] ' + r.passed + '/' + r.checks + ' passed; ' + r.nFailed + ' failed; ' + secs.toFixed(1) + ' s');
  for (const l of r.summaryLines) console.log('[extras replay] ' + l);
  console.log('[extras replay] maxima ' + JSON.stringify(r.maxima));
  if (r.nFailed) console.log('[extras replay] first failures ' + JSON.stringify(r.failed.slice(0, 10)));
  expect(r.checks).toBe(CHECKS); expect(r.passed).toBe(CHECKS); expect(r.nFailed).toBe(0);
  await page.waitForTimeout(50);
  expect(await page.evaluate(state)).toEqual(before);
  await expect(page.locator('#alm-plus-validate [role=status]')).toContainText(CHECKS + '/' + CHECKS + ' passed; 0 failed');
});

test('extras replay refuses a tampered reference file (SHA-256 pin)', async ({ page }) => {
  await open(page);
  await page.route('**/correlation-ma/validate/plus-corpus/reference-plus.json', async (route) => {
    const res = await route.fetch(); const body = Buffer.from(await res.body()); body[200] ^= 1;
    await route.fulfill({ response: res, body });
  });
  await expect(page.evaluate(() => AlmCorrPlusValidation.runCorpus())).rejects.toThrow(/SHA-256 mismatch/);
  await expect(page.locator('#alm-plus-validate [role=status]')).toContainText('Validation refused: SHA-256 mismatch');
});

test('extras replay catches a planted numerical defect (DL x HKSJ ad-hoc mu + 1e-7)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const P = window.AlmCorrPlus, orig = P.sensitivity;
    P.sensitivity = function () { const s = orig.apply(this, arguments); if (!s.refused) for (const c of s.cells) if (c.method === 'DL' && c.test === 'adhoc') c.mu_z += 1e-7; return s; };
  });
  const r = await replay(page);
  console.log('[planted numeric] ' + r.passed + '/' + r.checks + ' passed; failures by quantity ' + JSON.stringify(r.byQuantity));
  expect(r.byQuantity).toEqual({ mu_z: 324, 'R script mu_z': 27 });
  await expect(page.locator('#alm-plus-validate [role=status]')).not.toContainText('; 0 failed');
});

test('extras replay catches a planted display defect (REML/Wald pooled-r cell text)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const host = document.getElementById('alm-plus-sens');
    new MutationObserver(() => { const td = host.querySelector('tbody tr td:nth-child(3)'); if (td && td.textContent !== '9.999 [0.000, 0.000]') td.textContent = '9.999 [0.000, 0.000]'; }).observe(host, { childList: true, subtree: true, characterData: true });
  });
  const r = await replay(page);
  console.log('[planted display] ' + r.passed + '/' + r.checks + ' passed; failures by quantity ' + JSON.stringify(r.byQuantity));
  expect(r.byQuantity).toEqual({ 'shown pooled r [CI]': 324 });
});
