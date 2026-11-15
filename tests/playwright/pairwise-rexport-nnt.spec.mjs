import { test, expect } from '@playwright/test';

// Requirement: the Pairwise AI bundle's R export (generateRCode, Code tab) computes an NNT only for a measure
// where it is defined, at a stated baseline risk taken from the data or given by the user, and otherwise says
// why it is omitted; and the exported script runs in a plain R with metafor (lane pwrest3).
// Defects guarded:
//  - Section 10 treated exp(theta) as a risk ratio for every measure at six invented baseline risks
//    (5%..30%): for BP_REDUCTION (a mean difference of -7.8 mmHg) it printed "RR 0" and NNTs 20, 10, 7 ...;
//    for an odds ratio it labelled the OR "RR" and used the RR formula.
//  - the script stopped at its first line in a fresh R ("install.packages" with no CRAN mirror, for dmetar /
//    gridExtra / forestploter it never uses) and again at Peters' test (regtest predictor = "ni" on a model
//    fitted without sample sizes), so the NNT section never ran.
// The R run itself is checked outside the browser (lane pwrest3 report): every demo's exported script runs
// (Rscript 4.6.0 exit 0) and prints NNTs equal to Pairwiseai/tests/nnt_r460.json (made by nnt_reference.R).

const PATH = '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html';

async function rcode(page, demo) {
  await page.evaluate(d => loadDemoDataset(d), demo);
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__prev = AppState.results; runAnalysis(); });
  await page.waitForFunction(() => AppState.results && AppState.results.pooled && AppState.results !== window.__prev, null, { timeout: 30000 });
  return page.evaluate(() => {
    const e = AppState.results;
    const st = e.studies || [];
    return { measure: e.measure, code: generateRCode(e, { method: AppState.settings.tau2Method, hksj: AppState.settings.hksj }),
      ec: st.reduce((a, s) => a + (s.events_c || 0), 0), nc: st.reduce((a, s) => a + (s.n_c || 0), 0) };
  });
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.dismiss());
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  await page.goto(PATH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof generateRCode === 'function');
});

const nntSection = code => {
  const i = code.indexOf('# SECTION 10:'), j = code.indexOf('# SECTION 11:');
  return i >= 0 && j > i ? code.slice(i, j) : '';
};

test('the script needs only metafor and does not install packages', async ({ page }) => {
  const { code } = await rcode(page, 'SGLT2_ACM');
  expect(code).not.toMatch(/install\.packages\(new_packages\)/);
  expect(code).not.toMatch(/"dmetar"|"forestploter"|"gridExtra"/);
  expect(code).toContain('library(metafor)');
});

test('yi and vi are exported at full precision (they were rounded to 6 decimals, moving the NNT CI bound)', async ({ page }) => {
  await rcode(page, 'SGLT2_ACM');
  const g = await page.evaluate(() => ({ code: generateRCode(AppState.results, {}), yi: AppState.results.yi.map(String), vi: AppState.results.vi.map(String) }));
  expect(g.code).toContain('yi <- c(' + g.yi.join(', ') + ')');
  expect(g.code).toContain('vi <- c(' + g.vi.join(', ') + ')');
});

for (const demo of ['BP_REDUCTION', 'CONTINUOUS_SMD', 'MORTALITY_RATE', 'GENERIC_EFFECTS']) {
  test(`${demo}: no NNT is computed and the script says why`, async ({ page }) => {
    const g = await rcode(page, demo);
    const sec = nntSection(g.code);
    expect(sec, 'section 10 present').not.toBe('');
    expect(sec).not.toMatch(/nnt_table|nnt_tab|1 \/ abs\(/);
    expect(sec).not.toMatch(/baseline_risks <- c\(0\.05/);
    expect(sec).toContain(`not defined for a ${g.measure}`);
  });
}

for (const [demo, label] of [['SGLT2_ACM', 'OR'], ['BINARY_RR', 'RR']]) {
  test(`${demo}: the NNT uses the ${label} formula at the pooled control-group risk of the data`, async ({ page }) => {
    const g = await rcode(page, demo);
    expect(g.measure).toBe(label);
    const sec = nntSection(g.code);
    expect(sec).not.toMatch(/baseline_risks <- c\(0\.05/);
    expect(sec).toContain(`p0 <- ${g.ec} / ${g.nc}`);
    expect(sec).toContain('pooled control-group risk');
    if (label === 'OR') expect(sec).toContain('ratio * p0 / (1 - p0 + ratio * p0)');
    else expect(sec).toContain('risk_t <- p0 * ratio');
    expect(sec).toContain(`${label} = round(ratio, 4)`);
  });
}

test('RR: a baseline risk with p0 x RR above 1 gives no NNT for that row', async ({ page }) => {
  const g = await rcode(page, 'BINARY_RR');
  const sec = nntSection(g.code);
  expect(sec).toContain('risk_t[risk_t > 1] <- NA');
});

test('a missing control-event count is not taken as zero: p0 is left for the user', async ({ page }) => {
  await rcode(page, 'SGLT2_ACM');
  const sec = await page.evaluate(() => {
    const e = AppState.results;
    const studies = e.studies.map((s, i) => i === 0 ? { ...s, events_c: null } : s);
    return generateRCode({ ...e, studies }, {});
  }).then(nntSection);
  expect(sec).toContain('p0 <- NA');
  expect(sec).not.toMatch(/p0 <- \d+ \/ \d+/);
});

test('BINARY_RD: the NNT is 1 / |RD| with no baseline risk', async ({ page }) => {
  const g = await rcode(page, 'BINARY_RD');
  const sec = nntSection(g.code);
  expect(sec).toContain('arr <- -est');
  expect(sec).not.toContain('p0 <-');
});

test('SGLT2_HR: the NNT needs a control-group risk at a time point, which the user enters', async ({ page }) => {
  const g = await rcode(page, 'SGLT2_HR');
  const sec = nntSection(g.code);
  expect(sec).toContain('p0 <- NA');
  expect(sec).toContain('1 - (1 - p0)^ratio');
  expect(sec).toMatch(/time point/);
});

test('Peters\' test is given sample sizes when the data have them, and skipped otherwise', async ({ page }) => {
  let g = await rcode(page, 'SGLT2_ACM');
  expect(g.code).toMatch(/ni = ni/);
  g = await rcode(page, 'GENERIC_EFFECTS');
  expect(g.code).not.toMatch(/predictor = "ni"\)/);
  expect(g.code).toMatch(/Peters' test needs the studies' sample sizes/);
});
