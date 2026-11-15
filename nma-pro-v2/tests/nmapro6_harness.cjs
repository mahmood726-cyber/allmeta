// Lane nmapro6. Runs nma-pro-v8.0.html's main inline script (and the WebR validation block) in a Node vm sandbox and
// prints what tests/test_nmapro6_modules.py compares with tests/nmapro6_r460.json (tests/nmapro6_reference.R):
//   blank   item 1: rows with no usable effect. Senn 2013 (TE / seTE) with a blank TE (Kipnes2001) or a blank SE
//           (Davidson2007), DL and FE; painkillers arm data as MD (complete, and with Pain-4's SD blank) DL / REML,
//           and as SMD with Pain-4's SD blank (which rows are used); importCSV of a TE / SE file with a blank TE
//   webr    item 2: webrPlan per estimator / correction, and the netmeta script the in-browser check runs
//           (`node nmapro6_harness.cjs --write-scripts` writes it to fixtures/nmapro6-webr/<case>.R, which
//           nmapro6_reference.R runs in R); compareResults of the page against that R output (read back from
//           nmapro6_r460.json when it exists)
//   kr      item 3: the label of the "kr" option in the select, the methods text and the het panel table
//   speed   item 4: calls of fitGLS / profileLikelihoodCI / nodeSplitting / pauleMandel_CI per analyze(), and the
//           exactness of the sparse LU / inverse / log-det paths against the dense ones (bitwise, incl. sign of 0)
// Usage: node nmapro6_harness.cjs [--write-scripts]   (PAGE=<path> runs another copy of the page)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(process.env.PAGE || path.join(root, 'nma-pro-v8.0.html'), 'utf8');
const noop = () => {};
const el = () => ({ textContent: '', value: '', innerHTML: '', style: {}, dataset: {}, checked: false,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], appendChild: noop, setAttribute: noop, getAttribute: () => null });
function sandbox() {
  const s = {
    console: { log: noop, warn: noop, info: noop, error: noop, debug: noop }, Math, Number, Array, Object, JSON, Date,
    Error, TypeError, RangeError, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, Map, Set, WeakMap, WeakSet,
    Promise, Symbol, Float64Array, Uint32Array, Int32Array, BigUint64Array, BigInt, setTimeout: noop, setInterval: noop,
    clearTimeout: noop, clearInterval: noop,
    document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: el,
      body: el(), documentElement: el(), addEventListener: noop, readyState: 'loading', currentScript: null },
    navigator: { userAgent: 'Node.js', clipboard: {} }, location: { hash: '', search: '', href: '' },
    history: { pushState: noop, replaceState: noop },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, CustomEvent: function () {},
    MutationObserver: function () { this.observe = noop; this.disconnect = noop; },
    matchMedia: () => ({ matches: false, addEventListener: noop }), requestAnimationFrame: noop,
    getComputedStyle: () => ({ getPropertyValue: () => '' }), Blob: function () {}, URL: { createObjectURL: () => '' },
    URLSearchParams, Intl: globalThis.Intl, TextEncoder, TextDecoder, performance: { now: () => 0 }
  };
  s.window = s; s.self = s; s.globalThis = s;
  return vm.createContext(s);
}
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
const main = blocks.find(m => m[1].includes('const Stats='));
if (!main) throw new Error('main inline script with const Stats= not found');
const ctx = sandbox();
for (const m of html.slice(0, main.index).matchAll(/<script src="\.\.\/shared\/([\w.-]+\.js)"[^>]*><\/script>/g)) {
  const f = path.join(root, '..', 'shared', m[1]);
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
vm.runInContext(main[1] + '\n;globalThis.__get = (n) => eval(n);', ctx, { filename: 'nma-pro-v8.0.html' });
const get = vm.runInContext('__get', ctx);
const webrBlock = blocks.find(m => m[1].includes('WebR Full Network Validation'));
let webrLoadError = null;
try { vm.runInContext(webrBlock[1], ctx, { filename: 'webr-block' }); } catch (e) { webrLoadError = String(e && e.message || e); }
const F = get('FrequentistNMA'), TR = get('TreatmentRanking'), M = get('Matrix');
const W = ctx.WebRValidation || null;
const safe = f => { try { return f(); } catch (e) { return { error: String(e && e.message || e), name: e && e.name }; } };

const readCsv = f => {
  const [head, ...rows] = fs.readFileSync(path.join(__dirname, f), 'utf8').trim().split(/\r?\n/);
  const h = head.split(',').map(x => x.replace(/"/g, ''));
  return rows.map(l => Object.fromEntries(l.split(',').map((v, i) => [h[i], v.replace(/"/g, '')])));
};
// table-shaped rows: every field present, blank = '' (what the data table and importCSV store)
const senn = () => readCsv('fixtures/nmapro3-senn2013-full.csv').map(r => ({ name: r.study, treatment1: r.treat1,
  treatment2: r.treat2, yi: +r.yi, se: +r.sei, vi: (+r.sei) ** 2, events1: '', n1: '', events2: '', n2: '' }));
const pain = () => readCsv('fixtures/nmapro6-painkillers-arms.csv').map(r => ({ name: r.study, treatment1: r.treat1,
  mean1: +r.mean1, sd1: +r.sd1, n1: +r.n1, treatment2: r.treat2, mean2: +r.mean2, sd2: +r.sd2, n2: +r.n2,
  events1: '', events2: '', yi: '', se: '', vi: '' }));
const vsRef = r => Object.fromEntries(r.treatments.slice(1).map(t => [t, { TE: r.effects.effects[t].estimate,
  seTE: r.effects.effects[t].se }]));
const fit = (studies, o) => safe(() => { const r = F.analyze(studies, { predictionIntervals: true, ...o });
  return { tau2: r.tau2, Q: r.heterogeneity.Q, k: r.processed.length, notComputable: r.notComputable,
    notComputableDetail: r.notComputableDetail, effects: vsRef(r) }; });
const out = { webrLoadError };

// ---------------------------------------------------------------- item 1
out.blank = {};
{
  const sTE = senn(); sTE.find(r => r.name === 'Kipnes2001').yi = '';
  const sSE = senn(); Object.assign(sSE.find(r => r.name === 'Davidson2007'), { se: '', vi: '' });
  for (const est of ['DL', 'FE']) {
    const o = { reference: 'plac', effectMeasure: 'MD', estimator: est, smallStudyCorrection: 'none' };
    out.blank['senn_blankTE_' + est] = fit(sTE, o);
    out.blank['senn_blankSE_' + est] = fit(sSE, o);
  }
  const pB = pain(); pB.find(r => r.name === 'Pain-4').sd1 = '';
  for (const est of ['DL', 'REML']) {
    const o = { reference: 'Placebo', effectMeasure: 'MD', estimator: est, smallStudyCorrection: 'none' };
    out.blank['pain_MD_' + est] = fit(pain(), o);
    out.blank['pain_MD_blankSD_' + est] = fit(pB, o);
  }
  out.blank.pain_SMD_blankSD = fit(pB, { reference: 'Placebo', effectMeasure: 'SMD', estimator: 'DL', smallStudyCorrection: 'none' });
  // the row-level effects (calcEffects) of the blanked rows, and a blank mean
  const pM = pain(); pM.find(r => r.name === 'Pain-2').mean2 = '';
  out.blank.rows = {
    md_blank_sd: safe(() => { const x = F.calcEffects([pB.find(r => r.name === 'Pain-4')], 'MD')[0]; return { yi: x.yi, vi: x.vi, why: x.notComputableReason ?? null }; }),
    smd_blank_sd: safe(() => { const x = F.calcEffects([pB.find(r => r.name === 'Pain-4')], 'SMD')[0]; return { yi: x.yi, vi: x.vi, why: x.notComputableReason ?? null }; }),
    smd_blank_mean: safe(() => { const x = F.calcEffects([pM.find(r => r.name === 'Pain-2')], 'SMD')[0]; return { yi: x.yi, vi: x.vi, why: x.notComputableReason ?? null }; }),
    te_blank: safe(() => { const x = F.calcEffects([sTE.find(r => r.name === 'Kipnes2001')], 'MD')[0]; return { yi: x.yi, vi: x.vi, why: x.notComputableReason ?? null }; })
  };
  const csv = 'Study,Treatment1,Treatment2,yi,se\nA,t1,t2,0.5,0.2\nB,t1,t3,,0.3\nC,t2,t3,0.1,0.25\nD,t1,t2,0.4,0.3\n';
  out.blank.import = safe(() => { const r = get('importCSV')(csv); const b = r.studies.find(s => s.name === 'B');
    return { n: r.studies.length, B_yi: b ? b.yi : 'absent', errors: r.errors, dropped: (r.dropped || []).length }; });
  out.blank.notice = /id="droppedRowsNotice"/.test(html) && /function renderDroppedRowsNotice/.test(html);
}

// ---------------------------------------------------------------- item 2
out.webr = { available: !!(W && W.plan && W.buildNetmetaCode && W.compareResults) };
const webrCases = {
  senn_PM_hksj: [senn(), { reference: 'plac', effectMeasure: 'MD', estimator: 'PM', smallStudyCorrection: 'hksj' }],
  senn_PM_none: [senn(), { reference: 'plac', effectMeasure: 'MD', estimator: 'PM', smallStudyCorrection: 'none' }],
  senn_REML_none: [senn(), { reference: 'plac', effectMeasure: 'MD', estimator: 'REML', smallStudyCorrection: 'none' }],
  senn_DL_hksj: [senn(), { reference: 'plac', effectMeasure: 'MD', estimator: 'DL', smallStudyCorrection: 'hksj' }],
  senn_ML_hksj: [senn(), { reference: 'plac', effectMeasure: 'MD', estimator: 'ML', smallStudyCorrection: 'hksj' }],
  pain_MD_REML_none: [pain(), { reference: 'Placebo', effectMeasure: 'MD', estimator: 'REML', smallStudyCorrection: 'none' }],
  senn_FE: [senn(), { reference: 'plac', effectMeasure: 'MD', estimator: 'FE', smallStudyCorrection: 'none' }]
};
const rRefPath = path.join(__dirname, 'nmapro6_r460.json');
const rRef = fs.existsSync(rRefPath) ? JSON.parse(fs.readFileSync(rRefPath, 'utf8')) : null;
if (out.webr.available) {
  out.webr.cases = {};
  const AS = get('AppState');
  for (const [nm, [st, o]] of Object.entries(webrCases)) {
    out.webr.cases[nm] = safe(() => {
      const res = F.analyze(st, { predictionIntervals: true, ...o });
      const valid = res.processed.filter(s => Number.isFinite(s.yi) && Number.isFinite(s.vi) && s.vi > 0);
      const by = new Map(); valid.forEach(s => { const id = String(s.name); if (!by.has(id)) by.set(id, new Set()); by.get(id).add([s.treatment1, s.treatment2].sort().join('|')); });
      const plan = W.plan({ estimator: o.estimator, correction: res.effects.correctionMethod, multiArm: [...by.values()].some(x => x.size > 1), tau2: res.tau2 });
      const code = W.buildNetmetaCode(valid, { ref: o.reference, em: o.effectMeasure, plan, confLevel: 0.95, smallValues: 'desirable',
        smallValuesFallback: 'good', rCommon: o.estimator === 'FE' ? 'TRUE' : 'FALSE', hksjArg: '', rMethodTau: o.estimator === 'DL' ? 'DL' : o.estimator === 'ML' ? 'ML' : 'REML', estimatorJS: o.estimator });
      const script = code.replace(/^\s*\n/, '') + '\n';
      let compare = null;
      const rd = rRef && rRef.webr && rRef.webr[nm];
      const cf = res.effects.correctionFactor;
      if (rd && !rd.error) {
        AS.ranking = TR.rank(res.effects.effects ? res.effects : res.effects, res.treatments, 'lower', { seed: 1, nSim: 400 });
        const c = W.compareResults(res, rd, o.reference, o.effectMeasure, false, plan, 'lower');
        compare = { passed: c.passed, failed: c.failed, total: c.total, notes: c.notes,
          names: c.checks.map(x => x.name), failing: c.checks.filter(x => !x.pass).map(x => [x.name, x.jsVal, x.rVal]) };
      }
      return { plan: { tauArg: plan.tauArg, ownArg: plan.ownArg, tau2Check: plan.tau2Check, uncorrected: plan.uncorrected,
        skipCI: plan.skipCI, skipPI: plan.skipPI, notes: plan.notes }, tau2: res.tau2, correctionFactor: cf, script, compare };
    });
  }
  if (process.argv.includes('--write-scripts')) {
    const dir = path.join(__dirname, 'fixtures', 'nmapro6-webr'); fs.mkdirSync(dir, { recursive: true });
    for (const [nm, c] of Object.entries(out.webr.cases)) if (c.script) fs.writeFileSync(path.join(dir, nm + '.R'), c.script);
  }
}

// ---------------------------------------------------------------- item 3
{
  const opt = (html.match(/<option value="kr"[^>]*>([^<]*)<\/option>/) || [])[1] || null;
  const L = safe(() => get('CORRECTION_LABELS'));
  out.kr = { option: opt, label: L && L.kr, long: safe(() => get('CORRECTION_LONG').kr),
    claimsKR: /Kenward-Roger \(KR\)|kr:'Kenward-Roger'|>Kenward-Roger</.test(html),
    rscript: safe(() => { const st = senn(); const r = F.analyze(st, { reference: 'plac', effectMeasure: 'MD', estimator: 'DL', smallStudyCorrection: 'kr' });
      return get('RScriptBuilder').build(st, { reference: 'plac', effectMeasure: 'MD', estimator: 'DL', smallStudyCorrection: 'kr', tau2: r.tau2 }).code.split('\n').slice(0, 4).join('\n'); }) };
}

// ---------------------------------------------------------------- item 4
{
  const names = ['fitGLS', 'profileLikelihoodCI', 'nodeSplitting', 'pauleMandel_CI', 'estimateTau2'];
  const cnt = {}; const orig = {};
  for (const n of names) { orig[n] = F[n]; cnt[n] = 0; F[n] = function (...a) { cnt[n]++; return orig[n].apply(this, a); }; }
  const st = senn();
  const r = F.analyze(st, { reference: 'plac', effectMeasure: 'MD', estimator: 'REML', smallStudyCorrection: 'hksj', predictionIntervals: false });
  const atAnalyze = { ...cnt };
  // lazily computed fields equal the functions run eagerly on the same arguments
  const eager = { consistency: orig.nodeSplitting.call(F, r.processed, r.matrices, r.tau2),
    tau2CI: orig.profileLikelihoodCI.call(F, r.matrices, r.tau2, 'REML'), pmCI: orig.pauleMandel_CI.call(F, r.matrices, r.tau2) };
  for (const n of names) F[n] = orig[n];
  const keys = Object.keys(r);
  out.speed = { atAnalyze, keys,
    lazyEqualsEager: JSON.stringify(r.consistency) === JSON.stringify(eager.consistency) && JSON.stringify(r.tau2CI) === JSON.stringify(eager.tau2CI) && JSON.stringify(r.pmCI) === JSON.stringify(eager.pmCI) };
  // exactness of the sparse paths, bitwise (Object.is: also the sign of every zero)
  const same = (A, B) => A.length === B.length && A.every((row, i) => row.every((v, j) => Object.is(v, B[i][j])));
  const rng = TR.createSeededRNG(20261115);
  const cases = [];
  for (const mx of [r.matrices]) for (const t2 of [0, 0.01, 0.1, 1]) cases.push(F.fitGLS(mx, t2).Sigma);
  for (let c = 0; c < 40; c++) { // random block-sparse SPD matrices with permuted rows, some with negative entries
    const n = 3 + Math.floor(rng.random() * 14), A = M.zeros(n, n), perm = [...Array(n).keys()].sort(() => rng.random() - 0.5);
    for (let i = 0; i < n; i++) A[i][i] = 0.5 + rng.random();
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) if (rng.random() < 0.25) { const v = (rng.random() - 0.5) * 0.4; A[i][j] = v; A[j][i] = v; }
    cases.push(perm.map(i => perm.map(j => A[i][j])));
    if (c % 5 === 0) cases.push(A.map(row => row.map(v => -v))); // negative definite: pivots < 0
  }
  let luSame = 0, invSame = 0, ldetSame = 0, exactUsed = 0;
  const ldetSrc = (main[1].match(/const ldetDense=M=>\{[\s\S]*?return s\};\nconst ldet=M=>\{[\s\S]*?return s\};/) || [])[0];
  const LD = ldetSrc ? vm.runInContext('(()=>{' + ldetSrc + ';return {ldet, ldetDense};})()', ctx) : null;
  for (const A of cases) {
    const a = safe(() => M._lu(A, false)), b = safe(() => M.lu(A));
    if (!a.error && !b.error && same(a.L, b.L) && same(a.U, b.U) && same(a.P, b.P)) luSame++;
    else if (a.error && b.error && a.error === b.error) luSame++;
    if (b.exact) exactUsed++;
    const dense = safe(() => { const { L, U, P } = M._lu(A, false), n = A.length, inv = M.zeros(n, n);
      for (let j = 0; j < n; j++) { const y = Array(n).fill(0); for (let i = 0; i < n; i++) { y[i] = P[i][j]; for (let k = 0; k < i; k++) y[i] -= L[i][k] * y[k]; }
        const x = Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { x[i] = y[i]; for (let k = i + 1; k < n; k++) x[i] -= U[i][k] * x[k]; x[i] /= U[i][i]; }
        for (let i = 0; i < n; i++) inv[i][j] = x[i]; } return inv; });
    const fast = safe(() => M.inverse(A));
    if ((dense.error && fast.error) || (!dense.error && !fast.error && same(dense, fast))) invSame++;
    if (LD && Object.is(LD.ldet(A), LD.ldetDense(A))) ldetSame++;
  }
  out.speed.exact = { n: cases.length, luSame, invSame, ldetSame, exactUsed, ldetFound: !!LD };
}
process.stdout.write(JSON.stringify(out, (k, v) => (typeof v === 'number' && !Number.isFinite(v)) ? String(v) : v));
