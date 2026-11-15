// cross-network (lane audit6): the synthesis SE was smaller than the RCT-anchor SE while the
// estimate was identical to the anchor.
//
// delta_obs is the weighted mean obs residual about the RCT anchor, so the bias-adjusted obs values
// y - delta_obs depend on the RCT data and on each other; shared/cross-network-synthesis.js pooled
// them as if independent and added var(delta) = 1/w_obs only, omitting var(anchor) and the
// covariance. On the page's default A_vs_B (3 RCT, 1 IPD, 2 obs; sigma2_obs = 0) it printed
// "-0.3021 (SE 0.071)" next to the anchor "-0.3021 (SE 0.083)": the obs studies added precision
// while contributing nothing to the estimate.
//
// R oracle (R 4.6.0, metafor 5.2.1; lane audit6 run/cn.R): the same design-offset model as a
// meta-regression, rma(y, v + tau2_RCT, mods = ~ design, method = "FE") on RCT + obs rows,
// gives the RCT-level estimate -0.3021, SE 0.08288684, delta_obs -0.2209.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadPage, text } from './helpers/page-vm.mjs';

const require = createRequire(import.meta.url);
const X = require('../../../../shared/cross-network-synthesis.js');

const DEFAULT = [
  ['A_vs_B', -0.30, 0.020, 'rct'], ['A_vs_B', -0.28, 0.025, 'rct'], ['A_vs_B', -0.32, 0.018, 'rct'],
  ['A_vs_B', -0.31, 0.008, 'ipd'], ['A_vs_B', -0.55, 0.014, 'obs'], ['A_vs_B', -0.50, 0.012, 'obs'],
  ['A_vs_C', -0.45, 0.024, 'rct'], ['A_vs_C', -0.48, 0.022, 'rct'], ['A_vs_C', -0.62, 0.014, 'obs'],
].map(([contrast, yi, vi, design]) => ({ contrast, yi, vi, design }));

test('cross-network: default A_vs_B synthesis SE equals the R design-offset model (0.08288684)', () => {
  const c = X.fit(DEFAULT).contrasts.A_vs_B;
  assert.ok(Math.abs(c.mu_synthesis - -0.30211) < 1e-4, String(c.mu_synthesis));
  assert.ok(Math.abs(c.delta_obs - -0.2209) < 1e-4, String(c.delta_obs));
  assert.equal(c.sigma2_obs, 0);
  assert.ok(Math.abs(c.se_synthesis - 0.08288684) < 1e-7, 'se ' + c.se_synthesis);
});

test('cross-network: page renders the corrected SE in the table', () => {
  const p = loadPage('cross-network/index.html', { shared: ['shared/cross-network-synthesis.js'], pick: s => s.includes('AlmCrossNetwork.fit') });
  p.el('src').value = p.html.match(/<textarea[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  p.fire('btn-run');
  const out = text(p.ctx.document.querySelector('#results tbody').innerHTML);
  assert.match(out, /A_vs_B -0\.3021 \(SE 0\.083\) -0\.3021 \(SE 0\.083\)/, out);
});

test('cross-network: with sigma2_obs > 0 the synthesis is never more precise than the RCT anchor', () => {
  const rows = [
    ['T', -0.30, 0.020, 'rct'], ['T', -0.28, 0.025, 'rct'], ['T', -0.32, 0.018, 'rct'],
    ['T', -0.20, 0.010, 'obs'], ['T', -0.90, 0.010, 'obs'], ['T', -0.55, 0.012, 'obs'], ['T', -0.70, 0.010, 'obs'],
  ].map(([contrast, yi, vi, design]) => ({ contrast, yi, vi, design }));
  const c = X.fit(rows).contrasts.T;
  assert.ok(c.sigma2_obs > 0, 'test needs between-obs bias variance');
  assert.ok(c.se_synthesis >= c.se_anchor - 1e-12, `se_syn ${c.se_synthesis} < se_anchor ${c.se_anchor}`);
});

test('cross-network: cited GetReal review is Res Synth Methods 2016;7:236-263 (PubMed 26754852)', () => {
  for (const f of ['cross-network/index.html', 'shared/cross-network-synthesis.js']) {
    const s = readFileSync(new URL('../../../../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /8:23-39/, f);
    assert.match(s, /2016;7:236-263/, f);
  }
});
