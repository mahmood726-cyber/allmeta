import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// nma-dose-response-app: the "Tau² estimator" panel (#tau2Estimator -> #tau2Result) and the
// "REML Report" / "Full Audit Trail" exports read the parsed CSV rows. They used to read
// state.parsedData.rows, which nothing in app.js assigns (the parsed rows live in state.rawData),
// so after loading data the panel never changed and both exports alerted "Load data first."
// (lane nmaparsed, 2026-11-13). Reference: metafor 5.2.1 on dat.bcg,
// tests/fixtures/tau2_audit_metafor521.json (REML 0.313243258136488, SJ 0.345515701598595).

const FIX = JSON.parse(await readFile(new URL('../fixtures/tau2_audit_metafor521.json', import.meta.url), 'utf8'));
const BCG = FIX.data.bcg;
const REF = FIX.ref.bcg;
const BCG_CSV = 'study,treatment,dose,effect,se\n' +
  BCG.yi.map((y, i) => `T${i + 1},BCG,1,${y},${Math.sqrt(BCG.vi[i])}`).join('\n');
const TAU2_RE = /tau²=([0-9.]+)/;

async function open(page, dialogs) {
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  // a returning user: the quick-start guide and the getting-started wizard were dismissed before
  await page.addInitScript(() => {
    localStorage.setItem('nma-quickstart-dismissed', 'true');
    localStorage.setItem('nma_wizard_dismissed', 'true');
  });
  await page.goto('/nma-dose-response-app/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window._nmaState && window._nmaState.wasm && window._nmaState.rawData.length > 0, null, { timeout: 60_000 });
}

// The panel ("Statistical Standards") sits under the Advanced main tab; the data box under Data.
async function tab(page, name) {
  await page.locator(`.main-nav-tab[data-main-tab="${name}"]`).click();
}

async function loadBcg(page) {
  await tab(page, 'data');
  await page.locator('#csvInput').fill(BCG_CSV);
  await page.locator('#runAnalysis').click();
  await expect.poll(() => page.evaluate(() => window._nmaState.rawData.map(r => r.study).join(','))).toBe(BCG.yi.map((_, i) => `T${i + 1}`).join(','));
  await tab(page, 'advanced');
}

async function pick(page, method) {
  // a user re-choosing the selected option fires no change event: move off it first
  if ((await page.locator('#tau2Estimator').inputValue()) === method) {
    await page.locator('#tau2Estimator').selectOption(method === 'DL' ? 'PM' : 'DL');
  }
  await page.locator('#tau2Estimator').selectOption(method);
  return (await page.locator('#tau2Result').textContent()) || '';
}

async function download(page, id) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.locator('#' + id).click()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), text: await readFile(path, 'utf8') };
}

function relClose(got, ref, tol) {
  expect(Math.abs(got - ref) / Math.abs(ref), `got ${got}, metafor ${ref}`).toBeLessThanOrEqual(tol);
}

test('tau2Estimator panel reports REML and SJ for the loaded data (dat.bcg = metafor)', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  await loadBcg(page);
  const reml = await pick(page, 'REML');
  expect(reml).toMatch(/^REML: tau²=/);
  // the panel prints 4 decimals; compare at that precision
  relClose(Number(reml.match(TAU2_RE)[1]), REF.REML, 5e-4);
  const sj = await pick(page, 'SJ');
  expect(sj).toMatch(/^Sidik-Jonkman: tau²=/);
  relClose(Number(sj.match(TAU2_RE)[1]), REF.SJ, 5e-4);
  // the full-precision results the panel stored
  const st = await page.evaluate(() => ({ reml: window._nmaState.remlResult?.tau2, sj: window._nmaState.sjResult?.tau2 }));
  relClose(st.reml, REF.REML, 1e-6);
  relClose(st.sj, REF.SJ, 1e-6);
  expect(dialogs).toEqual([]);
});

test('tau2Estimator panel follows newly loaded data (not stale)', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  await tab(page, 'advanced');
  const sample = await pick(page, 'REML');          // default sample, loaded by init()
  expect(sample).toMatch(/^REML: tau²=/);
  await loadBcg(page);
  const bcg = await pick(page, 'REML');
  expect(bcg).not.toBe(sample);
  relClose(Number(bcg.match(TAU2_RE)[1]), REF.REML, 5e-4);
  expect(dialogs).toEqual([]);
});

test('REML Report and Full Audit Trail export the loaded data', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  await loadBcg(page);
  const rep = await download(page, 'exportREMLReport');
  expect(rep.name).toBe('reml_report.md');
  const m = rep.text.match(/\| tau² \| ([0-9.]+) \|/);
  expect(m, rep.text).not.toBeNull();
  relClose(Number(m[1]), REF.REML, 5e-4);
  const audit = await download(page, 'exportFullAudit');
  expect(audit.name).toBe('analysis_audit_trail.md');
  expect(audit.text).toContain(`- Studies: ${BCG.yi.length}\n`);
  expect(audit.text).toContain(`- Observations: ${BCG.yi.length}\n`);
  const a = audit.text.match(/tau²: ([0-9.]+),/);
  expect(a, audit.text).not.toBeNull();
  relClose(Number(a[1]), REF.REML, 5e-4);
  expect(dialogs).toEqual([]);
});
