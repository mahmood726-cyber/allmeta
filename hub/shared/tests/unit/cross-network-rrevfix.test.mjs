// cross-network (lane rrevfix, re-review F3 of #592). Under the fixed-offset model the synthesis
// is the RCT anchor plus a combination of the non-RCT rows whose coefficients sum to zero
// (coef(s,j) = (b_j - B_s u_j / U_s)/swA in shared/cross-network-synthesis.js), independent of the
// RCTs. So the non-RCT rows carry no information about mu whatever sigma2 is: with sigma2 = 0 the
// synthesis equals the anchor, and with sigma2 > 0 it is the anchor plus zero-mean noise, with an SE
// strictly larger than the anchor's. The page note described only the sigma2 = 0 case.
// Checked by execution before writing the note: 5000 random datasets (4068 with sigma2 > 0),
// 0 with se_synthesis < se_anchor; shifting every obs y by +1 moved mu/SE by <= 3e-16.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const X = require('../../../../shared/cross-network-synthesis.js');
const rows = [
  ['T', -0.30, 0.020, 'rct'], ['T', -0.28, 0.025, 'rct'], ['T', -0.32, 0.018, 'rct'],
  ['T', -0.20, 0.010, 'obs'], ['T', -0.90, 0.010, 'obs'], ['T', -0.55, 0.012, 'obs'], ['T', -0.70, 0.010, 'obs'],
].map(([contrast, yi, vi, design]) => ({ contrast, yi, vi, design }));

test('cross-network: with sigma2 > 0 the SE is strictly larger than the anchor SE', () => {
  const c = X.fit(rows).contrasts.T;
  assert.ok(c.sigma2_obs > 0);
  assert.ok(c.se_synthesis > c.se_anchor, `${c.se_synthesis} vs ${c.se_anchor}`);
});

test('cross-network: the obs rows carry no information about mu (shifting them all leaves the synthesis unchanged)', () => {
  const a = X.fit(rows).contrasts.T;
  const b = X.fit(rows.map(r => r.design === 'obs' ? { ...r, yi: r.yi + 1 } : r)).contrasts.T;
  assert.ok(Math.abs(a.mu_synthesis - b.mu_synthesis) < 1e-12 && Math.abs(a.se_synthesis - b.se_synthesis) < 1e-12);
});

test('cross-network: the page note states the sigma2 > 0 case (SE larger than the anchor, no gain in precision)', () => {
  const html = readFileSync(new URL('../../../../cross-network/index.html', import.meta.url), 'utf8');
  const note = html.match(/<div class="note">([\s\S]*?)<\/div>/)[1].replace(/\s+/g, ' ');
  assert.match(note, /σ² &gt; 0|σ² > 0/, note);
  assert.match(note, /larger than the anchor/, note);
  assert.match(note, /never more precise than the RCT anchor/, note);
});
