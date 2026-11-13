'use strict';
// Found by the modal sweep (after-run, NMA: Antidep example, all studies): More > Fragility Index threw
// "Cannot read properties of undefined (reading 'study')", shown as the error notification.
// Root cause: calculateFragilityIndex records fragility 0 for a study whose shift (up to 50 x 0.05) never changes
// significance, takes overallFragility = min(f.fragility || 999), and finds the most fragile study as the one whose
// fragility equals that minimum. When no study flips, the minimum is 999, no study has fragility 999,
// mostFragileStudy is undefined and displayFragilityResults dereferences it (and would have printed "999").
// The display now says that no single-study shift changes significance (">50"), with no "most fragile" study.
//   node dev/tests/fragility_none_flips.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 300) + ']')); };
run(`window.__m = []; document.body.appendChild = function (m) { __m.push(String(m.innerHTML)); return m; };`);
const none = `{ fragilities: [{ study: 'A', fragility: 0, n: 50, events: 10 }, { study: 'B', fragility: 0, n: 60, events: 12 }], overallFragility: 999, mostFragileStudy: undefined, isSignificant: true }`;
let err = null; try { run('displayFragilityResults(' + none + ')'); } catch (e) { err = String(e); }
const html = run('__m.join("")');
check('no study flips significance: no exception', err === null, err);
check('no study flips significance: says >50, no 999, no "most fragile"', /&gt;50|>50/.test(html) && !/999/.test(html) && !/most fragile\)/.test(html) && /No single study/.test(html), html.slice(0, 300));
run('__m.length = 0');
const some = `{ fragilities: [{ study: 'A', fragility: 3, n: 50, events: 10 }, { study: 'B', fragility: 0, n: 60, events: 12 }], overallFragility: 3, mostFragileStudy: { study: 'A', fragility: 3 }, isSignificant: true }`;
run('displayFragilityResults(' + some + ')');
const html2 = run('__m.join("")');
check('a study that flips is still reported as most fragile with its index', /A \(most fragile\)/.test(html2) && /If 3 event/.test(html2), html2.slice(0, 200));
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
