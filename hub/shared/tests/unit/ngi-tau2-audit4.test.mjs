// nma-global-inconsistency tau² (lane audit4). The model-comparison table shows a DL τ² for
// the consistency model and the full design model. Both are regressions, so the
// DerSimonian-Laird denominator is tr(P) = tr(W) - tr((X'WX)^-1 X'W²X) (netmeta's
// generalised DL; metafor rma(method = "DL", mods)), not the intercept-only
// sum(w) - sum(w²)/sum(w), which the page used.
// References: R 4.6.0, netmeta 3.6.1 netmeta(..., method.tau = "DL")$tau2 = 0.071574 and a
// direct tr(P) computation (lane audit4 run/ngi2.R, ngi3.R; out/ngi2_R.txt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

const HET = 'A,B,-0.30,0.10,AB\nA,B,-0.62,0.08,AB\nA,C,-0.20,0.12,AC\nA,C,-0.65,0.10,AC\nB,C,0.40,0.11,BC\nB,C,0.08,0.13,BC\nA,D,-0.90,0.15,AD\nA,D,-0.28,0.14,AD\nB,D,-0.25,0.18,BD\nC,D,0.35,0.14,CD';
const R = { consQ: 43.20489, consTau2: 0.07157436, fullQ: 27.20476, fullTau2: 0.07242663 };

test('NGI: consistency- and design-model tau² are the generalised DL of netmeta / metafor', () => {
  const p = loadPage('nma-global-inconsistency/index.html', { pick: s => s.includes('function pchi(') });
  p.ctx.__almNgiLoad(HET);
  const r = p.ctx._almLastNgi();
  assert.ok(Math.abs(r.cons.Q - R.consQ) < 1e-4 && Math.abs(r.full.Q - R.fullQ) < 1e-4, `Q ${r.cons.Q} ${r.full.Q}`);
  const tbl = text(p.el('cmp-body').innerHTML);
  assert.match(tbl, /Consistency 43\.20 7 0\.0716 83\.8%/, tbl);
  assert.match(tbl, /Design \(full\) 27\.20 4 0\.0724 85\.3%/, tbl);
  assert.ok(Math.abs(r.cons.tau2 - R.consTau2) < 1e-6, `consistency tau2 ${r.cons.tau2} vs netmeta ${R.consTau2}`);
  assert.ok(Math.abs(r.full.tau2 - R.fullTau2) < 1e-6, `design tau2 ${r.full.tau2} vs metafor ${R.fullTau2}`);
});

test('NGI: footer does not claim the WLS fit pools with tau²', () => {
  const html = loadPage('nma-global-inconsistency/index.html', { pick: s => s.includes('function pchi(') }).html;
  const foot = text(html.match(/<footer>([\s\S]*?)<\/footer>/)[1]);
  assert.doesNotMatch(foot, /with pooled τ²/, foot);
});
