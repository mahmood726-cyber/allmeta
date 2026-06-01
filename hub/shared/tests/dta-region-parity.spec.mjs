/**
 * R-parity for the bivariate DTA region ellipses (AlmDTABivariate.regionEllipse) vs
 * mada's plot.reitsma regions on the AuditC dataset (method="ml"):
 *   confidence region = ellipse(covMu, centre=mu),  prediction region = ellipse(Σ, centre=mu),
 * both in logit space at r=√qchisq(.95,2)≈2.4477, back-transformed by expit (alpha=1 → logit).
 * Because expit is monotone, the back-transformed ellipse's bounding box equals
 * expit(mu ± r·√diag(C)); we assert our ellipse reproduces mada's box exactly.
 *   mu=(2.0762590818,-1.2624470876)  covMu=[0.1023137907,0.0418040658,0.0280711745]
 *   Σ=[1.2238417664,0.5832329213,0.3748824238]
 *   CONF: FPR[0.1580839996,0.2989420350] Se[0.7847068954,0.9457926820]
 *   PRED: FPR[0.0594603659,0.5587894259] Se[0.3471438805,0.9917079962]
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/dta-sroc/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const TP = [47,126,19,36,130,84,68,752,59,142,137,57,34,152], FN = [9,51,10,3,19,2,0,0,5,50,24,3,1,51];
const FP = [101,272,12,78,211,68,112,3226,55,571,107,103,21,88], TN = [738,1543,192,276,959,89,423,2977,136,2788,358,437,56,264];
const ROWS = TP.map((_, i) => ({ tp: TP[i], fp: FP[i], fn: FN[i], tn: TN[i] }));

const box = pts => ({
  fprLo: Math.min(...pts.map(p => p.fpr)), fprHi: Math.max(...pts.map(p => p.fpr)),
  seLo: Math.min(...pts.map(p => p.tpr)), seHi: Math.max(...pts.map(p => p.tpr)),
});

test('region ellipses match mada plot.reitsma (confidence + prediction)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const out = await page.evaluate((rows) => {
    const f = window.AlmDTABivariate.fit(rows);
    return {
      conf: window.AlmDTABivariate.regionEllipse(f, 'confidence', 4000),
      pred: window.AlmDTABivariate.regionEllipse(f, 'prediction', 4000),
      covMu: f.covMu, Sigma: f.Sigma,
    };
  }, ROWS);

  // covMu (vcov of the summary means) matches mada — never asserted before.
  expect(out.covMu[0][0]).toBeCloseTo(0.1023137907, 4);
  expect(out.covMu[0][1]).toBeCloseTo(0.0418040658, 4);
  expect(out.covMu[1][1]).toBeCloseTo(0.0280711745, 4);

  const c = box(out.conf), p = box(out.pred);
  // Confidence region bounding box.
  expect(c.fprLo).toBeCloseTo(0.1580839996, 3); expect(c.fprHi).toBeCloseTo(0.2989420350, 3);
  expect(c.seLo).toBeCloseTo(0.7847068954, 3); expect(c.seHi).toBeCloseTo(0.9457926820, 3);
  // Prediction region is strictly wider than the confidence region (between-study spread).
  expect(p.fprLo).toBeCloseTo(0.0594603659, 3); expect(p.fprHi).toBeCloseTo(0.5587894259, 3);
  expect(p.seLo).toBeCloseTo(0.3471438805, 3); expect(p.seHi).toBeCloseTo(0.9917079962, 3);
  expect(p.fprHi - p.fprLo).toBeGreaterThan(c.fprHi - c.fprLo);

  // Every confidence-ellipse point lies inside the unit ROC square and the curve closes.
  for (const pt of out.conf) { expect(pt.fpr).toBeGreaterThan(0); expect(pt.fpr).toBeLessThan(1); expect(pt.tpr).toBeGreaterThan(0); expect(pt.tpr).toBeLessThan(1); }
  expect(out.conf[0].fpr).toBeCloseTo(out.conf[out.conf.length - 1].fpr, 9);
  expect(errs, 'no console errors').toEqual([]);
});
