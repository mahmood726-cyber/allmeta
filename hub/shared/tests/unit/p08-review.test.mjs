import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadApp, studies, close } from '../../../../meta-regression/tests/review-p08/harness.mjs';

test('P08-R1 plant: scaled moderator PM brackets the root after changing outcome units', () => {
  const app = loadApp(), fit = app.fitPM(studies(1e6));
  assert.ok(fit);
  close(fit.tau2, 1e12, 'scaled tau2');
  close(fit.fit.rss, 2, 'PM estimating equation');
});

test('P08-R1 plant: scaled null PM brackets its own root', () => {
  close(loadApp().fitPMNull(studies(1e6)), 27e12, 'scaled null tau2');
});

test('P08-R1 plant: exported scaled R2 is invariant to outcome units', () => {
  close(loadApp().renderRows(studies(1e6)).R2_tau2, 26 / 27, 'scaled exported R2');
});

test('P08-R1 plant: very small outcome units retain both positive PM roots', () => {
  const app = loadApp(), scale = 1e-15, rows = studies(scale);
  close(app.fitPM(rows).tau2 / (scale * scale), 1, 'small-unit moderator tau2');
  close(app.fitPMNull(rows) / (scale * scale), 27, 'small-unit null tau2');
});

test('P08-R1 plant: non-finite moderator Q is refused rather than returned as a fit', () => {
  const rows = studies().map(s => ({ ...s, est: s.est * 1e155 }));
  assert.equal(loadApp().fitPM(rows), null);
});

test('P08-R1 plant: non-finite null Q is refused rather than returned as a variance', () => {
  const rows = studies().map(s => ({ ...s, est: s.est * 1e155 }));
  assert.equal(loadApp().fitPMNull(rows), null);
});

test('P08-R1 plant: failed PM fit is reported and omitted from results', () => {
  const app = loadApp();
  app.renderRows(studies()); // Ensure a previous successful result is not exported.
  const rows = studies().map(s => ({ ...s, est: s.est * 1e155 }));
  const result = app.renderRows(rows);
  assert.equal(Object.hasOwn(result, 'tau2_pm'), false);
  assert.match(app.elements.get('warn-banner').innerHTML, /Paule.Mandel.*finite/i);
});

test('P08-R1 plant: failed null PM is reported and cannot become zero R2', () => {
  const app = loadApp();
  app.renderRows(studies());
  const rows = [-1, 0, 1].map((x, i) => ({ label: `S${i}`, est: x * 1e155, se: 1, v: 1, x }));
  const result = app.renderRows(rows);
  assert.equal(result.tau2_pm, 0, 'the exact linear moderator fit remains valid');
  assert.equal(result.R2_tau2, null, 'null-model failure is unavailable, not zero or one');
  assert.match(app.elements.get('warn-banner').innerHTML, /Paule.Mandel.*R.*unavailable/i);
  assert.match(app.elements.get('stats-wrap').innerHTML, /R²[^<]*<\/span><span class="v">--/);
});

test('P08-R1 control: ordinary-scale PM satisfies both estimating equations', () => {
  const app = loadApp(), rows = studies(), result = app.fitPM(rows);
  close(result.tau2, 1, 'ordinary tau2');
  close(result.fit.rss, 2, 'ordinary residual Q');
  close(app.fitPMNull(rows), 27, 'ordinary null tau2');
  close(app.renderRows(rows).R2_tau2, 26 / 27, 'ordinary exported R2');
  assert.equal(app.elements.get('warn-banner').innerHTML, '');
});

test('P08-R1 control: zero heterogeneity, insufficient studies and singular moderator', () => {
  const app = loadApp(), constant = studies().map(s => ({ ...s, est: 2 }));
  assert.equal(app.fitPM(constant).tau2, 0);
  assert.equal(app.fitPMNull(constant), 0);
  assert.equal(app.renderRows(constant).R2_tau2, 0);
  for (const k of [0, 1, 2]) assert.equal(app.fitPM(studies().slice(0, k)), null);
  for (const k of [0, 1]) assert.equal(app.fitPMNull(studies().slice(0, k)), 0);
  close(app.fitPMNull(studies().slice(0, 2)), 1, 'two-study null tau2');
  assert.equal(app.fitPM(studies().map(s => ({ ...s, x: 1 }))), null);
});

test('P08-R1 control: paper Figure 1 BCG slope, CI and tau2 retain published rounding', () => {
  const configs = JSON.parse(readFileSync(new URL('../fixtures/features/meta-regression/rscript/configs.json', import.meta.url), 'utf8'));
  const app = loadApp(), rows = app.parseStudies(configs.find(c => c.id === 'dat.bcg/e1/ablat').data).studies;
  const result = app.renderRows(rows);
  assert.equal(result.slope.toFixed(4), '-0.0286');
  assert.equal(result.slope_ci_lb.toFixed(4), '-0.0485');
  assert.equal(result.slope_ci_ub.toFixed(4), '-0.0086');
  assert.equal(result.tau2_pm.toFixed(4), '0.1421');
});
