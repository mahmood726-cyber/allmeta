// multi-outcome-nma (lane audit6).
//
// 1. Sigma_RE^outcomes off-diagonal. The page says rho_between is the "sample-correlation of
//    per-row residuals"; shared/multi-outcome-nma.js correlated the RAW contrast estimates y_i,
//    so differences BETWEEN treatment contrasts (A-B vs A-C vs B-C) were read as between-study
//    correlation. On a network whose residuals are strongly negatively correlated it reported
//    rho = +0.2846 (= cor(y1, y2)). R (4.6.0; netmeta 3.7.0; lane audit6 run/monma_het.R): the
//    residuals about the per-outcome common-effect network fit correlate -0.92599962, and
//    metafor::rma.mv(struct = "UN") REML puts rho at the -1 boundary. Per-outcome tau match
//    netmeta DL (0.1625, 0.160383) before and after.
// 2. Citation. Achana et al. 2014 is BMC Med Res Methodol 14:92 (doi:10.1186/1471-2288-14-92,
//    PubMed 25047164), not "Res Synth Methods 5:35-49 section 3.2".
// 3. Default example (tau = 0) still equals netmeta common effects per outcome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadPage, text } from './helpers/page-vm.mjs';

const require = createRequire(import.meta.url);
const M = require('../../../../shared/multi-outcome-nma.js');

const HET = [
  ['S1', 'A', 'B', -0.10, -0.60], ['S2', 'A', 'B', -0.50, -0.20], ['S3', 'A', 'B', -0.20, -0.50], ['S4', 'A', 'B', -0.45, -0.25],
  ['S5', 'A', 'C', -0.60, -1.00], ['S6', 'A', 'C', -1.00, -0.60], ['S7', 'A', 'C', -0.70, -0.95], ['S8', 'A', 'C', -0.95, -0.65],
  ['S9', 'B', 'C', -0.20, -0.50], ['S10', 'B', 'C', -0.50, -0.20]];

test('multi-outcome-nma: rho_between is the residual correlation (R -0.92599962), not cor(raw y)', () => {
  const studies = HET.map(r => ({ id: r[0], contrasts: [{ trtA: r[1], trtB: r[2], outcomes: [{ yi: r[3], sei: 0.1 }, { yi: r[4], sei: 0.1 }] }] }));
  const f = M.fit(studies, ['A', 'B', 'C'], { K: 2 });
  assert.ok(Math.abs(f.taus[0] - 0.1625) < 1e-6 && Math.abs(f.taus[1] - 0.16038284) < 1e-6, String(f.taus));
  const rho = f.Sigma_RE_outcomes[0][1] / (f.taus[0] * f.taus[1]);
  assert.ok(Math.abs(rho - -0.92599962) < 1e-6, 'rho ' + rho);
  assert.ok(Math.abs(f.Sigma_RE_outcomes[0][1] - -0.0241336) < 1e-6, String(f.Sigma_RE_outcomes[0][1]));
});

test('multi-outcome-nma: default example equals netmeta common effects (tau = 0)', () => {
  const p = loadPage('multi-outcome-nma/index.html', { shared: ['shared/multi-outcome-nma.js'], pick: s => s.includes('AlmMultiOutcomeNMA.fit') });
  p.el('src').value = p.html.match(/<textarea[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  p.el('f-ref').value = 'A';
  p.fire('btn-run');
  const out = text(p.ctx.document.querySelector('#effects tbody').innerHTML);
  for (const s of ['B vs A Outcome 1 -0.2877 0.0491', 'C vs A Outcome 1 -0.4375 0.0730',
    'B vs A Outcome 2 -0.3454 0.0638', 'C vs A Outcome 2 -0.5052 0.0805']) assert.ok(out.includes(s), s + ' | ' + out);
});

test('multi-outcome-nma: Achana 2014 cited as BMC Med Res Methodol 14:92', () => {
  for (const f of ['multi-outcome-nma/index.html', 'shared/multi-outcome-nma.js']) {
    const s = readFileSync(new URL('../../../../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /5:35-49/, f);
    assert.match(s, /BMC Med Res Methodol 2014;14:92/, f);
  }
});
