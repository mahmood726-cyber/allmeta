/* Published parity definitions copied from _nma_parity_check.mjs. Engine remains AlmNmaMultiarm. */
(function () {
"use strict";
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
const rowsOf = (ds) => ds.contrasts.map((c) => ({ study: c.studlab, t1: c.treat2, t2: c.treat1, est: c.TE, se: c.seTE }));
const jobsOf = (ds) => ds.fits.map((f) => ({ rows: rowsOf(ds), opts: { randomCi: f.method_random_ci } }));

// Runs in the page (or in Node with the engine on globalThis).
function runAll(jobs) {
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

function compare(appIn, ref) {
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

const TOL = { TE_common: 1e-9, seTE_common: 1e-9, CI_common: 1e-9, p_common: 1e-9, TE_random: 1e-9, seTE_random: 1e-9, CI_random: 1e-9,
  p_random: 1e-9, Q: 1e-9, df: 1e-9, treatments: 0, pvalQ: 1e-9, tau2: 1e-9, I2: 1e-9, predict: 1e-9, pscore: 1e-9, decomp: 1e-9 };


const corpusFiles = [{"path": "validate/corpus/reference.json", "sha256": "bda47f60cfd148ebcc511103ab8a61558b5cde1daffc593e8b02b1c9eff9d74f"}, {"path": "validate/corpus/paper-values.json", "sha256": "3b364ca7fccf23636df2386eb6e5bb22f62e58b9d6d0246f1a54f26d3af00595"}];
const repoUrl = 'https://github.com/mahmood726-cyber/nma-reproducible';
function payload(files, path) {
  const v = files instanceof Map ? files.get(path) : files[path];
  if (v === undefined) throw new Error('Missing verified corpus file: ' + path);
  return typeof v === 'string' ? JSON.parse(v) : v;
}
async function runCorpus(files, onProgress) {
  const corpus = payload(files, corpusFiles[0].path);
  const expected = payload(files, corpusFiles[1].path).values;
  if (!Array.isArray(corpus.datasets) || corpus.datasets.length !== expected.datasets.value) throw new Error('Corpus dataset count mismatch');
  let checks = 0, passed = 0, analyses = 0, fitted = 0, within = 0;
  const failed = [], maxima = {}, refusals = { expected: 0, matched: 0, details: [] };
  function record(id, quantity, app, ref, diff, tol) {
    checks++;
    if (Number.isFinite(diff) && diff <= tol) passed++;
    else failed.push({ id, quantity, app, ref, diff, tol });
  }
  for (const ds of corpus.datasets) {
    const results = runAll(jobsOf(ds));
    ds.fits.forEach((ref, i) => {
      const app = results[i], id = ds.dataset + ' ' + ref.method_random_ci;
      analyses++;
      record(id, 'fit/refusal', app.ok, ref.ok, app.ok === ref.ok ? 0 : 1, 0);
      if (!ref.ok) {
        refusals.expected++;
        if (!app.ok) refusals.matched++;
        refusals.details.push({id, app: app.error, ref: ref.error});
      }
      if (!app.ok || !ref.ok) return;
      fitted++;
      const metrics = compare(app, ref);
      if (Object.entries(metrics).every(([k, v]) => Number.isFinite(v) && v <= TOL[k])) within++;
      for (const [quantity, diff] of Object.entries(metrics)) {
        maxima[quantity] = Math.max(maxima[quantity] || 0, diff);
        // A paper check is a maximum discrepancy over a family, not one scalar cell.
        record(id, quantity + ' (maximum discrepancy)', diff, 0, diff, TOL[quantity]);
      }
    });
    if (onProgress) onProgress(`${analyses}/${expected.analyses.value} analyses; ${checks} checks`);
  }
  if (analyses !== expected.analyses.value || checks !== expected.checks_total.value) {
    // The widget independently reports paper-count mismatch; do not invent a check.
    if (analyses !== expected.analyses.value) throw new Error('Corpus analysis count mismatch');
  }
  return {checks, passed, failed, maxima, refusals, analyses, fitted, within,
    summaryLines: [`${passed}/${checks} checks passed; ${analyses} analyses (${within} within 1e-9; ${refusals.matched} identical refusals).`,
      'Archived R netmeta 3.7-0; 16 numerical families plus fit/refusal per analysis. Refusals compare acceptance status, not error wording.']};
}
function currentState() {
  const read = id => document.getElementById(id).value;
  const state = {note:'Browser netmeta 3.4-0; validated version in the paper: netmeta 3.7-0. Differences beyond 1e-6 are FAIL, including version differences.', text:read('f-data'), ref:read('f-ref'), model:read('f-model'), ci:read('f-ci'), dir:read('f-dir'), scale:read('f-scale')};
  // Reuse the page's parser and the exact engine used to render its results.
  state.result = window.__almNmaCompute(state.text, state.ref, {randomCi:state.ci});
  if (state.result.error) throw new Error(state.result.error);
  state.rows = [];
  for (const [i, line] of state.text.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const p = line.trim().split(/\s*[,\t]\s*/);
    if (p.length < 5) throw new Error(`Line ${i+1}: need five columns`);
    const est = Number(p[3]), se = Number(p[4]);
    if ((!Number.isFinite(est) || !Number.isFinite(se)) && state.rows.length === 0 && i < 3 && /estimate|effect|^TE$/i.test(p[3])) continue;
    if (!Number.isFinite(est) || !Number.isFinite(se) || se <= 0 || p[1] === p[2]) throw new Error(`Line ${i+1}: invalid contrast; validation refused`);
    state.rows.push({study:p[0], t1:p[1], t2:p[2], est, se});
  }
  return state;
}
function quantities(state) {
  const a = state.result.analysis, model = state.model === 're' ? 'random' : 'common';
  const r = a.treatments.indexOf(state.result.ref), L = a[model];
  const rows = ['Q','tau2','I2','lowerI2','upperI2','pvalQ','df'].filter(k=>Number.isFinite(a[k])).map(k=>({key:k,label:k,value:a[k],r:({df:'df.Q',pvalQ:'pval.Q',lowerI2:'lower.I2',upperI2:'upper.I2'})[k]||k}));
  a.treatments.forEach((t,i)=>{
    if (i === r) return;
    for (const k of ['TE','seTE','lower','upper','pval']) {
      const exp = state.scale === 'exp' && ['TE','lower','upper'].includes(k);
      rows.push({key:`${k}_${i}`,label:`${t} versus ${state.result.ref}: ${k}${exp?' (exponentiated)':''}`,value:exp?Math.exp(L[k][i][r]):L[k][i][r], r:`${k}.${model}[${JSON.stringify(t)},${JSON.stringify(state.result.ref)}]`,exp});
    }
    rows.push({key:`pscore_${i}`,label:`${t}: P-score`,value:state.result.pscore[state.dir][state.model][t],r:`ranking.${model}[${JSON.stringify(t)}]`,rank:true});
    if (model === 'random' && a.predict) for (const k of ['lower','upper']) rows.push({key:`predict_${k}_${i}`,label:`${t}: prediction ${k}`,value:state.scale==='exp'?Math.exp(a.predict[k][i][r]):a.predict[k][i][r],r:`${k}.predict[${JSON.stringify(t)},${JSON.stringify(state.result.ref)}]`,exp:state.scale==='exp'});
  });
  return rows;
}
function buildScript(state) {
  const qs = quantities(state);
  const vector = (key, numeric=false) => 'c('+state.rows.map(r=>numeric?r[key].toPrecision(17):JSON.stringify(r[key])).join(',')+')';
  const assignments = qs.map(q=>`${JSON.stringify(q.key)} = ${q.exp?'exp(':''}${q.rank?'rank':'fit'}$${q.r}${q.exp?')':''}`).join(',\n');
  return `suppressPackageStartupMessages(library(netmeta))
# Browser netmeta 3.4-0; validated version in the paper: netmeta 3.7-0.
# App t2 - t1 corresponds to netmeta treat1 - treat2: swap treatment columns.
p <- data.frame(TE=${vector('est',true)}, seTE=${vector('se',true)}, treat1=${vector('t2')}, treat2=${vector('t1')}, studlab=${vector('study')})
fit <- netmeta(TE, seTE, treat1, treat2, studlab, data=p, sm="MD", common=TRUE, random=TRUE, method.tau="DL", prediction=TRUE, method.random.ci=${JSON.stringify(state.ci)}, reference.group=${JSON.stringify(state.result.ref)})
# Inputs are already on the analysis scale; MD prevents implicit exponentiation.
rank <- netrank(fit, small.values=${JSON.stringify(state.dir)})
values <- list(${assignments})
num <- function(x) { if (length(x)!=1L || !is.finite(x)) stop("Non-finite R comparison quantity"); sprintf("%.17g", x) }
body <- paste(paste0('"', names(values), '":', vapply(values, num, "")), collapse=",")
cat(paste0('ALMJSON:{', body, '}\\n'))
`;
}
const adapter = {
  app:'nma', paper:{title:'A browser tool for network meta-analysis, validated against R netmeta', doi:null, checks:410,
    repoUrl, runUrl:repoUrl+'/actions', codespacesUrl:'https://codespaces.new/mahmood726-cyber/nma-reproducible',
    packageVersions:{netmeta:'3.7-0'}, versions:{netmeta:'3.7-0'}},
  live:{packages:['netmeta'], currentState, buildScript, appValues:state=>quantities(state).map(({key,label,value})=>({key,label,value})),
    compare:{tolerance:{default:1e-6},kind:{}}, paperVersions:{netmeta:'3.7-0'},
    versionNote:'Browser netmeta 3.4-0; validated version in the paper: netmeta 3.7-0. Differences exceeding 1e-6 are FAIL; tolerances are not relaxed for version differences.'},
  corpus:{files:corpusFiles,run:runCorpus}
};
window.AlmNmaValidateAdapter = adapter;
const host = document.getElementById('alm-validate');
if (window.AlmValidate) {
  window.AlmValidate.mount(host, adapter);
  const note = document.createElement('p');
  note.textContent = adapter.live.versionNote;
  host.append(note);
}
else host.textContent = 'Validation framework unavailable. Browser R: netmeta 3.4-0; validated version in the paper: netmeta 3.7-0. Reproducible repository: '+repoUrl;

})();
