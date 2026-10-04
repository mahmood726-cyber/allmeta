/**
 * Shared helpers for the DTA parity spec (dta-bivariate-mada-parity.spec.mjs): turn a fixture
 * dataset into engine input, run every fit in the page (runAll), and compare with mada.
 * Also usable from Node (the engine is a UMD module that attaches to globalThis).
 *
 * Tolerances are typed by how mada obtains the number:
 *   closed form ("fixed", "mm")          1e-9 relative (estimates) — same arithmetic, different order
 *   fixed-point iteration ("vc")         1e-8 relative — same iteration and stopping rule
 *   optimiser ("reml", "ml")             1e-6 relative for β, vcov and Ψ — the same IGLS start and BFGS
 *                                        (vmmin port, reltol = sqrt(eps)) are used, but a BFGS path in
 *                                        floating point is not bit-reproducible across BLAS/compilers
 *   derived quantities (summary points,  1e-6 absolute (probabilities, AUC) / 1e-6 relative (HSROC)
 *   AUC, HSROC, SROC, regions) of an
 *   optimiser fit
 *   log-likelihood, AIC, BIC             1e-6 absolute
 *   regions                              every one of mada's 100 ellipse points must satisfy the app's
 *                                        region equation (x−μ)'C⁻¹(x−μ) = χ²₂(0.95), and every point of
 *                                        the app's drawn region must satisfy mada's, to 1e-6 relative
 *   Moses–Littenberg (OLS)               1e-9 absolute
 */
export const CHI2 = 5.991464547107979;

export const rowsOf = (ds) => ds.rows.map((r) => ({ tp: r.TP, fp: r.FP, fn: r.FN, tn: r.TN }));

// R model.matrix for "cbind(tsens, tfpr) ~ a + b": character columns become treatment-coded
// factors with alphabetically sorted levels (R's default), numeric columns enter as they are.
export function designOf(ds, formula) {
  if (!formula) return { X: null, names: ['(Intercept)'] };
  const terms = formula.split('~')[1].split('+').map((s) => s.trim()).filter(Boolean);
  const names = ['(Intercept)'], cols = [];
  for (const t of terms) {
    const v = ds.rows.map((r) => r[t]);
    if (v.some((x) => typeof x === 'string')) {
      const lev = [...new Set(v)].sort();
      for (const l of lev.slice(1)) { names.push(t + l); cols.push(v.map((x) => (x === l ? 1 : 0))); }
    } else { names.push(t); cols.push(v.map(Number)); }
  }
  return { X: ds.rows.map((_, i) => [1, ...cols.map((c) => c[i])]), names };
}

export const optsOf = (ds, f) => {
  const d = designOf(ds, f.formula);
  return { method: f.method, correctionControl: f.correction, X: d.X, covariateNames: d.names };
};

// Runs in the page (or in Node with the engine on globalThis): one result per job.
export function runAll(jobs) {
  const B = globalThis.AlmDTABivariate;
  const logit = (p) => Math.log(p / (1 - p));
  const onEllipse = (C, mu, fpr, sens) => { // max relative error of points in (x-mu)'C^-1(x-mu) = chi2
    const det = C[0][0] * C[1][1] - C[0][1] * C[1][0];
    let worst = 0;
    fpr.forEach((fp, i) => {
      const a = logit(sens[i]) - mu[0], b = logit(fp) - mu[1];
      const q = (C[1][1] * a * a - 2 * C[0][1] * a * b + C[0][0] * b * b) / det;
      worst = Math.max(worst, Math.abs(q - 5.991464547107979) / 5.991464547107979);
    });
    return worst;
  };
  // Both directions: mada's 100 points satisfy the app's region equation, and the app's drawn region
  // (regionEllipse) satisfies mada's (built from mada's Psi and vcov).
  const regionErr = (f, kind, pts, ref) => {
    if (!pts) return null;
    const add = (A, B) => [[A[0][0] + B[0][0], A[0][1] + B[0][1]], [A[1][0] + B[1][0], A[1][1] + B[1][1]]];
    const C = kind === 'pred' ? add(f.Psi, f.covMu) : f.covMu;
    const e1 = onEllipse(C, [f.muLogitSe, f.muLogitFPR], pts.fpr, pts.sens);
    const drawn = B.regionEllipse(f, kind === 'pred' ? 'prediction' : 'confidence', 100);
    const rv = [[ref.vcov[0], ref.vcov[2]], [ref.vcov[1], ref.vcov[3]]], rP = [[ref.Psi[0], ref.Psi[2]], [ref.Psi[1], ref.Psi[3]]];
    const e2 = onEllipse(kind === 'pred' ? add(rP, rv) : rv, ref.coef, drawn.map((q) => q.fpr), drawn.map((q) => q.tpr));
    return Math.max(e1, e2);
  };
  return jobs.map((j) => {
    let f;
    try { f = B.fit(j.rows, j.opts); } catch (e) { return { ok: false, error: String(e.message || e) }; }
    const r = { ok: true, coef: f.coef, vcov: [].concat(...f.vcov), Psi: [].concat(...f.Psi),
      logLik: f.logLik, AIC: f.AIC, BIC: f.BIC, converged: f.converged };
    if (f.p === 1) {
      r.summary = { sens: [f.sens, f.sensCI[0], f.sensCI[1]], fpr: [f.fpr, f.fprCI[0], f.fprCI[1]], corRandom: f.corRandom };
      r.hsroc = f.hsroc; r.auc = f.auc;
      if (f.srocSlope != null && j.grid) r.sroc = { rg: j.grid.map((x) => B.srocAt(f, x, 'ruttergatsonis')), naive: j.grid.map((x) => B.srocAt(f, x, 'naive')) };
      r.confErr = regionErr(f, 'conf', j.conf, j.ref); r.predErr = regionErr(f, 'pred', j.pred, j.ref);
    }
    return r;
  });
}

export const jobsOf = (ds) => ds.fits.map((f) => ({ rows: rowsOf(ds), opts: optsOf(ds, f), grid: f.sroc ? f.sroc.fpr : null, conf: f.conf || null, pred: f.pred || null,
  ref: f.conf ? { coef: f.coef, vcov: f.vcov, Psi: f.Psi } : null }));

const relMax = (a, b) => Math.max(0, ...b.map((v, i) => Math.abs(a[i] - v) / Math.max(1, Math.abs(v))));
const absMax = (a, b) => Math.max(0, ...b.map((v, i) => Math.abs(a[i] - v)));

// metric name -> discrepancy, for the outputs mada reports for this fit
export function compare(app, ref) {
  const m = { coef: relMax(app.coef, ref.coef), vcov: relMax(app.vcov, ref.vcov) };
  if (ref.Psi) m.Psi = relMax(app.Psi, ref.Psi);
  if (ref.logLik != null) { m.logLik = Math.abs(app.logLik - ref.logLik); m.AIC = Math.abs(app.AIC - ref.AIC); m.BIC = Math.abs(app.BIC - ref.BIC); }
  if (ref.summary) {
    m.summary = Math.max(absMax(app.summary.sens, ref.summary.sens), absMax(app.summary.fpr, ref.summary.fpr));
    m.corRandom = Math.abs(app.summary.corRandom - ref.summary.corRandom);
  }
  if (ref.hsroc) m.hsroc = relMax(['Theta', 'Lambda', 'beta', 'sigma2theta', 'sigma2alpha'].map((k) => app.hsroc[k]), ['Theta', 'Lambda', 'beta', 'sigma2theta', 'sigma2alpha'].map((k) => ref.hsroc[k]));
  if (ref.auc && ref.auc.rg) m.auc = Math.max(absMax(app.auc.rg, ref.auc.rg), ref.auc.naive ? absMax(app.auc.naive, ref.auc.naive) : 0);
  if (ref.sroc) m.sroc = Math.max(absMax(app.sroc.rg, ref.sroc.rg), absMax(app.sroc.naive, ref.sroc.naive));
  if (ref.conf) m.confRegion = app.confErr;
  if (ref.pred) m.predRegion = app.predErr;
  return m;
}

export function tolerance(ref) {
  const est = { fixed: 1e-9, mm: 1e-9, vc: 1e-8, reml: 1e-6, ml: 1e-6 }[ref.method];
  return { coef: est, vcov: est, Psi: est, logLik: 1e-6, AIC: 1e-6, BIC: 1e-6, summary: 1e-6, corRandom: 1e-6,
    hsroc: Math.max(est, 1e-6), auc: 1e-6, sroc: 1e-6, confRegion: 1e-6, predRegion: 1e-6 };
}

// Moses–Littenberg (mslSROC) per correction rule
export function mosesJobs(ds) { return ds.moses.map((m) => ({ rows: rowsOf(ds), opts: { correctionControl: m.correction } })); }
export function runMoses(jobs) {
  const B = globalThis.AlmDTABivariate;
  return jobs.map((j) => { try { const r = B.mosesLittenberg(j.rows, j.opts); return r ? { ok: true, A1: r.A1, B1: r.B1 } : { ok: false }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
}

// Full check of one dataset: returns a list of failure messages (empty = PASS) and the number of checks.
export function checkDataset(ds, res, mres) {
  const bad = []; let n = 0;
  ds.fits.forEach((f, i) => {
    const tag = `${ds.dataset} ${f.method}/${f.correction}${f.formula ? ' ' + f.formula.replace('cbind(tsens, tfpr) ', '') : ''}`;
    n++;
    if (f.ok !== res[i].ok) { bad.push(`${tag}: mada ${f.ok ? 'fits' : 'refuses'}, app ${res[i].ok ? 'fits' : 'refuses (' + res[i].error + ')'}`); return; }
    if (!f.ok) return;
    const m = compare(res[i], f), tol = tolerance(f);
    for (const k in m) { n++; if (!(m[k] <= tol[k])) bad.push(`${tag}: ${k} = ${Number(m[k]).toExponential(2)} > ${tol[k]}`); }
  });
  ds.moses.forEach((m, i) => {
    n++;
    if (m.ok !== mres[i].ok) { bad.push(`${ds.dataset} moses/${m.correction}: mada ${m.ok ? 'fits' : 'refuses'}, app ${mres[i].ok ? 'fits' : 'refuses'}`); return; }
    if (m.ok && !(Math.max(Math.abs(mres[i].A1 - m.A1), Math.abs(mres[i].B1 - m.B1)) <= 1e-9)) bad.push(`${ds.dataset} moses/${m.correction}: A1/B1 differ`);
  });
  return { bad, n };
}
