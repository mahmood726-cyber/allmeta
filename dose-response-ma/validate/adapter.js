/* Published comparison definitions copied without numerical changes from
 * hub/shared/tests/_dr_parity_check.mjs. See MANIFEST.json and README.md. */
(function () {
"use strict";
// Shared comparison for the dosresmeta parity specs: runs in Node on results returned from the page.
//
// Scales: coefficient and prediction differences in units of dosresmeta's standard error;
// vcov differences relative to its largest variance; Ψ differences relative to the larger of
// Ψ's and the vcov's largest diagonal entry (so a Ψ at the zero boundary is judged on the
// scale of the sampling variance); everything else relative to the reference value.
const studiesOf = (ds) => {
  const by = new Map();
  for (const r of ds.rows) { if (!by.has(r.id)) by.set(r.id, { id: r.id, rows: [], mod: r.mod }); by.get(r.id).rows.push(r); }
  return [...by.values()];
};
const optsOf = (f) => ({
  model: f.model.startsWith('rcs') ? 'rcs' : f.model, knots: f.model.startsWith('rcs') ? +f.model.slice(3) : undefined,
  covariance: f.covariance, proc: f.proc, method: f.method, mod: !!f.mod,
});
// Page-side runner (passed to page.evaluate): fits every case and returns plain data.
const runAll = (cases) => cases.map(({ studies, opts, pred }) => {
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
function compare(app, ref) {
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
function tolerance(f) {
  const iterative = f.proc === '2stage' && (f.method === 'reml' || f.method === 'ml');
  return iterative ? { coef: 1e-3, vcov: 1e-3, Psi: 1e-3, logLik: 1e-6, Q: 1e-9, Qp: 1e-9, wald: 1e-3, waldNonlin: 1e-3, gof: 1e-9, pred: 1e-3 }
    // Derived quantities amplify last-bit differences: Wald χ² inverts the coefficient vcov, which is
    // near-singular for 5-knot splines (seen: 1.9e-6 in Chrome, 4.9e-7 in Node), and predictions at the
    // largest dose scale coefficients by dose² for the quadratic; R's own values differ between operating
    // systems in the last bits, reaching ~1.6e-6 along dosresmeta's unconverged one-stage Nelder–Mead path
    // (dose-response-ma-reproducible CI). Hence 1e-5 for Wald and predictions.
    : { coef: 1e-6, vcov: 1e-6, Psi: 1e-6, logLik: 1e-6, Q: 1e-9, Qp: 1e-9, wald: 1e-5, waldNonlin: 1e-5, gof: 1e-9, pred: 1e-5 };
}

const CORPUS_FILES = [{"path": "validate/corpus/reference.json", "sha256": "38f0664a43d8b39fe7ec50eea04b26d62d7f62092e5625f4539388a85c5a5186"}, {"path": "validate/corpus/paper_values.json", "sha256": "6389020bc6bc4e007cb381560333a3ca6b8fb95af590120b4686601a102a0118"}];

function corpusFile(files, path) {
  const value = files instanceof Map ? files.get(path) : files[path];
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object') throw new Error('Missing verified corpus file: ' + path);
  return parsed;
}
async function runCorpus(files, onProgress) {
  const reference = corpusFile(files, CORPUS_FILES[0].path);
  const expected = corpusFile(files, CORPUS_FILES[1].path).values;
  if (reference.schema !== 'dose-response-corpus-v1' || !Array.isArray(reference.datasets) || !expected) {
    throw new Error('Invalid dose-response corpus schema');
  }
  if (!window.AlmDoseResponse || typeof window.AlmDoseResponse.fitDR !== 'function') throw new Error('Dose-response engine unavailable');
  const result = { checks: 0, passed: 0, failed: [], maxima: {}, refusals: { reference: 0, app: 0, matched: 0 }, summaryLines: [] };
  let fits = 0;
  const total = reference.datasets.reduce((n, ds) => n + ds.fits.length, 0);
  const ids = new Set();
  for (const ds of reference.datasets) {
    const studies = studiesOf(ds);
    for (const ref of ds.fits) {
      const id = [ds.dataset, ref.model, ref.covariance, ref.proc, ref.method, ref.mod || ''].join('/');
      if (ids.has(id)) throw new Error('Duplicate corpus combination: ' + id);
      ids.add(id);
      const before = result.failed.length;
      // Deliberately call the shipped engine for every fit, including R refusals.
      // Unexpected exceptions are failures, never counted as matching refusals.
      let app;
      try { app = runAll([{ studies, opts: optsOf(ref), pred: ref.pred }])[0]; }
      catch (error) { result.failed.push({ id, quantity: 'exception', app: String(error), ref: ref.ok, diff: null, tol: 0 }); }
      result.checks++;
      if (!ref.ok) result.refusals.reference++;
      if (app && !app.ok) result.refusals.app++;
      if (app) {
        if (app.ok !== ref.ok) result.failed.push({ id, quantity: 'fit/refusal', app: app.ok, ref: ref.ok, diff: 1, tol: 0 });
        else if (!ref.ok) result.refusals.matched++;
        else {
          const metrics = compare(app, ref), tolerances = tolerance(ref);
          for (const [quantity, diff] of Object.entries(metrics)) {
            const tol = tolerances[quantity];
            result.maxima[quantity] = Math.max(result.maxima[quantity] || 0, diff);
            if (!Number.isFinite(diff) || !(diff <= tol)) result.failed.push({ id, quantity, app: diff, ref: 0, diff, tol });
          }
          if (result.failed.length === before) fits++;
        }
      }
      if (result.failed.length === before) result.passed++;
      if (onProgress) onProgress(result.checks, total);
      if (result.checks % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  for (const [key, actual] of Object.entries({ grid_fits: result.checks, grid_R_fitted: total - result.refusals.reference,
    grid_R_refused: result.refusals.reference, grid_refusals_matched: result.refusals.matched, grid_within_tolerance: result.passed })) {
    if (!expected[key] || actual !== expected[key].value) result.failed.push({ id: 'paper', quantity: key, app: actual, ref: expected[key]?.value, diff: actual - expected[key]?.value, tol: 0 });
  }
  result.summaryLines.push(`${result.checks} combinations: ${fits} fits within tolerance + ${result.refusals.matched} identical refusals (paper 2)`);
  result.summaryLines.push(`${result.passed}/${result.checks} combinations agree; ${result.failed.length} failures.`);
  result.summaryLines.push('Identical refusals means both implementations refuse the same combination; error wording is not compared.');
  return result;
}

const repoUrl = 'https://github.com/mahmood726-cyber/dose-response-ma-reproducible';
const liveCompare = { tolerance: { default: 1e-6 }, kind: {} };
function currentState() {
  // Recompute via the existing UI handler before taking one immutable input/result snapshot.
  const input = document.getElementById('f-data');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const result = window._almLastDoseResponse();
  if (!result) throw new Error('Enter data that the dose-response app can fit before validating.');
  if (['PM', 'DL'].includes(result.method)) throw new Error('R check available via the reproducible repo: dosresmeta does not implement the selected PM/DL estimator. ' + repoUrl);
  const excluded = new Set(result.excluded.map(x => String(x.id)));
  const groups = new Map();
  for (const line of input.value.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const p = text.split(/\s*,\s*/);
    if (p.length < 6 || !Number.isFinite(parseFloat(p[1])) || excluded.has(p[0])) continue;
    if (!groups.has(p[0])) groups.set(p[0], { rows: [], mod: NaN });
    const group = groups.get(p[0]), moderator = parseFloat(p[7]);
    if (!Number.isFinite(group.mod) && Number.isFinite(moderator)) group.mod = moderator;
    group.rows.push({ dose: parseFloat(p[1]), cases: parseFloat(p[2]), n: parseFloat(p[3]),
      logrr: Number.isFinite(parseFloat(p[4])) ? parseFloat(p[4]) : 0,
      se: p[5].trim() === '' ? null : parseFloat(p[5]), type: (p[6] || 'cc').trim().toLowerCase() });
  }
  const rows = [...groups.values()].flatMap((g, i) => g.rows.map(row => ({ ...row, id: i + 1, mod: g.mod })));
  if (groups.size !== result.k) throw new Error('Current data and fitted study count differ; validation refused.');
  const state = { result: JSON.parse(JSON.stringify(result)), rows };
  // Paper scales, expressed as absolute tolerances using the displayed app's full-precision
  // SE/variance (R values do not exist until runR returns). Relative metrics stay relative.
  const iterative = result.approach === '2stage' && ['REML', 'ML'].includes(result.method);
  const t = iterative ? 1e-3 : 1e-6, maxV = Math.max(...result.cov.map((r, i) => Math.abs(r[i])));
  liveCompare.tolerance = { default: 1e-6 }; liveCompare.kind = {};
  result.beta.forEach((_, i) => {
    liveCompare.tolerance['coef_' + i] = t * Math.sqrt(result.cov[i][i]);
    liveCompare.tolerance['se_' + i] = t * Math.sqrt(result.cov[i][i]);
  });
  result.cov.flat().forEach((_, i) => { liveCompare.tolerance['vcov_' + i] = t * maxV; });
  if (result.Psi) {
    const scale = Math.max(maxV, ...result.Psi.map((r, i) => Math.abs(r[i])));
    result.Psi.flat().forEach((_, i) => { liveCompare.tolerance['Psi_' + i] = t * scale; });
  }
  for (const key of ['wald', 'waldNonlin']) { liveCompare.kind[key] = 'rel'; liveCompare.tolerance[key] = iterative ? 1e-3 : 1e-5; }
  liveCompare.kind.logLik = 'rel';
  if (result.qtest) result.qtest.Q.forEach((_, i) => {
    liveCompare.kind['Q_' + i] = 'rel'; liveCompare.tolerance['Q_' + i] = 1e-9; liveCompare.tolerance['Qp_' + i] = 1e-9;
  });
  liveCompare.kind.D = 'rel';
  for (const key of ['D', 'R2', 'R2adj']) liveCompare.tolerance[key] = 1e-9;
  result.predictions.forEach((p, i) => {
    const pt = (iterative ? 1e-3 : 1e-5) * p.se;
    liveCompare.tolerance['pred_' + i] = pt; liveCompare.tolerance['predSE_' + i] = pt;
  });
  return state;
}
function appValues(state) {
  const r = state.result, values = [];
  const add = (key, value, label = key) => { if (!Number.isFinite(value)) throw new Error('Non-finite app quantity: ' + key); values.push({ key, label, value }); };
  r.beta.forEach((v, i) => { add('coef_' + i, v, 'Coefficient ' + (i + 1)); add('se_' + i, Math.sqrt(r.cov[i][i]), 'Coefficient SE ' + (i + 1)); });
  r.cov.flat().forEach((v, i) => add('vcov_' + i, v));
  if (r.Psi) r.Psi.flat().forEach((v, i) => add('Psi_' + i, v));
  if (r.logLik != null) add('logLik', r.logLik, 'Log likelihood');
  add('wald', r.wald.chi2, 'Wald chi-squared');
  if (r.waldNonlinearity) add('waldNonlin', r.waldNonlinearity.chi2, 'Nonlinearity chi-squared');
  if (r.qtest) { r.qtest.Q.forEach((v, i) => add('Q_' + i, v)); r.qtest.p.forEach((v, i) => add('Qp_' + i, v)); }
  add('D', r.gof.deviance); add('R2', r.gof.R2); add('R2adj', r.gof.R2adj);
  r.predictions.forEach((p, i) => { add('pred_' + i, p.logRR, 'Prediction log RR at ' + p.dose); add('predSE_' + i, p.se, 'Prediction SE at ' + p.dose); });
  return values;
}
function buildScript(state) {
  const r = state.result;
  const method = { REML: 'reml', ML: 'ml', FE: 'fixed', MM: 'mm' }[r.method];
  if (!method || !['linear', 'quadratic', 'rcs'].includes(r.model) || !['gl', 'h', 'indep'].includes(r.covariance) || !['1stage', '2stage'].includes(r.approach)) throw new Error('Unsupported model; use ' + repoUrl);
  const num = v => v == null || !Number.isFinite(v) ? 'NA_real_' : String(v);
  const vec = a => 'c(' + a.map(num).join(',') + ')';
  const col = key => vec(state.rows.map(row => row[key]));
  if (state.rows.some(row => !['cc', 'ci', 'ir'].includes(row.type))) throw new Error('Invalid study type');
  const fml = r.model === 'linear' ? 'logrr ~ dose' : r.model === 'quadratic' ? 'logrr ~ dose + I(dose^2)' : 'logrr ~ B';
  return `# dosresmeta 2.2.0, current page data and options; no jsonlite or rms.
suppressPackageStartupMessages(library(dosresmeta))
if (as.character(packageVersion("dosresmeta")) != "2.2.0") stop("Validation requires dosresmeta 2.2.0")
d <- data.frame(id=${col('id')}, dose=${col('dose')}, cases=${col('cases')}, n=${col('n')}, logrr=${col('logrr')}, se=${col('se')}, moderator=${col('mod')}, type=c(${state.rows.map(row => '"' + row.type + '"').join(',')}))
d$id <- factor(d$id, levels=unique(d$id))
kn <- ${vec(r.knots || [])}
basis <- function(x) {
  ${r.model === 'linear' ? 'return(matrix(x, ncol=1))' : r.model === 'quadratic' ? 'return(cbind(x, x^2))' : `nk <- length(kn); last <- kn[nk]; penult <- kn[nk-1]
  ans <- matrix(x, ncol=1)
  for (j in seq_len(nk-2)) ans <- cbind(ans, (pmax(x-kn[j],0)^3 - pmax(x-penult,0)^3*(last-kn[j])/(last-penult) + pmax(x-last,0)^3*(penult-kn[j])/(last-penult))/(last-kn[1])^2)
  ans`}
}
${r.model === 'rcs' ? 'B <- basis(d$dose)' : ''}
f <- dosresmeta(${fml}, id=id, type=type, se=se, cases=cases, n=n, data=d, covariance="${r.covariance}", proc="${r.approach}", method="${method}"${r.metaRegression ? ', mod=~moderator' : ''})
b <- coef(f); V <- vcov(f)
values <- list()
add <- function(key, value) { if (length(value)!=1 || !is.finite(value)) stop(paste("Non-finite R quantity",key)); values[[key]] <<- as.numeric(value) }
addvec <- function(key, value) { for (i in seq_along(value)) add(paste0(key,"_",i-1),value[i]) }
addvec("coef",b); addvec("se",sqrt(diag(V))); addvec("vcov",as.vector(t(V)))
${r.Psi ? 'addvec("Psi",as.vector(t(f$Psi)))' : ''}
${r.logLik != null ? 'add("logLik",as.numeric(f$logLik))' : ''}
add("wald",waldtest(Sigma=V,b=b,Terms=seq_along(b))$chitest[1])
${r.waldNonlinearity ? 'add("waldNonlin",waldtest(Sigma=V,b=b,Terms=2:f$dim$q)$chitest[1])' : ''}
${r.qtest ? 'qt <- qtest(f); addvec("Q",qt$Q); addvec("Qp",qt$pvalue)' : ''}
g <- gof(f); add("D",g$deviance$D); add("R2",g$R2); add("R2adj",g$R2adj)
X <- sweep(basis(${vec(r.predictions.map(p => p.dose))}), 2, as.numeric(basis(${num(r.referenceDose)})), "-")
${r.metaRegression ? 'X <- cbind(X, X * ' + num(r.covariateValue) + ')' : ''}
addvec("pred",as.numeric(X %*% b)); addvec("predSE",sqrt(pmax(0,rowSums((X %*% V)*X))))
cat("ALMJSON:{",paste(sprintf('"%s":%.17g',names(values),unlist(values)),collapse=","),"}\\n",sep="")
`;
}
const adapter = {
  app: 'dose-response-ma',
  paper: { title: 'A browser tool for dose-response meta-analysis, validated against R dosresmeta', doi: '10.5281/zenodo.23135712', checks: 724,
    runUrl: repoUrl + '/actions/workflows/reproduce.yml', codespacesUrl: 'https://codespaces.new/mahmood726-cyber/dose-response-ma-reproducible?quickstart=1', repoUrl },
  live: { packages: ['dosresmeta', 'mixmeta'], validatedVersions: { dosresmeta: '2.2.0' }, currentState, appValues, buildScript, compare: liveCompare },
  corpus: { files: CORPUS_FILES, run: runCorpus }
};
window.AlmDoseValidate = adapter;
if (window.AlmValidate) window.AlmValidate.mount(document.getElementById('alm-validate'), adapter);
else document.getElementById('alm-validate').textContent = 'Validation widget unavailable in this checkout. R check available via the reproducible repo: ' + repoUrl;
})();
