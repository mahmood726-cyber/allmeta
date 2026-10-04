// Shared comparison for the dosresmeta parity specs: runs in Node on results returned from the page.
//
// Scales: coefficient and prediction differences in units of dosresmeta's standard error;
// vcov differences relative to its largest variance; Ψ differences relative to the larger of
// Ψ's and the vcov's largest diagonal entry (so a Ψ at the zero boundary is judged on the
// scale of the sampling variance); everything else relative to the reference value.
export const studiesOf = (ds) => {
  const by = new Map();
  for (const r of ds.rows) { if (!by.has(r.id)) by.set(r.id, { id: r.id, rows: [], mod: r.mod }); by.get(r.id).rows.push(r); }
  return [...by.values()];
};
export const optsOf = (f) => ({
  model: f.model.startsWith('rcs') ? 'rcs' : f.model, knots: f.model.startsWith('rcs') ? +f.model.slice(3) : undefined,
  covariance: f.covariance, proc: f.proc, method: f.method, mod: !!f.mod,
});
// Page-side runner (passed to page.evaluate): fits every case and returns plain data.
export const runAll = (cases) => cases.map(({ studies, opts, pred }) => {
  const r = window.AlmDoseResponse.fitDR(studies, opts);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, coef: r.coef, vcov: [].concat(...r.vcov), Psi: r.Psi ? [].concat(...r.Psi) : null, logLik: r.logLik, converged: r.converged,
    qtest: r.qtest, wald: r.wald, waldNonlin: r.waldNonlin || null,
    gof: { D: r.gof.D, R2: r.gof.R2, R2adj: r.gof.R2adj, p: r.gof.p, resid: r.gof.residuals.map((x) => x.resid) },
    pred: pred ? r.predict(pred.dose, pred.dose[0]) : null };
});
const maxDiag = (flat) => { const n = Math.round(Math.sqrt(flat.length)); let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(flat[i * n + i])); return m; };
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
// Returns {metric: value} for one fit (smaller is better; 0 = identical).
export function compare(app, ref) {
  const n = ref.coef.length, se = ref.coef.map((_, i) => Math.sqrt(ref.vcov[i * n + i])), vs = maxDiag(ref.vcov);
  const m = {};
  m.coef = Math.max(...ref.coef.map((b, i) => Math.abs(app.coef[i] - b) / se[i]));
  m.vcov = Math.max(...ref.vcov.map((v, i) => Math.abs(app.vcov[i] - v))) / vs;
  if (ref.Psi) { const s = Math.max(maxDiag(ref.Psi), vs); m.Psi = Math.max(...ref.Psi.map((v, i) => Math.abs(app.Psi[i] - v))) / s; }
  if (ref.logLik != null) m.logLik = rel(app.logLik, ref.logLik);
  if (ref.qtest) { m.Q = Math.max(...ref.qtest.Q.map((q, i) => rel(app.qtest.Q[i], q))); m.Qp = Math.max(...ref.qtest.p.map((p, i) => Math.abs(app.qtest.p[i] - p))); }
  m.wald = rel(app.wald.chi2, ref.wald[0]);
  if (ref.waldNonlin) m.waldNonlin = rel(app.waldNonlin.chi2, ref.waldNonlin[0]);
  if (ref.gof) m.gof = Math.max(rel(app.gof.D, ref.gof.D), Math.abs(app.gof.R2 - ref.gof.R2), Math.abs(app.gof.R2adj - ref.gof.R2adj),
    ...ref.gof.resid.map((r, i) => Math.abs(app.gof.resid[i] - r)));
  if (ref.pred) m.pred = Math.max(...ref.pred.pred.map((p, i) => ref.pred.se[i] > 0 ? (Math.abs(app.pred[i].logRR - p) + Math.abs(app.pred[i].se - ref.pred.se[i])) / ref.pred.se[i] : Math.abs(app.pred[i].logRR - p)));
  return m;
}
// Tolerances. Closed-form or identical-path fits (fixed effect, MM, one-stage, all tests that do
// not depend on Ψ) must agree to 1e-6. Two-stage REML/ML stop where BFGS meets reltol = sqrt(eps)
// on the log-likelihood; where the likelihood is flat in a badly scaled direction, rounding moves
// that point, so estimates are judged in standard-error units (1e-3 SE) with the log-likelihood
// held to 1e-6 relative.
export function tolerance(f) {
  const iterative = f.proc === '2stage' && (f.method === 'reml' || f.method === 'ml');
  return iterative ? { coef: 1e-3, vcov: 1e-3, Psi: 1e-3, logLik: 1e-6, Q: 1e-9, Qp: 1e-9, wald: 1e-3, waldNonlin: 1e-3, gof: 1e-9, pred: 1e-3 }
    // Wald χ² inverts the coefficient vcov, which is near-singular for 5-knot splines; last-bit
    // differences between JS engines are amplified there (seen: 1.9e-6 in Chrome, 4.9e-7 in Node).
    : { coef: 1e-6, vcov: 1e-6, Psi: 1e-6, logLik: 1e-6, Q: 1e-9, Qp: 1e-9, wald: 1e-5, waldNonlin: 1e-5, gof: 1e-9, pred: 1e-6 };
}
