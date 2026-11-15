// r-shiny/mean-single-group (lane audit8). The Shinylive app runs metafor in webR; its own
// sample (4 studies, REML) was run in headless Chrome. Defects in its app.R:
//  1. "Prediction Interval (95%)" came from predict() on a default (z) rma fit, so it is
//     mu +/- 1.96*sqrt(tau2 + se^2): page [4.45, 6.26]; on t(k-1) = t(3) it is [3.89, 6.82]
//     (R 4.6.0 / metafor 5.2.1, run/msg.R). At k = 4, z understates the PI half-width by 38%.
//  2. The CI was printed as "<level> % CI for pooled mean" but rma() was fitted without
//     level=, so at 90% the page printed the 95% CI [4.86, 5.82] as the 90% CI [4.94, 5.74].
//  3. "Subgroup Analysis (by group)" helpText said "separate random-effects meta-analyses for
//     each group"; the printed model is one meta-regression on factor(group) (common tau2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const appR = () => JSON.parse(readFileSync(new URL('r-shiny/mean-single-group/app.json', ROOT), 'utf8'))
  .find(f => f.name === 'app.R').content;
const block = (src, start) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf('})', i)); };

test('mean-single-group: prediction interval on t(k-1), not predict() on a z fit', () => {
  const src = appR();
  const pr = block(src, 'predResult <- reactive({');
  assert.doesNotMatch(pr, /predict\(res/, pr);
  assert.match(pr, /qt\(.*df\s*=\s*res\$k\s*-\s*1\)/, pr);
  assert.match(pr, /sqrt\(res\$tau2 \+ res\$se\^2\)/, pr);
});

test('mean-single-group: the pooled CI is fitted at the level its label prints', () => {
  const src = appR();
  const mr = block(src, 'metaResult <- reactive({');
  assert.match(mr, /rma\(yi = df\$mean, sei = df\$sei, method = method, level = as\.numeric\(input\$conf_level\)\)/, mr);
  assert.match(src, /% CI for pooled mean:/);   // the label (control)
});

test('mean-single-group: subgroup text says it is a meta-regression on group', () => {
  const src = appR();
  assert.doesNotMatch(src, /helpText\("Separate random-effects meta-analyses for each group if available\."\)/);
  assert.match(src, /factor\(group\)/);
});

// 4. "statistically significant (p= 0 )" for p < 5e-5 (round(pval, 4)); now "p < 0.0001".
test('mean-single-group: a very small p is not printed as p = 0', () => {
  const src = appR();
  assert.doesNotMatch(src, /round\(pval,4\)/);
  assert.match(src, /ifelse\(pval < 1e-4, \"p < 0\.0001\", paste0\(\"p = \", round\(pval, 4\)\)\)/);
});

// Follow-up (coordinator on #605). 5. One "Confidence Level" input did two jobs: it converted
// the input CIs to SEs (sei = (upper - lower) / (2 z)) AND set the output CI/PI level, so asking
// for a 90% output silently re-read 95% input CIs as 90% ones (SEs shrink by 1.96/1.645).
// The input-CI level is now its own control; the output level no longer touches the SEs.
test('mean-single-group: input-CI level (for SE) is separate from the output level', () => {
  const src = appR();
  assert.match(src, /selectInput\("input_ci_level",/);
  const di = block(src, 'dataInput <- reactive({');
  assert.match(di, /z <- qnorm\(1 - \(1 - as\.numeric\(input\$input_ci_level\)\/100\)\/2\)/, di);
  assert.doesNotMatch(di, /input\$conf_level\)\/100/, di);
  const mr = block(src, 'metaResult <- reactive({');
  assert.match(mr, /level = as\.numeric\(input\$conf_level\)/, mr);
});
