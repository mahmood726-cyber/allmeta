import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// nma-dose-response-app: outputs that asserted what the app never computed (lane nmaexp, 2026-11-14).
// Each check goes through the page the way a user does (click the control, read the download / the
// card), on the default sample (4 studies, 13 rows, dose-response arms):
//   * GRADE export: printed "Not serious" / "None detected" / "Overall Certainty: Moderate" for
//     judgements the app never makes, and "Participants: 13" (the row count; the data have no n);
//   * LaTeX table: printed literal "[CI]" and "ES" placeholders;
//   * "Use Pooled" read #pooledEffect, which does not exist, and the effect box was read-only;
//   * WebR card: Retry after a failed boot must not hang (it hung before #548; kept as a guard);
//   * WebR card: rows with no positive SE were sent to R with se = 0.1 substituted.

async function open(page) {
  await page.addInitScript(() => {
    localStorage.setItem('nma-quickstart-dismissed', 'true');
    localStorage.setItem('nma_wizard_dismissed', 'true');
  });
  await page.goto('/nma-dose-response-app/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window._nmaState && window._nmaState.wasm && window._nmaState.rawData.length > 0, null, { timeout: 60_000 });
}

async function tabOf(page, id) {
  const cat = await page.evaluate(i => {
    const el = document.getElementById(i);
    return el?.closest('[data-category]')?.getAttribute('data-category') || el?.closest('[data-main-content]')?.getAttribute('data-main-content') || null;
  }, id);
  expect(cat, `${id} sits in a panel under a main tab`).toBeTruthy();
  await page.locator(`.main-nav-tab[data-main-tab="${cat}"]`).click();
}

async function download(page, id) {
  await tabOf(page, id);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.locator('#' + id).click()]);
  return { name: dl.suggestedFilename(), text: await readFile(await dl.path(), 'utf8') };
}

const NOT_ASSESSED = 'Not assessed — user must judge';

test('GRADE export asserts no judgement the app did not make', async ({ page }) => {
  await open(page);
  for (const id of ['exportGRADE', 'exportGRADEProfile']) {
    const { name, text } = await download(page, id);
    expect(name).toBe('GRADE_SoF_Table.md');
    for (const fabricated of ['Not serious', 'None detected', 'Moderate', '| Participants | 13 |']) {
      expect(text, `${id}: "${fabricated}" is a judgement or count the app never computed`).not.toContain(fabricated);
    }
    const row = d => (text.split('\n').find(l => l.startsWith(`| ${d} |`)) || '').split('|')[2]?.trim();
    expect(row('Studies')).toBe('4');
    for (const d of ['Risk of Bias', 'Inconsistency', 'Indirectness', 'Imprecision', 'Publication Bias']) {
      expect(row(d), `${id}: ${d}`).toBe(NOT_ASSESSED);
    }
    expect(row('Participants')).toMatch(/^Not available — the data have no participant counts \(13 data rows analysed\)$/);
    expect(text).toContain(`## Overall Certainty: ${NOT_ASSESSED}`);
    expect(text).toMatch(/No single pooled effect/);
  }
});

test('LaTeX table has no placeholders; heterogeneity values are the Diagnostics values', async ({ page }) => {
  await open(page);
  const { name, text } = await download(page, 'exportLatexTable');
  expect(name).toBe('meta_analysis_table.tex');
  expect(text).not.toContain('[CI]');
  expect(text).not.toMatch(/&\s*ES\s*&/);
  expect(text).not.toMatch(/&\s*(k|I²|τ²)\s*&/);
  expect(text).toMatch(/^Number of studies & 4 & --- \\\\$/m);
  // the default model is fixed-effect: no residual tau² is estimated, so none is printed
  expect(await page.evaluate(() => window._nmaState.randomEffects)).toBe(false);
  expect(text).toMatch(/^Residual \$\\tau\^2\$ & not estimated \(fixed-effect model\) & --- \\\\$/m);
  expect(text).toMatch(/No single pooled effect/);
  expect(text).not.toMatch(/Pooled Effect &/);
});

test('"Use Pooled" says there is no single pooled effect and leaves the effect box editable', async ({ page }) => {
  await open(page);
  await tabOf(page, 'calcNNTFromPooled');
  await page.locator('#calcNNTFromPooled').click();
  // app.js's showNotification (it replaces the inline one) writes into #notification-container
  await expect(page.locator('#notification-container')).toContainText('No single pooled effect');
  await expect(page.locator('#nntEffect')).toHaveValue('');
  await expect(page.locator('#nntEffect')).toBeEditable();
  await page.locator('#nntEffect').fill('0.8');
  await page.locator('#calcNNT').click();
  await expect(page.locator('#nntResults')).toBeVisible();
});

test('WebR card: Retry after a blocked webR never hangs', async ({ page }) => {
  await page.route(/\/r-shiny\/shinylive\/webr\//, r => r.abort());
  await open(page);
  await page.waitForSelector('#webrRunBtn', { state: 'attached', timeout: 30_000 });
  for (let click = 1; click <= 3; click++) {
    await page.evaluate(() => document.getElementById('webrRunBtn').click());
    await expect(page.locator('#webrRunBtn'), `click ${click} finishes`).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator('#webrRunBtn')).toHaveText('Retry Validation');
    await expect(page.locator('#webrResults')).toContainText('WebR Error');
  }
});

test('WebR card refuses rows without a positive SE instead of substituting 0.1', async ({ page }) => {
  await open(page);
  // the runner is stubbed: this check is about what the card would SEND to R
  await page.evaluate(() => {
    window.__sent = [];
    window.AlmWebR = { runR: async o => { window.__sent.push(o.script); return { ok: false, error: 'stub runner' }; } };
  });
  await page.locator('.main-nav-tab[data-main-tab="data"]').click();
  await page.locator('#csvInput').fill('study,treatment,dose,effect,se\n' +
    'S1,Placebo,0,0,0.12\nS1,DrugA,5,0.28,\nS2,Placebo,0,0,0.11\nS2,DrugA,10,0.56,0\nS3,Placebo,0,0,0.10\nS3,DrugA,20,0.82,0.16');
  await page.locator('#runAnalysis').click();
  await expect.poll(() => page.evaluate(() => window._nmaState.rawData.length)).toBe(6);
  await page.waitForSelector('#webrRunBtn', { state: 'attached', timeout: 30_000 });
  await page.evaluate(() => document.getElementById('webrRunBtn').click());
  await expect(page.locator('#webrResults')).toContainText('Not run: 2 row(s) have no positive standard error (S1 DrugA, S2 DrugA)');
  expect(await page.evaluate(() => window.__sent.length), 'nothing was sent to R').toBe(0);
  await expect(page.locator('#webrRunBtn')).toBeEnabled();
});
