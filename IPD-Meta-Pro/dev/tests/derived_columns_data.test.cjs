'use strict';
// Outcome-derived columns must be recognised FROM THE DATA, not only while a bundled example's fingerprint holds.
// Root cause (a46d1da2, rrev60 F1): ipdOutcomeDerivedColumns knew the depression examples' derived columns only through
// APP.declaredOutcome.outcomeFamily, valid while the exact example data is loaded. Its data checks looked at ONE column
// against the outcome (|r| = 1, or a 0/1 threshold either way), so a column that is a function of the outcome TOGETHER
// WITH another column was missed: uploaded as a CSV (no declaration), with outcome hamd_change it excluded nothing
// (hamd_endpoint = hamd_baseline - hamd_change; remission = hamd_endpoint <= 7; response_50pct = hamd_change /
// hamd_baseline >= 0.5) and "Best Predictor of Benefit" was remission; with outcome remission only hamd_endpoint went.
// Requirement: a column is outcome-derived when an EXACT relationship ties it to the outcome or to a column already
// found derived -- alone (monotone function / threshold, either way) or together with one other column (exact affine
// relation; 0/1 column linearly separated); when such a relation ties two candidate columns symmetrically
// (change = baseline - endpoint), the one the treatment changes is derived and the one it does not (the baseline
// measurement) is kept; when the data cannot tell, both are left out and the reason says so. No unrelated covariate
// may be excluded: checked on all 9 examples (as uploads: CSV round trip, no declaration) and for every covariate
// tried as the outcome.
//   node dev/tests/derived_columns_data.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 500) + ']')); };
run(`setTimeout = function (f) { f(); return 0; }; showNotification = function () {};`);

// load an example with a fixed seed, then "upload" it: CSV text -> parseDelimited, no declaration
const upload = (type, seed) => {
  sandbox.__type = type; sandbox.__seed = seed;
  run(`SeededRNG.patchMathRandom(__seed); try { loadExampleData(__type); } finally { SeededRNG.restoreMathRandom(); }
    (function () { const rows = APP.data, keys = Object.keys(rows[0]);
      const txt = [keys.join(',')].concat(rows.map(r => keys.map(k => r[k] == null ? '' : String(r[k])).join(','))).join('\\n');
      APP.data = parseDelimited(txt).data; APP.currentData = APP.data; APP.declaredOutcome = null; })();`);
};
const derived = (y, type, extra) => {
  sandbox.__cfg = Object.assign({ studyVar: 'study_id', treatmentVar: 'treatment', eventVar: y, outcomeType: type }, extra || {});
  return run(`ipdOutcomeDerivedColumns(APP.data, __cfg).excluded`);
};
const names = (ex) => ex.map(x => x.name).sort().join(',');

const FAMILY = { continuous: ['hamd_endpoint', 'hamd_change', 'remission', 'response_50pct'], network_antidepressants: ['hamd_endpoint', 'hamd_change', 'remission'] };
const EXAMPLES = ['survival', 'binary', 'continuous', 'ovarian_survival', 'breast_endocrine', 'network_antidepressants', 'statin_cvd', 'hiv_survival', 'covid_treatments'];
const TIME = { survival: 'time_months', ovarian_survival: 'time_months', breast_endocrine: 'time_months', hiv_survival: 'time_months' };
const CONFIGURED = { survival: 'event', ovarian_survival: 'event', breast_endocrine: 'event', hiv_survival: 'event', binary: 'mace_event', statin_cvd: 'mace_event', covid_treatments: 'mortality_28d' };

for (const seed of [11, 12, 13]) {
  for (const ex of EXAMPLES) {
    upload(ex, seed);
    const r0 = run('APP.data[0]');
    const extra = TIME[ex] ? { timeVar: TIME[ex] } : {};
    const isBin = (c) => run(`APP.data.every(d => d['${c}'] === 0 || d['${c}'] === 1)`);
    const numeric = Object.keys(r0).filter(k => typeof r0[k] === 'number' && !['treatment', 'study_id', TIME[ex]].includes(k));
    const fam = FAMILY[ex];
    if (fam) {
      // every member of the outcome family as the outcome: all other members are derived, real covariates are kept
      for (const y of fam) {
        const ex1 = derived(y, isBin(y) ? 'binary' : 'continuous', extra);
        const want = fam.filter(c => c !== y).sort().join(',');
        const got = names(ex1);
        const others = ex1.filter(x => !fam.includes(x.name));
        check(`${ex} s${seed} outcome ${y}: every other outcome-family column excluded (${want})`, fam.filter(c => c !== y).every(c => ex1.some(x => x.name === c)), got);
        // hamd_baseline is in an exact relation with the family (change = baseline - endpoint): it may only be left
        // out when the data cannot tell which column is the baseline measurement, and then the reason must say so
        const badOthers = others.filter(x => !(x.name === 'hamd_baseline' && /cannot tell/.test(x.reason)));
        check(`${ex} s${seed} outcome ${y}: no other column excluded (hamd_baseline only as "cannot tell")`, badOthers.length === 0, JSON.stringify(others));
        if (ex === 'continuous') check(`${ex} s${seed} outcome ${y}: hamd_baseline kept (the treatment changes hamd_endpoint / hamd_change, not hamd_baseline)`, !ex1.some(x => x.name === 'hamd_baseline'), JSON.stringify(others));
      }
    } else {
      const y = CONFIGURED[ex];
      const ex1 = derived(y, 'binary', extra);
      check(`${ex} s${seed} configured outcome ${y}: nothing excluded`, ex1.length === 0, JSON.stringify(ex1));
    }
    // every real covariate tried as the outcome: nothing is derived from it
    const realCovs = numeric.filter(c => !(fam || []).includes(c) && c !== 'hamd_baseline' && c !== CONFIGURED[ex]);
    const fp = [];
    for (const y of realCovs) { const e1 = derived(y, isBin(y) ? 'binary' : 'continuous', extra); if (e1.length) fp.push(y + ' -> ' + names(e1)); }
    check(`${ex} s${seed}: no column is "derived" from any real covariate used as the outcome (${realCovs.length} tried)`, fp.length === 0, fp.join(' | '));
  }
}

// synthetic upload: the data cannot tell which of two columns is the baseline measurement (no treatment effect) ->
// both are left out and the reason says why; a column with the outcome's missingness pattern is the derived one
{
  let s = 5; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const rows = [];
  for (let i = 0; i < 400; i++) {
    const trt = (i >> 1) % 2, base = 15 + Math.round(rnd() * 15), age = 30 + Math.round(rnd() * 40);
    const chg = Math.round((rnd() - 0.5) * 120) / 10; // no treatment effect
    const missing = i % 17 === 3;
    rows.push({ study_id: 'S' + (i % 5), treatment: trt, base: base, age: age, chg: missing ? null : chg, chgAll: chg, post: missing ? null : Math.round((base - chg) * 10) / 10, post2: Math.round((base - chg) * 10) / 10 });
  }
  sandbox.__rows = rows;
  run(`APP.data = __rows.map(r => { const o = Object.assign({}, r); delete o.chgAll; return o; }); APP.declaredOutcome = null;`);
  const e1 = derived('chg', 'continuous');
  check('synthetic: post (same missingness as the outcome) excluded, base kept', e1.some(x => x.name === 'post') && !e1.some(x => x.name === 'base'), JSON.stringify(e1));
  check('synthetic: age never excluded', !e1.some(x => x.name === 'age'), JSON.stringify(e1));
  check('synthetic: post2 (complete, no treatment effect) excluded', e1.some(x => x.name === 'post2'), JSON.stringify(e1));
  run(`APP.data = __rows.map(r => ({ study_id: r.study_id, treatment: r.treatment, base: r.base, age: r.age, chg: r.chgAll, post2: r.post2 }));`);
  const e2 = derived('chg', 'continuous');
  check('synthetic, complete data, no treatment effect: base and post2 both excluded and the reason says the data cannot tell',
    e2.some(x => x.name === 'post2') && e2.some(x => x.name === 'base' && /cannot tell/.test(x.reason)) && !e2.some(x => x.name === 'age'), JSON.stringify(e2));
}
// agy #569 finding 1: step (b) (a 0/1 column linearly separated by (d, w)) must not decide a relation that is an exact
// 3-column affine relation between the 0/1 column and w: then it is symmetric (y = score + 10 flag says that ONE of
// score, flag carries the outcome) and the treatment / missingness rule decides, as for change = baseline - endpoint.
// Also a 0/1 component of an outcome that is a sum of two 0/1 components is not dropped alone.
{
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const rowsA = [], rowsB = [];
  for (let i = 0; i < 400; i++) {
    const trt = (i >> 1) % 2, flag = rnd() < 0.4 ? 1 : 0, age = 30 + Math.round(rnd() * 40);
    const score = 20 + Math.round(rnd() * 10) - 6 * trt; // changed by the treatment
    rowsA.push({ study_id: 'S' + (i % 5), treatment: trt, flag: flag, age: age, score: score, total: score + 10 * flag });
    const stroke = rnd() < (trt ? 0.15 : 0.35) ? 1 : 0, mi = rnd() < (trt ? 0.15 : 0.35) ? 1 : 0;
    rowsB.push({ study_id: 'S' + (i % 5), treatment: trt, age: age, stroke: stroke, mi: mi, events: stroke + mi });
  }
  sandbox.__rows = rowsA;
  run(`APP.data = __rows; APP.declaredOutcome = null;`);
  const a = derived('total', 'continuous');
  check('3-column relation with a 0/1 member (total = score + 10 flag): score (changed by the treatment) excluded, the baseline 0/1 flag kept, age kept',
    a.some(x => x.name === 'score') && !a.some(x => x.name === 'flag') && !a.some(x => x.name === 'age'), JSON.stringify(a));
  sandbox.__rows = rowsB;
  run(`APP.data = __rows; APP.declaredOutcome = null;`);
  const b = derived('events', 'continuous');
  check('outcome = sum of two 0/1 components (events = stroke + mi): both components excluded, age kept',
    b.some(x => x.name === 'stroke') && b.some(x => x.name === 'mi') && !b.some(x => x.name === 'age'), JSON.stringify(b));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
