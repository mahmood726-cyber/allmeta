// pet-peese (lane audit8) vs R 4.6.0 / metafor 5.2.1 (scratch run/pp.R, tfgen.R, tfref.R).
// The FE pool, the PET/PEESE coefficients, SEs and t(k-2) p-values already match
// lm(yi ~ sei, weights = 1/vi) / lm(yi ~ vi, weights = 1/vi). Defects on origin/main:
//  1. The PET and PEESE 95% CIs used z (1.96) while the p-value beside them used t(k-2):
//     default example PET [-0.083, 0.077] vs confint(lm) [-0.0974, 0.0907].
//  2. Trim-and-fill R0 counted the run of NEGATIVE centred ranks at the top instead of the
//     run on the asymmetric side (metafor: k0 = k - max|negative rank| - 1): 202 of 300
//     simulated data sets gave a k0 different from metafor::trimfill(rma(method="FE"),
//     estimator="R0") (usually 0).
//  3. Trim-and-fill side came from the sign of a rank sum; metafor (the rule the page's
//     sibling shared/trimfill.js implements) takes it from the sign of the slope of yi on
//     sqrt(vi): 11 of 300 data sets imputed on the wrong side (L0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

const page = () => loadPage('pet-peese/index.html', { shared: ['shared/upper-tail.js'], pick: s => /function trimAndFill/.test(s) });
const rows = (yi, sei) => yi.map((y, i) => ({ te: y, se: sei[i] }));

// Data sets from tfgen.R (seed 20261115), cases 2, 79, 87 (1-based), and metafor's answers.
const C1 = rows([0.470129949337889, 0.305776628305536, 0.928762038593188, 1.18637324950998, 0.157237120107683, 0.580317336228903, 0.354224012063572, 0.379139558784478, 1.44808115477147, 0.702922253212067, 0.467472208100822, 0.310188834300515, 1.0315979949296, 0.409253501458921],
  [0.216927209624555, 0.0959889037883841, 0.490299969632179, 0.415639120782726, 0.303453849302605, 0.276651842088904, 0.096037579595577, 0.0885782908415422, 0.405708898312878, 0.22042144285515, 0.113895747333299, 0.470430356776342, 0.404843815288041, 0.187743642833084]);
const C78 = rows([0.408451726364332, 0.32743419874747, 0.223974121286082, -0.0875723251207922, 0.214408045910019],
  [0.409618379932363, 0.36608967295615, 0.150269550702069, 0.350966299988795, 0.0864432270056568]);
const C86 = rows([0.166772736963126, 0.202145757677938, 0.124823695578117, 0.119090339625457, -0.0870501935717466, -0.214546557989826, 0.239426395866761, 0.028467075746802],
  [0.0513624553103, 0.184896009205841, 0.428010780108161, 0.191690885345452, 0.212099084933288, 0.445036458899267, 0.263441283651628, 0.312164798751473]);
const REF = [
  // [name, data, estimator, k0, side, beta, se, ci.lb, ci.ub]  (metafor trimfill, FE model)
  ['C1', C1, 'R0', 4, 'left', 0.3897233248373155, 0.0420930090517747, 0.3072225430949186, 0.4722241065797125],
  ['C1', C1, 'L0', 4, 'left', 0.3897233248373155, 0.0420930090517747, 0.3072225430949186, 0.4722241065797125],
  ['C78', C78, 'L0', 0, 'right', 0.2142671692384772, 0.0707726002225289, 0.0755554217100691, 0.3529789167668853],
  ['C86', C86, 'L0', 3, 'right', 0.1679913275788559, 0.0434178129898421, 0.0828939778312700, 0.2530886773264419],
  ['C86', C86, 'R0', 2, 'right', 0.1649165270557154, 0.0438439640805401, 0.0789839365183891, 0.2508491175930417],
];

test('pet-peese: trim-and-fill k0, side and filled FE estimate = metafor::trimfill (L0 and R0)', () => {
  const p = page();
  for (const [nm, d, est, k0, side, b, se, lo, hi] of REF) {
    const tf = p.ctx.trimAndFill(d, est);
    assert.equal(tf.k0, k0, `${nm} ${est} k0`);
    assert.equal(tf.side, side, `${nm} ${est} side`);
    assert.ok(Math.abs(tf.adjusted.mean - b) < 1e-9, `${nm} ${est} beta ${tf.adjusted.mean} vs ${b}`);
    assert.ok(Math.abs(tf.adjusted.se - se) < 1e-9, `${nm} ${est} se`);
    assert.ok(Math.abs(tf.adjusted.ci[0] - lo) < 1e-9 && Math.abs(tf.adjusted.ci[1] - hi) < 1e-9, `${nm} ${est} ci`);
    assert.equal(tf.imputed.length, k0);
  }
});

test('pet-peese: PET/PEESE 95% CI uses t(k-2), as confint(lm) and as the p-value beside it', () => {
  const p = page();
  // The page's own default example (k = 10), as in its <textarea>.
  p.el('src').value = p.html.match(/<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  p.el('alpha').value = '0.10'; p.el('tf-est').value = 'L0';
  p.fire('btn-run');
  const html = text(p.el('res-body').innerHTML);
  // confint(lm(yi ~ sei, weights = 1/vi)): (Intercept) -0.09741231 0.09072824
  assert.match(html, /PET intercept\s+-0\.003\s+0\.041\s+\[-0\.097, 0\.091\]\s+0\.937/, html);
  // confint(lm(yi ~ vi, weights = 1/vi)): (Intercept) 0.05608245 0.1709958
  assert.match(html, /PEESE intercept\s+0\.114\s+0\.025\s+\[0\.056, 0\.171\]\s+0\.002/, html);
  // FE row is a z interval (rma(method="FE")): 0.1384874 0.2579353 (control)
  assert.match(html, /FE meta-analysis\s+0\.198\s+0\.030\s+\[0\.138, 0\.258\]/, html);
  // Default example: metafor trimfill(FE) L0 k0 = 4, 0.1724989 [0.116452, 0.2285459] (control)
  assert.match(html, /Trim-and-fill \(k₀=4, sensitivity only\)\s+0\.172\s+0\.029\s+\[0\.116, 0\.229\]/, html);
});

test('pet-peese: header describes the trim-and-fill reflection point correctly', () => {
  const p = page();
  assert.doesNotMatch(p.html, /imputes missing studies symmetric around the median/);
});
