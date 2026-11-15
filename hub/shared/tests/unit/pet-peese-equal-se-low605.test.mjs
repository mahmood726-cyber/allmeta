// pet-peese (lane low605): all standard errors equal (independent review rrev2, item 1).
// With every sei equal the PET regressor (sei) and the PEESE regressor (vi) are constant,
// so the slope is not identified. R 4.6.0 / metafor 5.2.1 (scratch near.R, near2.R, near3.R):
//   yi = .10 .35 .22 .51 .05 .30, sei = .2 (x6)
//   lm(yi ~ sei, weights = 1/sei^2): the sei coefficient is NA (dropped); the "intercept"
//     left is just the weighted mean 0.255 (SE 0.0691), not a PET estimate. Same for vi.
//   metafor::trimfill(rma(yi, sei = sei, method = "FE")) stops:
//     "missing value where TRUE/FALSE needed" (the side regression has no slope).
// The page printed PET 0.250, SE 0.000, CI [0.250, 0.250]; PEESE "—"; and trim-and-fill
// k0 = 0 on side "left" (a side it could not have determined). It also said
// "Conditional estimator: PET (PET intercept one-sided p >= 0.1)" on a PET it did not have.
// The normal-equation wls() also lost all precision for near-equal SEs (relative spread
// 1e-6: PET -114052.6 vs lm -113999.8).
// Rule now = lm's own (dqrdc2, tol 1e-7): the slope is dropped when the weighted
// regressor's residual norm after projecting out the intercept is < 1e-7 of its norm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

const page = () => loadPage('pet-peese/index.html', { shared: ['shared/upper-tail.js'], pick: s => /function trimAndFill/.test(s) });
const YI = [0.10, 0.35, 0.22, 0.51, 0.05, 0.30];
const dataset = eps => YI.map((y, i) => ({ te: y, se: i === 1 ? 0.2 * (1 + eps) : 0.2 }));
const src = eps => dataset(eps).map(r => `${r.te}, ${r.se}`).join('\n');
const runPage = (p, eps) => {
  p.el('src').value = src(eps); p.el('alpha').value = '0.10'; p.el('tf-est').value = 'L0';
  p.fire('btn-run');
  return { body: text(p.el('res-body').innerHTML), warn: text(p.el('warn-slot').innerHTML) };
};

test('pet-peese: all SEs equal -> PET and PEESE labelled not identified, no degenerate numbers', () => {
  const p = page();
  const { body, warn } = runPage(p, 0);
  assert.doesNotMatch(body, /PET intercept\s+0\.250\s+0\.000/, body);
  assert.match(body, /PET intercept\s+not identified: all standard errors equal/, body);
  assert.match(body, /PEESE intercept\s+not identified: all standard errors equal/, body);
  assert.doesNotMatch(warn, /Conditional estimator:\s*PET \(PET intercept/, warn);
  assert.match(warn, /Conditional estimator:\s*not available/, warn);
  // FE row unaffected (control): rma(method = "FE") 0.255, SE 0.0816 [0.095, 0.415]
  assert.match(body, /FE meta-analysis\s+0\.255\s+0\.082\s+\[0\.095, 0\.415\]/, body);
  const pp = p.ctx.petPeese(dataset(0));
  assert.equal(pp.pet.identified, false); assert.equal(pp.peese.identified, false);
});

test('pet-peese: all SEs equal -> trim-and-fill refused like metafor::trimfill (no side, no k0)', () => {
  const p = page();
  const tf = p.ctx.trimAndFill(dataset(0), 'L0');
  assert.equal(tf.refused, true);
  assert.equal(tf.side, null);
  const { body } = runPage(p, 0);
  assert.doesNotMatch(body, /Trim-and-fill \(k₀=0/, body);
  assert.match(body, /Trim-and-fill\s+not computed: funnel side cannot be determined/, body);
});

test('pet-peese: near-equal SEs (relative spread <= 1e-7) are not identified, as lm drops the slope', () => {
  const p = page();
  for (const eps of [1e-12, 1e-10, 1e-9, 1e-8, 1e-7]) {
    const pp = p.ctx.petPeese(dataset(eps));
    assert.equal(pp.pet.identified, false, `PET eps ${eps}`);
    assert.equal(pp.peese.identified, false, `PEESE eps ${eps}`);
    assert.equal(p.ctx.trimAndFill(dataset(eps), 'R0').refused, true, `tf eps ${eps}`);
    assert.match(runPage(p, eps).body, /PET intercept\s+not identified/, `eps ${eps}`);
  }
});

test('pet-peese: just-identified near-equal SEs match lm to 1e-6 relative (was normal equations)', () => {
  const p = page();
  // coef(summary(lm(yi ~ sei, weights = 1/sei^2))) / lm(yi ~ I(sei^2), ...), scratch near.R
  const R = [
    [1e-6, -113999.764, 199389.2664, -56999.73549, 99694.59994],
    [1e-4, -1139.764, 1994.090058, -569.7355014, 997.0117966],
    [1e-2, -11.164, 20.13829576, -5.435641791, 10.0358205],
  ];
  for (const [eps, pb, ps, qb, qs] of R) {
    const pp = p.ctx.petPeese(dataset(eps));
    assert.equal(pp.pet.identified, true, `eps ${eps}`);
    const rel = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `eps ${eps}: ${a} vs ${b}`);
    rel(pp.pet.b0, pb, 1e-6);
    rel(pp.pet.seB0, ps, 1e-6); rel(pp.peese.b0, qb, 1e-6); rel(pp.peese.seB0, qs, 1e-6);
  }
});
