'use strict';
// Found by a real-Chrome sweep of every onclick handler (k = 2 and k = 1 subsets of "Lung Cancer (IO)"): the only
// surfaces that printed "NaN" were More > Power Monitor ("1 STUDIES ... NaN% I2 ... tau2: NaN") and More > Federated
// Analysis ("Pooled Result NaN, 95% CI: NaN to NaN, p = NaN"). No handler reached the MetaAnalysis engine with one study.
// Root cause, both modules: they read hard-coded columns (d.study, d.outcome / d.y, d.treatment === 1) instead of the
// mapped variables (APP.config.studyVar / eventVar / treatmentVar), so on any dataset whose columns are named
// otherwise every row fell into one "undefined" study with no arms: k = 1, I2 = 0/0, an infinite SE. They now use the
// mapped variables and the same arm mapping as runAnalysis (ipdResolveBinaryArmMapping / ipdSplitBinaryArms), pool only
// studies that have both arms, and with fewer than two such studies report I2 / tau2 as not estimable.
//   node dev/tests/power_federated_fields.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + detail + ']')); };

// two studies, columns named as in the page's own examples (study_id / treatment / outcome in "event")
const rows = [];
const add = (s, t, ys) => ys.forEach(y => rows.push({ study_id: s, treatment: t, event: y }));
add('A', 1, [5, 6, 7, 8]); add('A', 0, [4, 5, 5, 6]);
add('B', 1, [9, 7, 8, 10]); add('B', 0, [5, 6, 4, 7]);
const cfg = { studyVar: 'study_id', treatmentVar: 'treatment', eventVar: 'event', outcomeType: 'continuous' };
sandbox.__rows = rows; sandbox.__cfg = cfg;
// reference by hand: mean differences and their variances
const md = (s) => { const t = rows.filter(r => r.study_id === s && r.treatment === 1).map(r => r.event), c = rows.filter(r => r.study_id === s && r.treatment === 0).map(r => r.event);
  const m = a => a.reduce((x, y) => x + y, 0) / a.length, v = a => { const mu = m(a); return a.reduce((x, y) => x + (y - mu) ** 2, 0) / (a.length - 1); };
  return { y: m(t) - m(c), v: v(t) / t.length + v(c) / c.length }; };
const A = md('A'), B = md('B');
const w = [1 / A.v, 1 / B.v], fe = (w[0] * A.y + w[1] * B.y) / (w[0] + w[1]);
const Q = w[0] * (A.y - fe) ** 2 + w[1] * (B.y - fe) ** 2, I2 = Math.max(0, (Q - 1) / Q * 100);

{
  const s = run('PowerMonitor.calculateCurrentPower(__rows, __cfg)');
  check('Power Monitor: 2 studies read from the mapped columns', s.currentStudies === 2, JSON.stringify(s));
  check('Power Monitor: fixed-effect pooled MD and Q-based I2 match a hand computation', Math.abs(s.pooledEffect - fe) < 1e-12 && Math.abs(s.I2 - I2) < 1e-9, JSON.stringify(s) + ' fe ' + fe + ' I2 ' + I2);
  sandbox.__one = rows.filter(r => r.study_id === 'A');
  const s1 = run('PowerMonitor.calculateCurrentPower(__one, __cfg)');
  check('Power Monitor, one study: I2 and tau2 not estimable (not 0/0 shown as NaN%)', s1.currentStudies === 1 && !Number.isFinite(s1.I2) && !Number.isFinite(s1.tau2) &&
    run('ipdHetText(NaN, 1, 1, "%")') === 'not estimable (k = 1)', JSON.stringify(s1));
}
{
  const r = run('FederatedMetaAnalysis.runFederatedAnalysis(__rows, __cfg)');
  const re = r.aggregatedResult.randomEffect, f = r.aggregatedResult.fixedEffect;
  check('Federated: 2 sites from the mapped columns, finite pooled result', r.siteContributions.length === 2 && [re.effect, re.se, re.ci_lower, re.ci_upper, re.pValue].every(Number.isFinite), JSON.stringify(r.aggregatedResult));
  check('Federated: fixed-effect pooled MD matches a hand computation', Math.abs(f.effect - fe) < 1e-12, f.effect + ' vs ' + fe);
  sandbox.__half = rows.concat([{ study_id: 'C', treatment: 1, event: 3 }, { study_id: 'C', treatment: 1, event: 4 }]);
  const r2 = run('FederatedMetaAnalysis.runFederatedAnalysis(__half, __cfg)');
  check('Federated: a site with only one arm is not pooled (it gave an infinite SE)', r2.siteContributions.length === 2 && Number.isFinite(r2.aggregatedResult.randomEffect.effect), JSON.stringify(r2.siteContributions.map(s => s.siteId)));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
