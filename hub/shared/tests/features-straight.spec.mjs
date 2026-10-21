// F6 Straight path on the five beats-R apps (3 dta-sroc, 9 proportion-ma, 16 nma-inconsistency, 17 correlation-ma,
// 18 multivariate-ma). Per app:
//   - load the built-in example; the EXPECTED fired set is derived here from the example's own results (k, estimator,
//     I², CI/PI bounds, test p-values, input mode), read straight from the app's result objects — not from the adapter;
//     it must equal what the engine fired and what the notice above the results lists (prints STRAIGHT <app> fired=[...]);
//   - PLANTED: change a choice/input that should trigger a rule (e.g. estimator -> DL in apps 9/17) -> that rule fires;
//   - the "Straight path" tab renders the same advice; Why? expands Handbook + DOI links (rel=noopener);
//   - axe: 0 serious/critical violations on the panel tab and on the notice.
// Run: npx playwright test -c playwright.features.config.mjs features-straight
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
// Thresholds as in shared/alm-straight.js THRESHOLDS (re-stated so a silent change there fails here).
const SMALL_K = 10, FEW_K_ISQ = 5, ISQ_ZERO = 0.05, FUNNEL_K = 10, ALPHA = 0.05, UNC_PAIR = 5, UNC_NET = 5, UNC_MV = 10, PI_K = 3;
const inc = (lo, hi, v) => lo <= v && v <= hi;

async function fired(page, app) {
  return page.evaluate(a => {
    const r = window.AlmStraightUI && window.AlmStraightUI.last[a];
    return r ? window.AlmStraight.fired(r) : null;
  }, app);
}
async function expectFired(page, app, expected, label) {
  const want = expected.slice().sort();
  await expect.poll(async () => ((await fired(page, app)) || ['<none yet>']).slice().sort(), { timeout: 15_000 }).toEqual(want);
  const got = await fired(page, app);
  console.log(`STRAIGHT ${app}${label ? ' ' + label : ''} fired=[${got.join(', ')}]`);
  const notice = page.locator(`.alm-straight-notice[data-app="${app}"]`);
  await expect(notice).toHaveAttribute('data-fired', got.join(' '));
  if (got.length) await expect(notice).toBeVisible(); else await expect(notice).toBeHidden();
  return got;
}
async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))));
}
async function axe(page, selector, label) {
  await settle(page);
  const r = await new AxeBuilder({ page }).include(selector).withTags(AXE_TAGS).analyze();
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  console.log(`AXE straight ${label}: ${r.violations.length} violations (${bad.length} serious/critical); ${r.passes.length} rules passed`);
  expect(bad.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target.join(' ')) }))).toEqual([]);
}
// Open the feature panel on the Straight path tab; it must list exactly the fired advice; Why? shows sources.
async function checkTab(page, app, got) {
  const toggle = page.locator('#alm-features .alm-f-toggle');
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  const tab = page.getByRole('tab', { name: 'Straight path', exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const panel = page.locator('#alm-f-panel-straight');
  await expect(panel.locator('section.alm-straight')).toHaveCount(1);
  const listed = await panel.locator('li.alm-sp-item').evaluateAll(ns => ns.map(n => n.getAttribute('data-rule')));
  expect(listed.slice().sort()).toEqual(got.slice().sort());
  await expect(panel.locator('details.alm-sp-checked summary')).toContainText('Rules checked (');
  if (got.length) {
    const first = panel.locator('li.alm-sp-item').first();
    const why = first.getByRole('button', { name: /^Why\?/ });
    await expect(why).toHaveAttribute('aria-expanded', 'false');
    await why.click();
    await expect(why).toHaveAttribute('aria-expanded', 'true');
    const links = first.locator('.alm-sp-detail a');
    expect(await links.count()).toBeGreaterThan(0);
    for (const a of await links.all()) {
      expect(await a.getAttribute('rel')).toBe('noopener');
      expect(await a.getAttribute('href')).toMatch(/^https:\/\/(doi\.org\/10\.\d{4,9}\/\S+|training\.cochrane\.org\/handbook\/)/);
    }
  }
  await axe(page, '#alm-features', app + ' panel tab');
}
function watchErrors(page) { const errors = []; page.on('pageerror', e => errors.push(e.message)); return errors; }

test('app 9 proportion-ma: example advice, estimator -> DL, cluster provenance, panel + axe', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/proportion-ma/index.html');
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  const derive = async () => {
    const r = await page.evaluate(() => window._almLastPropMA());
    const prov = await page.evaluate(() => (window.AlmFeaturesState || {}).provenance || []);
    const e = [];
    if (r.tauEstimator !== 'FE' && r.k < SMALL_K) e.push('SP-REC-SMALLK@1'); // no Hartung–Knapp option in this app
    if (r.i2 < ISQ_ZERO && r.k < FEW_K_ISQ) e.push('SP-PIT-I2ZERO@1');
    if (prov.some(p => (p.flags || []).some(f => f.code === 'CLUSTER_NOT_ADJUSTED'))) e.push('SP-PIT-CLUSTER@1');
    if (r.k < UNC_PAIR) e.push('SP-UNC-SMALLK@1');
    // SP-UNC-WIDEPI: a single-group proportion has no no-effect value -> not applicable.
    return { e, r };
  };
  let d = await derive();
  console.log(`STRAIGHT proportion-ma example k=${d.r.k} estimator=${d.r.tauEstimator} I2=${d.r.i2}`);
  await expectFired(page, 'proportion-ma', d.e, 'example');
  const checked = await page.evaluate(() => window.AlmStraightUI.last['proportion-ma'].checked.find(c => c.id === 'SP-UNC-WIDEPI@1'));
  expect(checked.reason).toBe('not applicable');
  await axe(page, '.alm-straight-notice[data-app="proportion-ma"]', 'proportion-ma notice');

  // PLANTED: estimator DL (k < 10) -> SP-REC-SMALLK fires and names DerSimonian–Laird.
  await page.locator('#tau-est').selectOption('DL');
  d = await derive();
  expect(d.e).toContain('SP-REC-SMALLK@1');
  await expectFired(page, 'proportion-ma', d.e, 'DL');
  await expect(page.locator('.alm-straight-notice[data-app="proportion-ma"] li[data-rule="SP-REC-SMALLK@1"]')).toContainText('DerSimonian–Laird');
  // CONTROL: fixed effect -> SMALLK does not fire.
  await page.locator('#tau-est').selectOption('FE');
  d = await derive();
  expect(d.e).not.toContain('SP-REC-SMALLK@1');
  await expectFired(page, 'proportion-ma', d.e, 'FE');
  // PLANTED: 4 identical-rate studies (I² = 0, k = 4) with PM.
  await page.locator('#tau-est').selectOption('PM');
  await page.locator('#src').fill('10, 100, A\n20, 200, B\n15, 150, C\n30, 300, D');
  await page.locator('#btn-run').click();
  d = await derive();
  expect(d.e).toEqual(expect.arrayContaining(['SP-PIT-I2ZERO@1', 'SP-UNC-SMALLK@1']));
  await expectFired(page, 'proportion-ma', d.e, 'k=4 I2=0');
  // PLANTED: data-entry provenance records a cluster trial not adjusted for clustering.
  await page.evaluate(() => { window.AlmFeaturesState.provenance = [{ id: 'p1', label: 'Smith 2019', flags: [{ code: 'CLUSTER_NOT_ADJUSTED', text: 'x' }] }]; });
  await page.locator('#btn-run').click();
  d = await derive();
  expect(d.e).toContain('SP-PIT-CLUSTER@1');
  const got = await expectFired(page, 'proportion-ma', d.e, 'cluster');
  await expect(page.locator('.alm-straight-notice[data-app="proportion-ma"] li[data-rule="SP-PIT-CLUSTER@1"]')).toContainText('Smith 2019');
  // Dismiss hides the notice (advisory only; results untouched).
  await page.locator('.alm-straight-notice[data-app="proportion-ma"]').getByRole('button', { name: 'Dismiss Straight path advice' }).click();
  await expect(page.locator('.alm-straight-notice[data-app="proportion-ma"]')).toBeHidden();
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  await checkTab(page, 'proportion-ma', got);
  expect(errors).toEqual([]);
});

test('app 17 correlation-ma: example advice, estimator -> DL, I² = 0 with k = 4, panel + axe', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/correlation-ma/index.html');
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  const derive = async () => {
    const r = await page.evaluate(() => window._almLastCorrMA());
    const e = [];
    if (r.method !== 'FE' && r.k < SMALL_K) e.push('SP-REC-SMALLK@1'); // headline CI is Wald (no HKSJ)
    if (r.I2 < ISQ_ZERO && r.k < FEW_K_ISQ) e.push('SP-PIT-I2ZERO@1');
    if (inc(r.r_lo, r.r_hi, 0)) e.push('SP-PIT-NONSIG@1');
    if (r.k < UNC_PAIR) e.push('SP-UNC-SMALLK@1');
    if (r.k >= PI_K && r.r_pi_lo != null && inc(r.r_pi_lo, r.r_pi_hi, 0) && !inc(r.r_lo, r.r_hi, 0)) e.push('SP-UNC-WIDEPI@1');
    return { e, r };
  };
  let d = await derive();
  console.log(`STRAIGHT correlation-ma example k=${d.r.k} method=${d.r.method} I2=${d.r.I2} CI=[${d.r.r_lo}, ${d.r.r_hi}] PI=[${d.r.r_pi_lo}, ${d.r.r_pi_hi}]`);
  await expectFired(page, 'correlation-ma', d.e, 'example');
  await axe(page, '.alm-straight-notice[data-app="correlation-ma"]', 'correlation-ma notice');
  // PLANTED: estimator DL -> SMALLK message names DerSimonian–Laird.
  await page.locator('#f-method').selectOption('DL');
  d = await derive();
  expect(d.e).toContain('SP-REC-SMALLK@1');
  await expectFired(page, 'correlation-ma', d.e, 'DL');
  await expect(page.locator('.alm-straight-notice[data-app="correlation-ma"] li[data-rule="SP-REC-SMALLK@1"]')).toContainText('DerSimonian–Laird');
  // PLANTED: four identical correlations (I² = 0, k = 4), CI includes 0.
  await page.locator('#f-data').fill('A, 0.05, 40\nB, 0.05, 50\nC, 0.05, 45\nD, 0.05, 60');
  d = await derive();
  expect(d.e).toEqual(expect.arrayContaining(['SP-PIT-I2ZERO@1', 'SP-UNC-SMALLK@1', 'SP-PIT-NONSIG@1']));
  await expectFired(page, 'correlation-ma', d.e, 'k=4 I2=0');
  // CONTROL: k = 5 identical correlations -> I2ZERO and SMALLK uncertainty do not fire.
  await page.locator('#f-data').fill('A, 0.05, 40\nB, 0.05, 50\nC, 0.05, 45\nD, 0.05, 60\nE, 0.05, 55');
  d = await derive();
  expect(d.e).not.toContain('SP-PIT-I2ZERO@1');
  const got = await expectFired(page, 'correlation-ma', d.e, 'k=5 I2=0');
  await checkTab(page, 'correlation-ma', got);
  expect(errors).toEqual([]);
});

test('app 3 dta-sroc: example advice (Deeks with k < 10), 3 studies -> separate pooling, panel + axe', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/dta-sroc/index.html');
  await expect(page.locator('#stats-wrap .stat').first()).toBeVisible();
  const derive = () => page.evaluate(([FUNNEL_K, UNC_MV]) => {
    const cards = {};
    document.querySelectorAll('#stats-wrap .stat').forEach(c => { cards[c.querySelector('.k').textContent] = c.querySelector('.v').textContent; });
    const k = Number(cards.k), b = window.__almBivariate(), dk = window.__almDeeks(), e = [];
    const rho = cards['Spearman ρ (threshold)'];
    if (!b && cards['Mean Se'] !== undefined) e.push('SP-REC-DTA-SROC@1');
    else if (rho !== undefined && rho.includes('⚠')) e.push('SP-REC-DTA-SROC@1');
    if (dk && k < FUNNEL_K) e.push('SP-PIT-FUNNELSMALLK@1');
    if (k < UNC_MV) e.push('SP-UNC-SMALLK@1');
    return { e, k, rho: rho || null, deeks: dk ? dk.p : null, bivariate: !!b };
  }, [FUNNEL_K, UNC_MV]);
  let d = await derive();
  console.log(`STRAIGHT dta-sroc example k=${d.k} bivariate=${d.bivariate} rho=${d.rho} deeksP=${d.deeks}`);
  await expectFired(page, 'dta-sroc', d.e, 'example');
  await axe(page, '.alm-straight-notice[data-app="dta-sroc"]', 'dta-sroc notice');
  // PLANTED: only 3 studies -> no bivariate fit; the app shows separately averaged Se/Sp -> SP-REC-DTA-SROC fires.
  await page.locator('#f-data').fill('A, 85, 10, 15, 140\nB, 62, 12, 18, 108\nC, 110, 25, 40, 200');
  await page.locator('#btn-run').click();
  await expect(page.locator('#stats-wrap .stat .k', { hasText: 'Mean Se' })).toHaveCount(1);
  d = await derive();
  expect(d.e).toContain('SP-REC-DTA-SROC@1');
  expect(d.e).not.toContain('SP-PIT-FUNNELSMALLK@1');
  const got = await expectFired(page, 'dta-sroc', d.e, 'k=3');
  await checkTab(page, 'dta-sroc', got);
  expect(errors).toEqual([]);
});

test('app 16 nma-inconsistency: example advice, model -> DL, panel + axe', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/nma-inconsistency/index.html');
  await expect(page.locator('#ns-body tr').first()).toBeVisible();
  const derive = () => page.evaluate(([ALPHA, UNC_NET]) => {
    const r = window._almLastInco(), e = [];
    const ps = r.nodeSplit.map(x => x.p).concat(r.dbt.p == null ? [] : [r.dbt.p]);
    if (ps.some(p => p >= ALPHA)) e.push('SP-PIT-NMACONSIST@1');
    const per = {};
    window.parse(document.getElementById('src').value).forEach(x => { const key = [x.A, x.B].sort().join('|'); per[key] = (per[key] || 0) + 1; });
    const min = Math.min(...Object.values(per));
    if (min < UNC_NET) e.push('SP-UNC-SMALLK@1');
    return { e, model: r.model, ps, min };
  }, [ALPHA, UNC_NET]);
  let d = await derive();
  console.log(`STRAIGHT nma-inconsistency example model=${d.model} p=[${d.ps.join(', ')}] minPerComparison=${d.min}`);
  await expectFired(page, 'nma-inconsistency', d.e, 'example');
  await axe(page, '.alm-straight-notice[data-app="nma-inconsistency"]', 'nma-inconsistency notice');
  // Change a choice: random-effects DL; the expected set follows the new p-values.
  await page.locator('#f-model').selectOption('DL');
  await page.locator('#btn-run').click();
  await expect.poll(() => page.evaluate(() => window._almLastInco().model)).toBe('DL');
  d = await derive();
  await expectFired(page, 'nma-inconsistency', d.e, 'DL');
  // PLANTED: a network whose tests are all non-significant (consistent effects) -> NMACONSIST fires.
  await page.locator('#src').fill('A, B, -0.30, 0.10\nA, C, -0.50, 0.10\nB, C, -0.20, 0.10\nA, B, -0.31, 0.11\nA, C, -0.49, 0.12\nB, C, -0.21, 0.12');
  await page.locator('#btn-run').click();
  await expect.poll(() => page.evaluate(() => window._almLastInco().nodeSplit.length)).toBeGreaterThan(0);
  d = await derive();
  expect(d.e).toContain('SP-PIT-NMACONSIST@1');
  const got = await expectFired(page, 'nma-inconsistency', d.e, 'consistent network');
  await checkTab(page, 'nma-inconsistency', got);
  expect(errors).toEqual([]);
});

test('app 18 multivariate-ma: example advice; assumed rho_w gives no WITHINCOR (rule dropped for this round), panel + axe', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/multivariate-ma/index.html');
  await expect(page.locator('#stats .stat').first()).toBeVisible();
  const derive = () => page.evaluate(([UNC_MV]) => {
    const r = window._almLastMultivariate(), Z = 1.959963984540054, e = [];
    if (r.mu.some((m, j) => m - Z * r.muSE[j] <= 0 && 0 <= m + Z * r.muSE[j])) e.push('SP-PIT-NONSIG@1');
    if (r.k < UNC_MV) e.push('SP-UNC-SMALLK@1');
    return { e, k: r.k, mode: r.mode, p: r.p };
  }, [UNC_MV]);
  let d = await derive();
  console.log(`STRAIGHT multivariate-ma example k=${d.k} mode=${d.mode} p=[${d.p.join(', ')}]`);
  expect(d.e).not.toContain('SP-PIT-WITHINCOR@1'); // covariances are supplied in the example
  await expectFired(page, 'multivariate-ma', d.e, 'example');
  await axe(page, '.alm-straight-notice[data-app="multivariate-ma"]', 'multivariate-ma notice');
  // CONTROL (approval 2026-10-21, rule 8 dropped): an assumed within-study correlation must NOT produce SP-PIT-WITHINCOR.
  await page.evaluate(() => {
    const text = window.AlmMvPage.EXAMPLE.split('\n').map(l => l.startsWith('#') ? '# label, y_PD, var_PD, y_AL, var_AL' : l.split(', ').slice(0, 5).join(', ')).join('\n');
    document.getElementById('f-rhow').value = '0.4';
    window.AlmMvPage.load(text, 'rhoW', 'PD', 'AL');
  });
  d = await derive();
  expect(d.e).not.toContain('SP-PIT-WITHINCOR@1');
  const got = await expectFired(page, 'multivariate-ma', d.e, 'rhoW');
  await expect(page.locator('.alm-straight-notice[data-app="multivariate-ma"] li[data-rule="SP-PIT-WITHINCOR@1"]')).toHaveCount(0);
  await checkTab(page, 'multivariate-ma', got);
  expect(errors).toEqual([]);
});
