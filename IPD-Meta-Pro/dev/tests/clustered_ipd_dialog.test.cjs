'use strict';
// Found by the modal sweep: More > Clustered IPD > "Run Analysis" with the dialog's default selections threw an
// uncaught "Failed to execute 'createLinearGradient' on 'CanvasRenderingContext2D': The provided double value is
// non-finite" (every example, k = 1, 2 and all studies).
// Root cause: getVariableOptions() built the outcome, treatment and cluster <select>s without a selected option, so
// all three defaulted to the first data column (study_id). calculateICC then read parseFloat(study id) = NaN, and
// drawICCPlot drew a bar of height NaN * 200. Two defects: (1) the dialog now preselects the configured outcome,
// treatment and study variables; (2) the ICC plot and the ICC / design-effect / effective-N cells say "not
// estimable" for a non-finite ICC (e.g. one cluster) instead of throwing or printing NaN.
//   node dev/tests/clustered_ipd_dialog.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 300) + ']')); };

sandbox.__rows = [{ study_id: 'A', patient_id: 1, treatment: 1, time_months: 3, event: 1 }, { study_id: 'A', patient_id: 2, treatment: 0, time_months: 5, event: 0 }];
run('APP.currentData = __rows; APP.data = __rows;');
{
  let html = '';
  try { html = run('getVariableOptions("event")'); } catch (e) { html = 'THREW ' + e; }
  check('variable options preselect the requested column', /<option value="event" selected>/.test(html) && !/<option value="study_id" selected>/.test(html), html);
  const plain = run('getVariableOptions()');
  check('without a preference nothing is forced (first column, as before)', !/selected/.test(plain), plain);
}
{
  // a canvas whose 2D context rejects non-finite coordinates, as Chrome does
  const calls = [];
  const bad = (a) => a.some(v => typeof v === 'number' && !Number.isFinite(v));
  const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : (...a) => { calls.push(String(p)); if (bad(a)) throw new TypeError("Failed to execute '" + String(p) + "': The provided double value is non-finite."); return { addColorStop() {} }; }), set: (t, p, v) => { t[p] = v; return true; } });
  sandbox.__canvas = { width: 300, height: 300, getContext: () => ctx };
  run('(function(){ const g = document.getElementById; document.getElementById = function (id) { return id === "iccPlot" ? __canvas : g(id); }; })()');
  let err = null;
  try { run('drawICCPlot({ ICC: NaN, n_clusters: 1, n_total: 46, design_effect: NaN })'); } catch (e) { err = String(e); }
  check('ICC plot with a non-finite ICC does not throw', err === null, err);
  let err2 = null;
  try { run('drawICCPlot({ ICC: 0.12, CI_lower: 0.05, CI_upper: 0.2, n_clusters: 12, n_total: 1098, design_effect: 11.9 })'); } catch (e) { err2 = String(e); }
  check('ICC plot with a finite ICC still draws the bar', err2 === null && calls.includes('createLinearGradient'), err2 + ' ' + calls.join(','));
}
{
  const res = { method: 'Two-stage', pooled_effect: -0.2, SE: 0.1, CI_lower: -0.4, CI_upper: 0, p_value: 0.05 };
  sandbox.__res = res;
  let html;
  try { html = run('formatClusteredIPDResults(__res, { ICC: NaN, n_clusters: 1, n_total: 46, avg_cluster_size: 46, design_effect: NaN })'); } catch (e) { html = 'THREW ' + e; }
  check('results card with a non-finite ICC says not estimable, no NaN', !/NaN|THREW/.test(html) && /not estimable/.test(html), html.slice(html.indexOf('ICC'), html.indexOf('ICC') + 300));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
