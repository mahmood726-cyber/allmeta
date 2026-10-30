// Lane A5 browser parity: shared/sensitivity-v1.js in the browser agrees with Node to REL <= 1e-12,
// and the browser's own numbers pass the metafor reference for every manifest-listed combination.
// Not bit-identical by design of the engines: ma-core's bisection t quantile differs in the last
// bits between V8 builds (measured: _qt(0.975, 81) = 1.9896863234572275 in Edge/Chrome 147,
// 1.9896863234572382 in Node 24, AlmStats absent in both), so t-based quantities can differ ~1e-15.
// Run: npx playwright test -c addons-a5.playwright.config.mjs   (private port 8161)
import {test, expect} from '@playwright/test';
import {REFERENCE, MANIFEST, readText, loadApi, compareValue} from './addons-a5-parity.mjs';

const reference = JSON.parse(readText(REFERENCE)), manifest = JSON.parse(readText(MANIFEST));
const S = loadApi();
const KEYS = ['refused', 'k', 'df', 'tau2', 'mu', 'se', 'ciLo', 'ciHi', 'Q', 'I2', 'piLo', 'piHi'];
const pick = r => Object.fromEntries(KEYS.map(k => [k, r[k] === undefined ? null : r[k]]));
const LOO_IDS = reference.analyses.filter(a => a.loo).slice(0, 6).map(a => a.id);

const close = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) / Math.max(1, Math.abs(b)) <= 1e-12);
const sameRow = (a, b) => Object.keys(b).every(k => close(a[k], b[k])) && Object.keys(a).length === Object.keys(b).length;
test('browser agrees with Node to 1e-12, and browser numbers pass the R reference on listed combinations', async ({page}) => {
  test.setTimeout(900000);
  await page.goto('/heterogeneity/index.html');
  await page.addScriptTag({url: '/shared/sensitivity-v1.js'});
  const jobs = reference.analyses.map(a => ({id: a.id, yi: a.yi, vi: a.vi, measure: a.measure, loo: LOO_IDS.includes(a.id)}));
  const browser = await page.evaluate(({jobs, keys}) => {
    const out = {};
    for (const j of jobs) for (const m of AlmSensitivity.METHODS) for (const t of AlmSensitivity.TESTS) {
      const r = AlmSensitivity.fit(j.yi, j.vi, {method: m, test: t});
      out[j.id + '|' + m + '/' + t] = {fit: Object.fromEntries(keys.map(k => [k, r[k] === undefined ? null : r[k]])),
        loo: j.loo ? AlmSensitivity.leaveOneOut(j.yi, j.vi, {method: m, test: t}).rows.map(x => [x.mu, x.se, x.ciLo, x.ciHi, x.tau2, x.I2]) : null};
    }
    return out;
  }, {jobs, keys: KEYS});
  let identical = 0, exact = 0, rChecks = 0;
  const failures = [];
  for (const a of reference.analyses) for (const m of S.METHODS) for (const t of S.TESTS) {
    const key = a.id + '|' + m + '/' + t, b = browser[key];
    const node = pick(S.fit(a.yi, a.vi, {method: m, test: t}));
    expect(sameRow(b.fit, node), key + ' ' + JSON.stringify([b.fit, node])).toBe(true);
    if (JSON.stringify(b.fit) === JSON.stringify(node)) exact++;
    if (b.loo) {
      const n = S.leaveOneOut(a.yi, a.vi, {method: m, test: t}).rows.map(x => [x.mu, x.se, x.ciLo, x.ciHi, x.tau2, x.I2]);
      expect(b.loo.length).toBe(n.length);
      b.loo.forEach((r, i) => expect(r.every((v, j) => close(v, n[i][j])), key + ' loo ' + i).toBe(true));
    }
    identical++;
    if (!S.allowed(manifest, a.measure, m, t)) continue;
    const ref = a.combos[m + '/' + t].fit;
    if (ref.refused !== b.fit.refused) { failures.push(key + ' refusal'); continue; }
    for (const q of ['tau2', 'mu', 'se', 'ciLo', 'ciHi', 'Q', 'I2', 'piLo', 'piHi']) { rChecks++; const f = compareValue(m, q, b.fit[q], ref[q]); if (f) failures.push(key + ' ' + q); }
  }
  expect(identical).toBe(230 * 27);
  console.log('browser rows exactly equal to Node: ' + exact + '/' + identical + '; R checks on listed combinations: ' + rChecks);
  expect(rChecks).toBeGreaterThan(1000);
  expect(failures).toEqual([]);
});

test('the browser module refuses to run without ma-core and refuses unknown configurations', async ({page}) => {
  await page.goto('/hub/shared/tests/plot-export-fixture.html'); // a page without ma-core
  await page.addScriptTag({url: '/shared/sensitivity-v1.js'});
  const out = await page.evaluate(() => {
    const r = [];
    try { AlmSensitivity.fit([1, 2], [1, 1], {method: 'REML'}); r.push('ran'); } catch (e) { r.push(e.message); }
    return r;
  });
  expect(out).toEqual(['AlmSensitivity requires shared/ma-core.js (AlmMaCore) to be loaded first']);
  await page.goto('/heterogeneity/index.html');
  await page.addScriptTag({url: '/shared/sensitivity-v1.js'});
  expect(await page.evaluate(() => { try { AlmSensitivity.fit([1, 2], [1, 1], {method: 'REML', test: 'wald'}); return 'ran'; } catch (e) { return e.message; } })).toBe('Unknown test: wald');
});
