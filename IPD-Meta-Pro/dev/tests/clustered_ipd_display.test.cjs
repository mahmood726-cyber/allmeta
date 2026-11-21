'use strict';
// Requirement: the Clustered IPD dialog's result card shows what the fit returned: an estimate of
// exactly 0 is shown as 0 (not thrown), the interval is labelled with the confidence level it was
// computed at (getConfZ() reads APP.config.confLevel), and a fit that did not converge says so.
// Limitation sweep LIM-P60 L21, on main cfce892d: `result.pooled_effect || result.treatment_effect`
// drops an exact 0 and toFixed() then throws; the label is always "95% CI"; convergence.converged =
// false is not shown.
//   node dev/tests/clustered_ipd_display.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + String(detail).slice(0, 300) + ']' : '')); if (!ok) failed++; }
const ICC = '{ ICC: 0.1, design_effect: 1.5, n_clusters: 4, n_total: 80 }';
const fmt = (res, level) => { try { return run('APP.config.confLevel = ' + level + '; formatClusteredIPDResults(' + res + ', ' + ICC + ')'); } catch (e) { return 'THREW ' + e.message; } };
const flat = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const base = '{ method: "One-Stage", pooled_effect: 0.25, SE: 0.1, CI_lower: 0.054, CI_upper: 0.446, p_value: 0.012, convergence: { converged: true } }';
check('control: a converged 95% fit renders its estimate and "95% CI"', /0\.2500/.test(flat(fmt(base, 0.95))) && /95% CI/.test(flat(fmt(base, 0.95))), flat(fmt(base, 0.95)).slice(0, 200));
const zero = fmt('{ method: "One-Stage", pooled_effect: 0, SE: 0.1, CI_lower: -0.196, CI_upper: 0.196, p_value: 1, convergence: { converged: true } }', 0.95);
check('an estimate of exactly 0 is shown as 0.0000, not thrown', !/^THREW/.test(zero) && /0\.0000/.test(flat(zero)), flat(zero).slice(0, 200));
const z0 = fmt('{ method: "GEE", treatment_effect: 0, SE_robust: 0.12, CI_robust: [-0.235, 0.235], p_robust: 1 }', 0.95);
check('a GEE estimate of exactly 0 is shown, not thrown', !/^THREW/.test(z0) && /0\.0000/.test(flat(z0)), flat(z0).slice(0, 200));
const l90 = flat(fmt(base, 0.9));
check('a 90% interval is labelled "90% CI", not "95% CI"', /90% CI/.test(l90) && !/95% CI/.test(l90), l90.slice(0, 200));
const nc = flat(fmt('{ method: "One-Stage", pooled_effect: 0.25, SE: 0.1, CI_lower: 0.054, CI_upper: 0.446, p_value: 0.012, convergence: { converged: false } }', 0.95));
check('a fit that did not converge says so', /did not converge/i.test(nc), nc.slice(0, 200));
check('control: a converged fit has no convergence warning', !/did not converge/i.test(flat(fmt(base, 0.95))));
if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all passed');
