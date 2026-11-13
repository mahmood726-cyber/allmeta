'use strict';
// More > Fragility Index must say what it computes.
// Root cause (e17f9f6f): calculateFragilityIndex does not change events. For each study it moves the study's
// estimate (log HR / log OR / mean difference) in steps of 0.05, re-pools with a fixed-effect inverse-variance
// z-test (recalculatePooledSimple), and records the first step at which that verdict (p < 0.05) differs from the
// main analysis'. The modal said "how many events would need to change" and "If N event(s) in <study> had different
// outcomes", and its Events column showed round(0.3 n) whenever a study had no event count (every continuous study,
// and any study with 0 events). The wording now describes the shift, the scale, the re-pool and the comparison; the
// Events column shows the real count or says there is none; and when the unshifted fixed-effect re-pool already
// disagrees with the main analysis, the modal says so. The search itself is unchanged: this test recomputes it
// independently and requires the same indices.
//   node dev/tests/fragility_wording.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 400) + ']')); };
// erfc(x), Numerical Recipes erfcc (fractional error < 1.2e-7); two-sided normal p = erfc(|z| / sqrt 2). Only verdicts at
// p < 0.05 are compared, so this accuracy is ample.
const erfc = (x) => { const t = 1 / (1 + 0.5 * x); return t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); };
const p2 = (z) => erfc(Math.abs(z) / Math.SQRT2);
const fePool = (st) => { const w = st.map(s => 1 / (s.se * s.se)), W = w.reduce((a, b) => a + b, 0); const m = st.reduce((a, s, i) => a + w[i] * s.effect, 0) / W; return p2(m / Math.sqrt(1 / W)); };
const expected = (st, pooled, mainP) => { const sig = mainP < 0.05, dir = pooled > 0 ? -1 : 1; return st.map(s => { for (let c = 1; c <= 50; c++) { const mod = st.map(x => x.study === s.study ? Object.assign({}, x, { effect: x.effect + dir * c * 0.05 }) : x); if ((fePool(mod) < 0.05) !== sig) return c; } return 0; }); };

run(`window.__m = []; document.body.appendChild = function (m) { __m.push(String(m.innerHTML)); return m; };
  showLoadingOverlay = function () {}; hideLoadingOverlay = function () {}; setTimeout = function (f) { f(); return 0; };
  showNotification = function () {};`);
const scenarios = {
  // continuous, main analysis significant, the fixed-effect re-pool agrees; no event counts
  continuous: { type: 'continuous', pooled: 1.2, p: 0.004, studies: [{ study: 'A', effect: 1.5, se: 0.6, n: 40, events: 0 }, { study: 'B', effect: 0.9, se: 0.5, n: 60, events: 0 }, { study: 'C', effect: 1.3, se: 0.7, n: 36, events: 0 }] },
  // time-to-event, main analysis NOT significant (e.g. random effects) while the fixed-effect re-pool is
  survival: { type: 'survival', pooled: -0.226, p: 0.067, studies: [{ study: 'K1', effect: -0.52, se: 0.30, n: 46, events: 20 }, { study: 'K2', effect: -0.12, se: 0.21, n: 191, events: 93 }, { study: 'K3', effect: -0.47, se: 0.30, n: 155, events: 0 }] }
};
for (const name of Object.keys(scenarios)) {
  const sc = scenarios[name];
  sandbox.__sc = sc;
  run(`__m.length = 0; APP.config.outcomeType = __sc.type; APP.results = { studies: __sc.studies, pooled: { pooled: __sc.pooled, pValue: __sc.p } }; calculateFragilityIndex();`);
  const html = run('__m.join("")');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' ');
  const exp = expected(sc.studies, sc.pooled, sc.p);
  const rowsShown = sc.studies.map(s => { const m = text.match(new RegExp(s.study + '(?: \\(most fragile\\))? ' + s.n + ' (\\S+(?: \\S+)*?) (\\d+|>50)(?= |$)')); return m ? m[2] : null; });
  check(name + ': indices unchanged = independent recomputation of the 0.05-step search ' + JSON.stringify(exp.map(e => e || '>50')), JSON.stringify(rowsShown) === JSON.stringify(exp.map(e => e ? String(e) : '>50')), JSON.stringify(rowsShown) + ' | ' + text.slice(0, 300));
  check(name + ': no claim that events are changed', !/event\(s\) in|how many events would need/i.test(text) && /No events are changed/.test(text), text.slice(0, 400));
  check(name + ': says what moves, by how much, on which scale, and against what', /steps of 0\.05/.test(text) && new RegExp(sc.type === 'survival' ? 'log hazard ratio' : 'mean difference').test(text) && /fixed-effect inverse-variance/.test(text) && /main analysis \(p (=|<) /.test(text), text.slice(0, 500));
  check(name + ': the Events column shows no invented counts (it showed round(0.3 n))', !sc.studies.some(s => (s.events === 0 && name === 'continuous') ? new RegExp(s.study + '(?: \\(most fragile\\))? ' + s.n + ' ' + Math.round(s.n * 0.3) + ' ').test(text) : false) &&
    (name === 'continuous' ? /n\/a \(continuous outcome\)/.test(text) : new RegExp('K3(?: \\(most fragile\\))? 155 0 ').test(text)), text.slice(0, 600));
}
{
  const t = run('__m.join("")').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  check('survival: the modal says the unshifted fixed-effect re-pool already disagrees with the main analysis', /already gives p (=|<) /.test(t), t.slice(0, 600));
  sandbox.__sc = scenarios.continuous;
  run(`__m.length = 0; APP.config.outcomeType = __sc.type; APP.results = { studies: __sc.studies, pooled: { pooled: __sc.pooled, pValue: __sc.p } }; calculateFragilityIndex();`);
  const t2 = run('__m.join("")').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  check('continuous: no such note when the re-pool agrees', !/already gives p (=|<) /.test(t2), t2.slice(0, 300));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
