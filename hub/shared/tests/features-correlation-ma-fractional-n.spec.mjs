import { test, expect } from '@playwright/test';

// Mahmood's decision (2026-10-31): a non-integer sample size (e.g. n = 40.5) is ACCEPTED, as metafor does
// (escalc(measure="ZCOR") uses vi = 1/(ni - 3) with ni as given, without a warning), and the page shows a
// visible, non-blocking warning naming the rows. Every way data reaches the page is checked: the paste box,
// the entry tab apply, a restored analysis file (share set) and the entry tab's CSV/TSV upload.
//
// Reference numbers: R 4.6.0 (2026-04-24 ucrt), metafor 5.2.1 on baseimage (validate/reference.R controls):
//   e <- escalc(measure='ZCOR', ri=RI, ni=NI)          # no warning from escalc for fractional ni
//   rma(yi=e$yi, vi=e$vi, method=M, test='z', control=list(threshold=1e-12, maxiter=10000, stepadj=.5,
//       tol=.Machine$double.eps^0.75));  PI = mu +/- qt(.975, k-1) * sqrt(tau2 + se^2), back-transformed by tanh.
// Tolerances are the app's existing ones (validate/README.md): tau2 relative 1e-6 for PM/REML; every other number
// 1e-9 relative to max(1, |R|).

const APP = 'correlation-ma', PAGE = '/' + APP + '/index.html';
const RI = [0.45, 0.30, 0.55, 0.20, 0.38, 0.62, 0.28, 0.50], NI = [40.5, 55, 30, 80, 65.25, 25, 90, 45];
const LABELS = ['Study A', 'Study B', 'Study C', 'Study D', 'Study E', 'Study F', 'Study G', 'Study H'];
const DATA = LABELS.map((l, i) => `${l}, ${RI[i]}, ${NI[i]}`).join('\n');
const R = {
  REML: { mu_z: 0.39438753375597, se_z: 0.0568975762264136, tau2_z: 0.00543891336469289, I2: 21.2173370179403,
    r: 0.375136506657152, r_lo: 0.275559553136844, r_hi: 0.466748231366287, r_pi_lo: 0.172392451526291, r_pi_hi: 0.547387667543689 },
  DL: { mu_z: 0.395981469365631, se_z: 0.058032024640661, tau2_z: 0.00637617290613466, I2: 23.996241833998,
    r: 0.376505312227371, r_lo: 0.274977712940878, r_hi: 0.469728681558529, r_pi_lo: 0.161149595972602, r_pi_hi: 0.55763632635178 },
  PM: { mu_z: 0.396797983541655, se_z: 0.0586316192565162, tau2_z: 0.006881508005175, I2: 25.4146978130222,
    r: 0.377205864894685, r_lo: 0.274646130573946, r_hi: 0.471279468406055, r_pi_lo: 0.15532406416094, r_pi_hi: 0.562856439312725 },
  FE: { mu_z: 0.382374936709046, se_z: 0.0495833903628733, tau2_z: 0, I2: 23.996241833998,
    r: 0.364768186441631, r_lo: 0.277704731701685, r_hi: 0.445888432564003 }
};
function expectR(got, method) {
  const ref = R[method];
  for (const [k, v] of Object.entries(ref)) {
    const tol = (k === 'tau2_z' && method !== 'DL' && method !== 'FE') ? 1e-6 : 1e-9;
    expect(Math.abs(got[k] - v), `${method} ${k}: app ${got[k]} vs R ${v}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(v)));
  }
  expect(got.k).toBe(8);
  expect(got.studies.map(s => s.n)).toEqual(NI);
}
async function expectWarning(page) {
  const notice = page.locator('#f-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('not a whole number');
  await expect(notice).toContainText('Study A (n = 40.5)');
  await expect(notice).toContainText('Study E (n = 65.25)');
  await expect(notice).not.toContainText('Study B (n');
  await expect(notice).not.toContainText('excluded');
}
async function boot(page) {
  await page.goto(PAGE);
  await page.waitForFunction(() => window.AlmFeatures && AlmFeatures.get('correlation-ma') && typeof window._almLastCorrMA === 'function');
}

test('FRACTIONAL N: paste path fits as metafor (all four estimators) and warns, naming the rows', async ({ page }) => {
  await boot(page);
  // The built-in example (whole numbers) shows no warning.
  await expect(page.locator('#f-notice')).toBeHidden();
  await page.fill('#f-data', DATA);
  for (const m of ['REML', 'DL', 'PM', 'FE']) {
    await page.locator('#f-method').selectOption(m);
    await expect.poll(() => page.evaluate(() => _almLastCorrMA() && _almLastCorrMA().method)).toBe(m);
    expectR(await page.evaluate(() => _almLastCorrMA()), m);
    await expectWarning(page);
  }
  // Back to whole numbers: the warning goes away.
  await page.fill('#f-data', DATA.replace('40.5', '40').replace('65.25', '65'));
  await expect(page.locator('#f-notice')).toBeHidden();
});

test('FRACTIONAL N: entry apply and restored analysis file accept and warn', async ({ page }) => {
  await boot(page);
  const applied = await page.evaluate(([labels, ri, ni]) =>
    AlmFeatures.get('correlation-ma').entry.apply(labels.map((study, i) => ({ study, ri: ri[i], ni: ni[i] }))), [LABELS, RI, NI]);
  expect(applied).toEqual({ ok: true, n: 8 });
  expectR(await page.evaluate(() => _almLastCorrMA()), 'REML');
  await expectWarning(page);

  await page.fill('#f-data', 'X, 0.3, 40\nY, 0.2, 50');
  await expect(page.locator('#f-notice')).toBeHidden();
  await page.evaluate(d => AlmFeatures.get('correlation-ma').share.set({ data: d, method: 'DL' }), DATA);
  expectR(await page.evaluate(() => _almLastCorrMA()), 'DL');
  await expectWarning(page);
});

test('FRACTIONAL N: entry tab TSV upload accepts and warns', async ({ page }) => {
  await boot(page);
  await page.locator('#alm-features .alm-f-toggle').click();
  await page.getByRole('tab', { name: 'Data entry', exact: true }).click();
  const panel = page.locator('#alm-f-panel-entry');
  const tsv = 'Study\tr\tn\n' + LABELS.map((l, i) => `${l}\t${RI[i]}\t${NI[i]}`).join('\n');
  await panel.locator('input[type=file]').first().setInputFiles({ name: 'fractional.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(tsv) });
  const use = panel.getByRole('button', { name: 'Use these rows', exact: true }).first();
  await expect(use).toBeEnabled();
  // The entry tab's own conversion log also flags the value (non-blocking).
  await expect(panel).toContainText('ni is not an integer');
  await use.click();
  await expect.poll(() => page.evaluate(() => _almLastCorrMA().studies.map(s => s.n))).toEqual(NI);
  expectR(await page.evaluate(() => _almLastCorrMA()), 'REML');
  await expectWarning(page);
});

test('FRACTIONAL N: report text Notes name the rows; number audit passes', async ({ page }) => {
  await boot(page);
  await page.fill('#f-data', DATA);
  await expect.poll(() => page.evaluate(() => _almLastCorrMA().studies[0].n)).toBe(40.5);
  const out = await page.evaluate(app => {
    const spec = AlmFeatures.get(app).text, r = spec.results();
    const ctx = { app, build: AlmBuildInfo, entryLog: [], verify: null };
    const o = AlmText.render(spec.templates, r, ctx);
    return { ok: AlmText.audit(o, r, { ctx, dom: spec.dom() }).ok, flags: o.flags.map(f => f.text) };
  }, APP);
  expect(out.ok).toBe(true);
  const note = out.flags.find(f => /not whole numbers/.test(f));
  expect(note, out.flags.join(' | ')).toBeTruthy();
  expect(note).toContain('Study A, Study E');
  // Whole numbers: no such note.
  await page.fill('#f-data', DATA.replace('40.5', '40').replace('65.25', '65'));
  await expect.poll(() => page.evaluate(() => _almLastCorrMA().studies[0].n)).toBe(40);
  const flags = await page.evaluate(app => {
    const spec = AlmFeatures.get(app).text, r = spec.results();
    return AlmText.render(spec.templates, r, { app, build: AlmBuildInfo, entryLog: [], verify: null }).flags.map(f => f.text);
  }, APP);
  expect(flags.some(f => /not whole numbers/.test(f))).toBe(false);
});
