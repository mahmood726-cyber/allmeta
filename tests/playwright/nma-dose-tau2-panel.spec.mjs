import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// nma-dose-response-app: the controls that read state.parsedData.rows, which nothing in app.js
// assigns (the parsed rows live in state.rawData), so they did nothing or alerted "Load data first."
// (lane nmaparsed, 2026-11-13). Every check below goes through the page the way a user does.
//   * pairwise panels (Tau-squared Estimation, REML Report, Full Audit Trail, Leave-one-out,
//     Cumulative, Influence) run on one-effect-per-study data and equal metafor on dat.bcg
//     (tests/fixtures/nma_dose_panels_metafor.json, made by nma_dose_panels_reference.R);
//   * on dose-response data (several rows per study) they refuse visibly;
//   * every control whose engine does not reproduce R refuses visibly: a message, no download,
//     no alert, no number.

const R = JSON.parse(await readFile(new URL('../fixtures/nma_dose_panels_metafor.json', import.meta.url), 'utf8'));
const K = R.yi.length;
const BCG_CSV = 'study,treatment,dose,effect,se\n' +
  R.yi.map((y, i) => `T${i + 1},BCG,1,${y},${Math.sqrt(R.vi[i])}`).join('\n');
const SAMPLE_REFUSAL = /^Not run: this method pools one effect per study, and 4 of 4 studies have more than one row/;

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

// Panels sit under main tabs: the data box under Data, the rest under Advanced / Bias / Clinical.
async function tab(page, name) {
  await page.locator(`.main-nav-tab[data-main-tab="${name}"]`).click();
}

async function loadCsv(page, csv, studies) {
  await tab(page, 'data');
  await page.locator('#csvInput').fill(csv);
  await page.locator('#runAnalysis').click();
  await expect.poll(() => page.evaluate(() => [...new Set(window._nmaState.rawData.map(r => r.study))].join(','))).toBe(studies);
}
const loadBcg = page => loadCsv(page, BCG_CSV, R.yi.map((_, i) => `T${i + 1}`).join(','));
async function loadSample(page) {
  await tab(page, 'data');
  await page.locator('#loadSample').click();
  await expect.poll(() => page.evaluate(() => window._nmaState.rawData.length)).toBe(13);
}

async function pick(page, method) {
  // a user re-choosing the selected option fires no change event: move off it first
  if ((await page.locator('#tau2Estimator').inputValue()) === method) {
    await page.locator('#tau2Estimator').selectOption(method === 'DL' ? 'PM' : 'DL');
  }
  await page.locator('#tau2Estimator').selectOption(method);
  return (await page.locator('#tau2Result').textContent()) || '';
}

// Go to the main tab whose panel holds control #id (panels are categorised by index.html at load).
async function tabOf(page, id) {
  const cat = await page.evaluate(i => document.getElementById(i)?.closest('[data-category]')?.getAttribute('data-category') || null, id);
  expect(cat, `${id} sits in a panel under a main tab`).toBeTruthy();
  await tab(page, cat);
}

async function download(page, id) {
  await tabOf(page, id);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.locator('#' + id).click()]);
  return { name: dl.suggestedFilename(), text: await readFile(await dl.path(), 'utf8') };
}

// |page - metafor| within half a unit of the last printed decimal (plus float slack)
function printed(got, ref, decimals, what) {
  expect(Math.abs(Number(got) - ref), `${what}: page ${got}, metafor ${ref}`).toBeLessThanOrEqual(0.5 * 10 ** -decimals + 1e-9);
}
const num = (text, re) => { const m = text.match(re); expect(m, `${re} in:\n${text}`).not.toBeNull(); return m.slice(1); };
const tableRows = (text, first) => text.split('\n').filter(l => first.test(l)).map(l => l.split('|').slice(1, -1).map(c => c.trim()));
const ciOf = ci => ci.replace(/[[\]]/g, '').split(',').map(Number);

test('Tau-squared panel: every estimator equals metafor on dat.bcg (tau², I², PL CI)', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  await loadBcg(page);
  await tab(page, 'advanced');
  const label = { REML: 'REML', SJ: 'Sidik-Jonkman', DL: 'DerSimonian-Laird', PM: 'Paule-Mandel', EB: 'Empirical Bayes' };
  for (const m of ['REML', 'SJ', 'DL', 'PM', 'EB']) {
    const text = await pick(page, m);
    const [t2, i2] = num(text, new RegExp(`^${label[m]}: tau²=([0-9.]+), I²=([0-9.]+)%`));
    printed(t2, R.estimators[m].tau2, 4, `${m} tau²`);
    printed(i2, R.estimators[m].I2, 1, `${m} I²`);
  }
  await pick(page, 'REML');
  const st = await page.evaluate(() => window._nmaState.remlResult);
  expect(Math.abs(st.tau2 - R.estimators.REML.tau2) / R.estimators.REML.tau2).toBeLessThan(1e-6);
  expect(Math.abs(st.I2 - R.estimators.REML.I2)).toBeLessThan(1e-4);
  expect(Math.abs(st.H2 - R.estimators.REML.H2)).toBeLessThan(1e-4);
  expect(Math.abs(st.Q - R.reml.QE)).toBeLessThan(1e-6);
  // "Show tau² CI" = metafor confint(type = "PL")
  await page.locator('#showTau2CI').check();
  const [lo, hi] = num((await page.locator('#tau2Result').textContent()) || '', /\[([0-9.]+), ([0-9.]+)\]$/);
  printed(lo, R.reml.tau2PL[0], 4, 'tau² PL lower');
  printed(hi, R.reml.tau2PL[1], 4, 'tau² PL upper');
  expect(dialogs).toEqual([]);
});

test('Tau-squared panel follows each data load, and refuses dose-response data', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  await tab(page, 'advanced');
  // the default sample (multi-arm dose-response) is loaded by init()
  await expect(page.locator('#tau2Result')).toHaveText(SAMPLE_REFUSAL);
  await loadBcg(page);
  await tab(page, 'advanced');
  // no re-selection: the data load itself refreshes the panel
  const [t2] = num((await page.locator('#tau2Result').textContent()) || '', /^REML: tau²=([0-9.]+)/);
  printed(t2, R.estimators.REML.tau2, 4, 'REML tau² after load');
  await loadSample(page);
  await tab(page, 'advanced');
  await expect(page.locator('#tau2Result')).toHaveText(SAMPLE_REFUSAL);
  expect(dialogs).toEqual([]);
});

test('REML Report and Full Audit Trail export the loaded data and equal metafor', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  await loadBcg(page);
  await tab(page, 'advanced');
  const rep = await download(page, 'exportREMLReport');
  expect(rep.name).toBe('reml_report.md');
  const [mu, mlo, mhi] = num(rep.text, /\| Pooled effect \| (-?[0-9.]+) \| \[(-?[0-9.]+), (-?[0-9.]+)\] \|/);
  printed(mu, R.reml.mu, 4, 'pooled'); printed(mlo, R.reml.ci[0], 4, 'pooled lower'); printed(mhi, R.reml.ci[1], 4, 'pooled upper');
  const [t2, tlo, thi] = num(rep.text, /\| tau² \| ([0-9.]+) \| \[([0-9.]+), ([0-9.]+)\] \|/);
  printed(t2, R.estimators.REML.tau2, 4, 'tau²'); printed(tlo, R.reml.tau2PL[0], 4, 'tau² lower'); printed(thi, R.reml.tau2PL[1], 4, 'tau² upper');
  printed(num(rep.text, /\| I² \| ([0-9.]+)% \|/)[0], R.estimators.REML.I2, 1, 'I²');
  printed(num(rep.text, /\| H² \| ([0-9.]+) \|/)[0], R.estimators.REML.H2, 2, 'H²');
  printed(num(rep.text, /\| Q \| ([0-9.]+) \|/)[0], R.reml.QE, 2, 'Q');
  const audit = await download(page, 'exportFullAudit');
  expect(audit.name).toBe('analysis_audit_trail.md');
  expect(audit.text).toContain(`- Studies: ${K}\n`);
  expect(audit.text).toContain(`- Observations: ${K}\n`);
  const [a2, ai2] = num(audit.text, /tau²: ([0-9.]+), I²: ([0-9.]+)%/);
  printed(a2, R.estimators.REML.tau2, 4, 'audit tau²'); printed(ai2, R.estimators.REML.I2, 1, 'audit I²');
  expect(dialogs).toEqual([]);
});

test('Leave-one-out, Cumulative and Influence equal metafor on dat.bcg', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  await loadBcg(page);
  const loo = await download(page, 'runLeaveOneOut');
  const lrows = tableRows(loo.text, /^\| T\d+ \|/);
  expect(lrows.length).toBe(K);
  for (const [study, eff, ci, , , i2] of lrows) {
    const i = Number(study.slice(1)) - 1;
    const [lo, hi] = ciOf(ci);
    printed(eff, R.leave1out.estimate[i], 4, `LOO ${study}`);
    printed(lo, R.leave1out['ci.lb'][i], 4, `LOO ${study} lower`);
    printed(hi, R.leave1out['ci.ub'][i], 4, `LOO ${study} upper`);
    printed(i2.replace('%', ''), R.leave1out.I2[i], 1, `LOO ${study} I²`);
  }
  const cum = await download(page, 'runCumulative');
  const crows = tableRows(cum.text, /^\| \d+ \| T\d+ \|/);
  expect(crows.length).toBe(K);
  crows.forEach(([n, added, eff, ci], j) => {
    expect(Number(n)).toBe(j + 1);
    expect(added).toBe(`T${R.cumul_precision.order[j]}`);
    const [lo, hi] = ciOf(ci);
    printed(eff, R.cumul_precision.estimate[j], 4, `cumulative step ${j + 1}`);
    printed(lo, R.cumul_precision['ci.lb'][j], 4, `cumulative step ${j + 1} lower`);
    printed(hi, R.cumul_precision['ci.ub'][j], 4, `cumulative step ${j + 1} upper`);
  });
  const inf = await download(page, 'runInfluence');
  const irows = tableRows(inf.text, /^\| T\d+ \|/);
  expect(irows.length).toBe(K);
  for (const [study, rs, dfb, cook, hat] of irows) {
    const i = Number(study.slice(1)) - 1;
    printed(rs, R.influence.rstudent[i], 3, `rstudent ${study}`);
    printed(dfb, R.influence.dfbetas[i], 3, `dfbetas ${study}`);
    printed(cook, R.influence.cook[i], 3, `Cook's D ${study}`);
    printed(hat, R.influence.hat[i], 3, `hat ${study}`);
  }
  expect(dialogs).toEqual([]);
});

test('pairwise panels refuse dose-response data visibly (no download, no alert)', async ({ page }) => {
  const dialogs = [];
  const downloads = [];
  page.on('download', d => downloads.push(d.suggestedFilename()));
  await open(page, dialogs);
  for (const [id, out] of [['exportREMLReport', 'exportStatus'], ['exportFullAudit', 'exportStatus'],
    ['runLeaveOneOut', 'sensitivityResult'], ['runCumulative', 'sensitivityResult'], ['runInfluence', 'sensitivityResult']]) {
    await tabOf(page, id);
    await page.locator('#' + id).click();
    await expect(page.locator('#' + out), id).toHaveText(SAMPLE_REFUSAL);
  }
  expect(downloads).toEqual([]);
  expect(dialogs).toEqual([]);
});

// [control, result element] for every control whose engine does not reproduce R.
const REFUSED = [
  ['exportNodeSplit', 'exportStatus'], ['runCopas', 'copasResult'], ['copasSensitivity', 'copasResult'],
  ['runPUniformStar', 'puniformResult'], ['runLimitMA', 'limitResult'], ['runRoBMA', 'robmaResult'],
  ['runBiasSensitivity', 'sensitivityResultBias'], ['runWorstCase', 'sensitivityResultBias'], ['runWAAP', 'waapResult'],
  ['runWLS', 'waapResult'], ['runZCurve', 'zcurveResult'], ['runSunset', 'zcurveResult'], ['compareSelectionModels', 'comparisonResult'],
  ['runBeggMazumdar', 'beggResult'], ['runPeters', 'regressionResult'], ['runMacaskill', 'regressionResult'], ['runDeeks', 'regressionResult'],
  ['runContourFunnel', 'advDiagResult'], ['runCumulativeMA', 'advDiagResult'], ['runLOOBias', 'advDiagResult'],
  ['exportBeyondRReport', 'exportStatus'], ['runBMA', 'bmaStatus'], ['exportPosteriors', 'exportStatus'],
  ['findOptimalDose', 'optimalDoseResult'], ['findMED', 'optimalDoseResult'], ['runClustering', 'exportStatus'],
  ['detectOutliers', 'exportStatus'], ['runGOSH', 'exportStatus'], ['runLivingReview', 'livingReviewStatus'],
  ['findStability', 'livingReviewStatus'], ['runComponentNMA', 'exportStatus'], ['suggestDesign', 'powerResult'],
  ['runDesignByTreatment', 'inconsistencyResult'], ['computeContribution', 'exportStatus'], ['runNetHeat', 'inconsistencyResult'],
  ['compareModels', 'exportStatus'], ['optimizeDose', 'personalizedResult'], ['generate3DSurface', 'exportStatus'],
];
const REFUSAL = /^Not available: .+\. Disabled until it is validated against R\.$/;

// Re-review lane rrev61 (F4), fixed in lane nmaexp2 (2026-11-14): the refusal said "Disabled until
// it is validated against R" but no refused control was disabled; a user saw the reason only after
// clicking. Each refused control must now BE disabled (disabled + aria-disabled="true"), show the
// reason beside it without a click (#<id>-refusal, linked by aria-describedby), and a click on it
// must do nothing at all: no number, no notification, no download, no dialog.
async function expectRefusedControl(page, id, out) {
  await tabOf(page, id);
  const btn = page.locator('#' + id);
  await expect(btn, id).toBeDisabled();
  await expect(btn, id).toHaveAttribute('aria-disabled', 'true');
  await expect(btn, id).toHaveAttribute('aria-describedby', `${id}-refusal`);
  const note = page.locator(`#${id}-refusal`);
  await expect(note, id).toHaveText(REFUSAL);
  await expect(note, id).toBeVisible();
  await expect(btn, id).toHaveAttribute('title', (await note.textContent()) || '');
  const before = await page.locator('#' + out).textContent();
  await page.evaluate(() => { window.__notes = []; });
  await btn.click({ force: true });
  await page.waitForTimeout(50);
  expect(await page.locator('#' + out).textContent(), `${id}: a click on the disabled control changed #${out}`).toBe(before);
  expect(await page.evaluate(() => window.__notes), id).toEqual([]);
}

for (const data of ['bcg', 'sample']) {
  test(`controls that do not reproduce R are disabled, with the reason shown (${data})`, async ({ page }) => {
    const dialogs = [];
    const downloads = [];
    page.on('download', d => downloads.push(d.suggestedFilename()));
    await open(page, dialogs);
    if (data === 'bcg') await loadBcg(page);
    await recordNotes(page);
    for (const [id, out] of REFUSED) await expectRefusedControl(page, id, out);
    expect(downloads).toEqual([]);
    expect(dialogs).toEqual([]);
  });
}

// Lane nmaguard (2026-11-13): 33 more analysis buttons read state.rawData directly, so on the default
// sample they pooled 13 dose-response arms as 13 independent studies and printed a number (trim-and-fill,
// PET, PEESE, LFK, Doi, Vevea-Hedges, Cook's D, DFFITS, studentized residuals, ...), or failed with a raw
// JavaScript error. None reproduces R on dat.bcg (trim-and-fill: 0 missing against metafor's 1; PET/PEESE:
// normal-quantile CI against the t CI of the WLS fit) or has an R reference at all, so each refuses
// visibly, with one warning and nothing else: no success/error notification, no number, no download.
// [control, result element]; elements index.html does not have fall back to the export status line.
const REFUSED_MORE = [
  ['fitGP', 'gpResult'], ['poolMedians', 'quantileResult'], ['poolIQRs', 'quantileResult'], ['estimateMeanSD', 'quantileResult'],
  ['runGRIME', 'dataQualityResult'], ['runSPRITE', 'dataQualityResult'], ['runRIVETS', 'dataQualityResult'], ['runBenford', 'dataQualityResult'],
  ['runTrimFill', 'trimFillResult'], ['runPET', 'petpeeseResult'], ['runPEESE', 'petpeeseResult'],
  ['computeLFK', 'lfkResult'], ['runDoiPlot', 'lfkResult'], ['runVeveaHedges', 'selectionResult'],
  ['computeCooksD', 'outlierResult'], ['computeDFFITS', 'outlierResult'], ['computeStudentized', 'outlierResult'],
  ['runTransitivity', 'transitivityResult'], ['runFractionalPolynomial', 'exportStatus'], ['runBayesianNMA', 'exportStatus'],
  ['runCumulativeNMA', 'exportStatus'], ['runNonGaussianRE', 'exportStatus'], ['runShrinkagePriors', 'exportStatus'],
  ['runGradientBoosting', 'exportStatus'], ['runPoissonGamma', 'exportStatus'], ['runBayesianPower', 'powerResult'],
  ['runMixtureSubgroup', 'exportStatus'], ['runCopulaSelection', 'exportStatus'], ['runHierarchicalSelection', 'ensembleResult'],
  ['runPredictiveSelection', 'ensembleResult'], ['runMultilevelNested', 'multilevelResult'], ['runRobustBayesian', 'multilevelResult'],
  ['startLiveMA', 'liveMAStatus'],
];

// every notification the page shows, in order, as "type: message"
async function recordNotes(page) {
  await page.evaluate(() => {
    window.__notes = [];
    const o = window.showNotification;
    window.showNotification = function (m, t) { window.__notes.push(`${t}: ${m}`); return o && o.apply(this, arguments); };
  });
}

for (const data of ['bcg', 'sample']) {
  test(`unguarded rawData controls are disabled, with the reason shown (${data})`, async ({ page }) => {
    const dialogs = [];
    const downloads = [];
    page.on('download', d => downloads.push(d.suggestedFilename()));
    await open(page, dialogs);
    if (data === 'bcg') await loadBcg(page);
    await recordNotes(page);
    for (const [id, out] of REFUSED_MORE) await expectRefusedControl(page, id, out);
    // the live monitor never started: its Stop control was never enabled
    expect(await page.locator('#stopLiveMA').isDisabled()).toBe(true);
    expect(downloads).toEqual([]);
    expect(dialogs).toEqual([]);
  });
}

test('the disabled controls are exactly the refused ones (no refused control left enabled, none extra)', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  const marked = await page.evaluate(() => [...document.querySelectorAll('[aria-disabled="true"]')]
    .filter(el => el.getAttribute('aria-describedby') === `${el.id}-refusal`).map(el => el.id).sort());
  const expected = [...REFUSED, ...REFUSED_MORE, ['runBMA', 'bmaStatus']].map(([id]) => id)
    .filter((id, i, a) => a.indexOf(id) === i).sort();
  expect(marked).toEqual(expected);
  expect(marked.length).toBe(71);
  expect(dialogs).toEqual([]);
});

test('Bayesian model averaging is disabled: a click shows no notice and changes no result', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  await recordNotes(page);
  await tabOf(page, 'runBMA');
  const ensembleBefore = await page.locator('#ensembleResult').textContent();
  await expectRefusedControl(page, 'runBMA', 'bmaStatus');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__notes)).toEqual([]);
  expect(await page.locator('#ensembleResult').textContent()).toBe(ensembleBefore);
  expect(dialogs).toEqual([]);
});

test('feature search does not offer refused controls (no "Trim and Fill"), and still offers validated ones', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  const refused = await page.evaluate(() => featureIndex
    .filter(f => document.getElementById(f.button)?.getAttribute('aria-disabled') === 'true').map(f => f.name));
  // the entries rrev61 found offered (Trim and Fill, Copas Model, Begg Test, Z-Curve, Gaussian Process,
  // Optimal Dose, Node Splitting, Component NMA, Cook Distance) must be among the refused ones
  for (const n of ['Trim and Fill', 'Copas Model', 'Begg Test', 'Z-Curve', 'Gaussian Process', 'Optimal Dose',
    'Node Splitting', 'Component NMA', 'Cook Distance']) expect(refused, n).toContain(n);
  for (const name of refused) {
    await page.locator('#featureSearch').fill(name.toLowerCase());
    await expect(page.locator('#searchResults')).toBeVisible();
    const names = await page.locator('#searchResults span:first-child').allTextContents();
    expect(names, `search "${name}"`).not.toContain(name);
  }
  await page.locator('#featureSearch').fill('bootstrap');
  await expect(page.locator('#searchResults')).toContainText('Bootstrap');
  expect(dialogs).toEqual([]);
});

test('feature search offers only controls the page has (no "Egger Test")', async ({ page }) => {
  const dialogs = [];
  await open(page, dialogs);
  const missing = await page.evaluate(() => featureIndex.filter(f => !document.getElementById(f.button)).map(f => `${f.name} -> #${f.button}`));
  expect(missing).toEqual([]);
  await page.locator('#featureSearch').fill('egger');
  await expect(page.locator('#searchResults')).toBeVisible();
  await expect(page.locator('#searchResults')).not.toContainText('Egger Test');
  expect(dialogs).toEqual([]);
});
