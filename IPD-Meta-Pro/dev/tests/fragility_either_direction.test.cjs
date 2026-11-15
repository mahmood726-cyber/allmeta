'use strict';
// More > Fragility Index: the shift-based index is the smallest single-study shift, in EITHER direction, that changes
// the verdict at p < 0.05.
// Root cause (a46d1da2, rrev60 F3): calculateFragilityIndex moved each study only towards the side opposite to the
// pooled estimate's sign (direction = pooled > 0 ? -1 : 1). That can make a significant result lose significance,
// but a non-significant result usually becomes significant when a study moves AWAY from the null: fixed effect,
// y = -0.30 / -0.20 / -0.25 (v = 0.0625), p = 0.083 -- S1 moved by -0.10 gives p = 0.0496, while the page reported an
// index of 32 (a shift of +1.60, through the null and out the other side). The R reference had copied the same rule;
// it is now written from the definition (fragility_same_model_reference.R: both directions at every step).
//   node dev/tests/fragility_either_direction.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const ref = require('./fragility_same_model_reference.json');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 500) + ']')); };
run(`window.__m = []; document.body.appendChild = function (m) { __m.push(String(m.innerHTML)); return m; };
  showLoadingOverlay = function () {}; hideLoadingOverlay = function () {}; setTimeout = function (f) { f(); return 0; };
  window.__notes = []; showNotification = function (m, t) { __notes.push(t + ': ' + m); };`);
const text = () => run('__m.join("")').replace(/<[^>]+>/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&minus;/g, '-').replace(/&plusmn;/g, '+-').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ');
for (const name of ['D', 'A', 'C', 'B']) {
  const sc = ref[name];
  sandbox.__st = sc.rows.map(r => ({ study: r.study, effect: r.yi, variance: r.vi, se: Math.sqrt(r.vi), n: r.n, events: r.events }));
  sandbox.__set = { reMethod: sc.method, useHKSJ: sc.hksj, outcomeType: 'survival', confLevel: 0.95 };
  sandbox.__pooled = { pooled: sc.main.pooled, pValue: sc.main.p };
  run(`__m.length = 0; __notes.length = 0; APP.config.outcomeType = 'survival'; APP.analysisSettings = __set; APP.results = { studies: __st, pooled: __pooled }; calculateFragilityIndex();`);
  const t = text();
  const rows = sc.rows.map(r => { const m = t.match(new RegExp(r.study + '(?: \\(most fragile\\))? ' + r.n + ' \\S+ (\\d+|>50) (\\S+)')); return m ? [m[1], m[2]] : null; });
  const want = sc.index.map((i, j) => [i ? String(i) : '>50', i ? ((sc.dir[j] === 0 ? '+-' : sc.dir[j] === -1 ? '-' : '+') + (i * 0.05).toFixed(2)) : 'none']);
  const label = name + ' (' + sc.method + (sc.hksj ? ' + HKSJ' : '') + ', main p ' + sc.main.p.toPrecision(4) + ')';
  check(label + ': index and direction of every study = R (definition, both directions) ' + JSON.stringify(want), JSON.stringify(rows) === JSON.stringify(want), JSON.stringify(rows) + ' | ' + run('__notes.join(" | ")') + ' | ' + t.slice(0, 300));
  check(label + ': the modal says the study is moved both ways', /moved upwards and downwards/.test(t) && /in either direction/.test(t), t.slice(0, 600));
}
{
  // the rrev60 example itself: S1 moved by -0.10 makes the fixed-effect result significant
  run(`__m.length = 0; APP.analysisSettings = { reMethod: 'FE', useHKSJ: false }; APP.results = { studies: [{ study: 'S1', effect: -0.30, variance: 0.0625, se: 0.25, n: 100 }, { study: 'S2', effect: -0.20, variance: 0.0625, se: 0.25, n: 100 }, { study: 'S3', effect: -0.25, variance: 0.0625, se: 0.25, n: 100 }], pooled: { pooled: -0.25, pValue: ipdRepoolLikeMain([{ effect: -0.30, variance: 0.0625 }, { effect: -0.20, variance: 0.0625 }, { effect: -0.25, variance: 0.0625 }], { reMethod: 'FE', useHKSJ: false }).pValue } }; calculateFragilityIndex();`);
  const t2 = text();
  check('rrev60 example (FE, p = 0.083): overall index 2, S1 moved downwards by 2 steps (-0.10) gains significance', /Overall Fragility Index \(shift-based\) 2 /.test(t2) && /Moving the log hazard ratio of S1 downwards \(towards lower values\) by 2 steps of 0\.05 \(a shift of 0\.10\) makes the re-pool gain statistical significance/.test(t2), t2.slice(0, 900));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
