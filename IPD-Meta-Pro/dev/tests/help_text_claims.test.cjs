'use strict';
// Requirement: the page's help and tooltip text describes only what the main pipeline implements.
// Limitation sweep LIM-P60 L37 (and the L01/L02 refusals): the page advertised an "EB" estimator that
// the Random-Effects Method control does not offer, ranked REML as "most accurate" with no model or
// performance criterion, recommended "Both" approaches (Run Analysis fits two-stage only) and offered
// RR / SMD for Run Analysis (it fits a log OR / an MD). Static check of the shipped HTML.
//   node dev/tests/help_text_claims.test.cjs [path/to/ipd-meta-pro.html]
const fs = require('node:fs');
const path = require('node:path');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const html = fs.readFileSync(pageFile, 'utf8');
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
// first occurrence with 60 characters either side (no unbounded line regex: the page has multi-MB lines)
const hits = (re) => { const m = re.exec(html); return m ? html.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).replace(/\s+/g, ' ') : ''; };
const sel = html.indexOf('id="reMethod"');
const selBlock = sel < 0 ? '' : html.slice(sel, html.indexOf('</select>', sel));
const reOptions = (selBlock.match(/value="([A-Z]+)"/g) || []).map(s => s.slice(7, -1));
check('precondition: the Random-Effects Method control offers FE, REML, DL, PM, SJ, HE, ML', reOptions.join(',') === 'FE,REML,DL,PM,SJ,HE,ML', reOptions.join(','));
const EB = /REML, DL, PM, SJ, HE, ML, EB/;
check('no estimator list advertises EB, which the control does not offer', !EB.test(html), hits(EB));
const ACC = /most accurate/i;
check('no unqualified "most accurate" ranking of an estimator', !ACC.test(html), hits(ACC));
const BOTH = /Both recommended/;
check('the approach tooltip does not recommend "Both" (Run Analysis refuses it)', !BOTH.test(html), hits(BOTH));
const EM = /'effectMeasure': '[^'\n]{0,200}'/;
check('the effect-measure tooltip does not offer RR / SMD for Run Analysis', !/RR|SMD/.test((EM.exec(html) || [''])[0]), hits(EM));
if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all passed');
