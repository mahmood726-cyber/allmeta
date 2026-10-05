/**
 * Shared helpers for the NMA parity spec (nma-netmeta-parity.spec.mjs): turn a fixture dataset into the
 * app's contrast rows, run the engine (runAll; in the page or in Node), and compare with netmeta.
 *
 * Convention: netmeta's TE is treat1 - treat2; the app's estimate is treatment2 - treatment1, so each
 * contrast is passed with t1 = treat2, t2 = treat1. All matrices are [i][j] = treatment i versus j.
 *
 * netmeta's common-effect and DerSimonian–Laird analyses are closed form, and the engine evaluates the
 * same formulas, so tolerances are tight and typed by quantity:
 *   estimates, SEs, CIs, prediction intervals   1e-9 relative (max(1, |value|))
 *   Q, tau^2, decomposition of Q                 1e-9 relative
 *   p-values, I^2 and its CI, P-scores           1e-9 absolute
 *   refusals                                     must match
 */
export const rowsOf = (ds) => ds.contrasts.map((c) => ({ study: c.studlab, t1: c.treat2, t2: c.treat1, est: c.TE, se: c.seTE }));
export const jobsOf = (ds) => ds.fits.map((f) => ({ rows: rowsOf(ds), opts: { randomCi: f.method_random_ci } }));

// Runs in the page (or in Node with the engine on globalThis).
export function runAll(jobs) {
  const E = globalThis.AlmNmaMultiarm;
  return jobs.map((j) => {
    const flat = (M) => M.flat();
    const a = E.analyse(j.rows, j.opts);
    if (!a.ok) return { ok: false, error: a.error };
    const b = E.analyse(j.rows, { ...j.opts, smallValues: 'undesirable' });
    const L = (x) => ({ TE: flat(x.TE), seTE: flat(x.seTE), lower: flat(x.lower), upper: flat(x.upper), pval: flat(x.pval) });
    return { ok: true, trts: a.treatments, k: a.k, m: a.m, n: a.n, Q: a.Q, df: a.df, pvalQ: a.pvalQ, tau2: a.tau2, I2: a.I2,
      lowerI2: a.lowerI2, upperI2: a.upperI2, common: L(a.common), random: L(a.random),
      predict: a.predict ? { lower: flat(a.predict.lower), upper: flat(a.predict.upper) } : null, decomp: a.decomp,
      pscoreDesirable: a.pscore, pscoreUndesirable: b.pscore };
  });
}

const offDiag = (n) => { const ix = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) ix.push(i * n + j); return ix; };
const relMax = (a, b, ix) => Math.max(0, ...ix.map((k) => Math.abs(a[k] - b[k]) / Math.max(1, Math.abs(b[k]))));
const absMax = (a, b, ix) => Math.max(0, ...ix.map((k) => Math.abs(a[k] - b[k])));
const relv = (a, b) => Math.max(0, ...b.map((v, i) => (v === null ? (a[i] === null ? 0 : Infinity) : Math.abs(a[i] - v) / Math.max(1, Math.abs(v)))));
const absv = (a, b) => Math.max(0, ...b.map((v, i) => (v === null ? (a[i] === null ? 0 : Infinity) : Math.abs(a[i] - v))));
const nul = (a, b, f) => (b === null || b === undefined ? (a === null || a === undefined ? 0 : Infinity) : f(a, b));

// metric name -> discrepancy
// R orders treatments with locale collation, the app by code unit: re-index the app's matrices and
// vectors to netmeta's treatment order by name before comparing.
function reorder(app, trts) {
  const n = trts.length, p = trts.map((t) => app.trts.indexOf(t));
  if (p.some((i) => i < 0) || app.trts.length !== n) return null;
  const M = (v) => v && trts.flatMap((_, i) => trts.map((__, j) => v[p[i] * n + p[j]]));
  const V = (v) => v && p.map((i) => v[i]);
  const L = (x) => ({ TE: M(x.TE), seTE: M(x.seTE), lower: M(x.lower), upper: M(x.upper), pval: M(x.pval) });
  return { ...app, trts, common: L(app.common), random: L(app.random), predict: app.predict && { lower: M(app.predict.lower), upper: M(app.predict.upper) },
    pscoreDesirable: { common: V(app.pscoreDesirable.common), random: V(app.pscoreDesirable.random) },
    pscoreUndesirable: { common: V(app.pscoreUndesirable.common), random: V(app.pscoreUndesirable.random) } };
}

export function compare(appIn, ref) {
  const n = ref.trts.length, ix = offDiag(n), all = [...Array(n * n).keys()];
  const app = reorder(appIn, ref.trts);
  if (!app) return { treatments: Infinity };
  const m = {
    TE_common: relMax(app.common.TE, ref.TE_common, all), seTE_common: relMax(app.common.seTE, ref.seTE_common, all),
    CI_common: Math.max(relMax(app.common.lower, ref.lower_common, ix), relMax(app.common.upper, ref.upper_common, ix)),
    p_common: absMax(app.common.pval, ref.pval_common, ix),
    TE_random: relMax(app.random.TE, ref.TE_random, all), seTE_random: relMax(app.random.seTE, ref.seTE_random, all),
    CI_random: Math.max(relMax(app.random.lower, ref.lower_random, ix), relMax(app.random.upper, ref.upper_random, ix)),
    p_random: absMax(app.random.pval, ref.pval_random, ix),
    Q: nul(app.Q, ref.Q, (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b))), df: Math.abs(app.df - ref.df_Q), // netmeta computes df.Q = 2*sum(1/narms) - (n - 1) in floating point (not always an exact integer on ARM)
    pvalQ: nul(app.pvalQ, ref.pval_Q, (a, b) => Math.abs(a - b)),
    tau2: nul(app.tau2, ref.tau2, (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b))),
    I2: Math.max(nul(app.I2, ref.I2, (a, b) => Math.abs(a - b)), nul(app.lowerI2, ref.lower_I2, (a, b) => Math.abs(a - b)), nul(app.upperI2, ref.upper_I2, (a, b) => Math.abs(a - b))),
    predict: ref.lower_predict ? (app.predict ? Math.max(relMax(app.predict.lower, ref.lower_predict, ix), relMax(app.predict.upper, ref.upper_predict, ix)) : Infinity) : (app.predict ? Infinity : 0),
    pscore: Math.max(absv(app.pscoreDesirable.common, ref.pscore_desirable.common), absv(app.pscoreDesirable.random, ref.pscore_desirable.random),
      absv(app.pscoreUndesirable.common, ref.pscore_undesirable.common), absv(app.pscoreUndesirable.random, ref.pscore_undesirable.random)),
    decomp: ref.Q_decomp ? (app.decomp ? Math.max(relv(app.decomp.Q, ref.Q_decomp.Q), relv(app.decomp.df, ref.Q_decomp.df), absv(app.decomp.pval, ref.Q_decomp.pval)) : Infinity) : (app.decomp ? Infinity : 0),
  };
  return m;
}

export const TOL = { TE_common: 1e-9, seTE_common: 1e-9, CI_common: 1e-9, p_common: 1e-9, TE_random: 1e-9, seTE_random: 1e-9, CI_random: 1e-9,
  p_random: 1e-9, Q: 1e-9, df: 1e-9, treatments: 0, pvalQ: 1e-9, tau2: 1e-9, I2: 1e-9, predict: 1e-9, pscore: 1e-9, decomp: 1e-9 };

// Check one dataset: failure messages (empty = PASS) and the number of checks.
export function checkDataset(ds, res) {
  const bad = []; let n = 0;
  ds.fits.forEach((f, i) => {
    const tag = `${ds.dataset} ${f.method_random_ci}`;
    n++;
    if (f.ok !== res[i].ok) { bad.push(`${tag}: netmeta ${f.ok ? 'fits' : 'refuses'}, app ${res[i].ok ? 'fits' : 'refuses (' + res[i].error + ')'}`); return; }
    if (!f.ok) return;
    const m = compare(res[i], f);
    for (const k in m) { n++; if (!(m[k] <= TOL[k])) bad.push(`${tag}: ${k} = ${Number(m[k]).toExponential(2)} > ${TOL[k]}`); }
  });
  return { bad, n };
}
