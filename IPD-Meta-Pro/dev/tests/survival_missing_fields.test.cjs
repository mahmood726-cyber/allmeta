'use strict';
// Found by the modal sweep (lane ipdmodal): More > AFT Model on the SGLT2 CVD (binary) example, 2 studies, showed
// "Time Ratio: 0.057  95% CI: 0.000 to Infinity  Shape Parameter: 20.000".
// Root cause: normalizeAdvancedSurvivalData looked the time and event fields up with getAdvancedSurvivalFieldValue,
// which returns null when no candidate column exists, and converted them with Number(null) = 0, which is finite.
// So a data set with NO time column kept every row, with time 1e-6 (and a missing event became 0 = censored), and
// the AFT fit on identical times returned an unidentified treatment effect (SE -> infinite CI) and a clamped shape.
// A missing field is now missing (the row is not analysable); a time or event that IS recorded as 0 is kept as before.
//   node dev/tests/survival_missing_fields.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + detail + ']')); };

// a binary-outcome data set: no time column at all (as the shipped SGLT2 CVD example)
const noTime = [];
for (let i = 0; i < 40; i++) noTime.push({ study_id: 'S' + (i % 2), treatment: i % 2, mace_event: (i * 7) % 5 === 0 ? 1 : 0 });
sandbox.__noTime = noTime;
run('APP.config.timeVar = ""; APP.config.eventVar = "mace_event"; APP.config.treatmentVar = "treatment";');
{
  const n = run('normalizeAdvancedSurvivalData(__noTime).length');
  check('rows with no time variable are not analysable survival observations', n === 0, n + ' rows kept');
  const r = run('fitAFTModel(__noTime, "weibull")');
  check('AFT on data with no time variable is refused, not fitted', typeof r.error === 'string' && !('timeRatio' in r), JSON.stringify(r).slice(0, 300));
}
// a real survival set where some times are recorded as 0 and some events as 0: kept exactly as before
const surv = [];
for (let i = 0; i < 30; i++) surv.push({ study_id: 'S' + (i % 3), treatment: i % 2, time: i % 10 === 0 ? 0 : 1 + (i * 37) % 23, event: i % 3 === 0 ? 0 : 1 });
sandbox.__surv = surv;
run('APP.config.timeVar = "time"; APP.config.eventVar = "event";');
{
  const z = run('normalizeAdvancedSurvivalData(__surv)');
  check('recorded zeros are kept (time 0 -> 1e-6, event 0 = censored)', z.length === 30 && z[0].time === 1e-6 && z[0].event === 0 && z[1].event === 1, JSON.stringify(z.slice(0, 2).map(d => [d.time, d.event, d.treatment])));
  sandbox.__part = surv.map((d, i) => i < 5 ? { study_id: d.study_id, treatment: d.treatment, event: d.event } : d);
  const p = run('normalizeAdvancedSurvivalData(__part).length');
  check('a row whose time is missing is dropped, the others kept', p === 25, p);
  sandbox.__blank = surv.map((d, i) => i < 4 ? Object.assign({}, d, { event: '' }) : d);
  const q = run('normalizeAdvancedSurvivalData(__blank).length');
  check('a row whose event is blank is dropped (it was counted as censored)', q === 26, q);
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
