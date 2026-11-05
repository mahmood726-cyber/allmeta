import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadPage } from './p08-harness.mjs';
const reference = () => JSON.parse(readFileSync(new URL('./p08-bcg-reference.json', import.meta.url), 'utf8'));
const near = (a, b, label, tolerance = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) / Math.max(1, Math.abs(b)) <= tolerance, `${label}: ${a} versus ${b}`);
function accepted(h, k) {
  const p = h.parse(); assert.equal(p.studies.length, k); assert.equal(p.warnings.length, 0);
  assert.equal(h.window._almLastStudies().length, k);
  assert.equal((h.elements.get('svg-host').innerHTML.match(/<circle /g) || []).length, k);
  assert.ok(h.window._almLastFitted());
}
function parity(h) {
  const a = h.window.__almResults(), r = reference().PM;
  for (const [key, expected] of Object.entries({ intercept: r.beta[0], slope: r.beta[1], intercept_se: r.se[0], slope_se: r.se[1], intercept_ci_lb:r.ci_lb[0], intercept_ci_ub:r.ci_ub[0], slope_ci_lb:r.ci_lb[1], slope_ci_ub:r.ci_ub[1], tau2_pm:r.tau2, R2_tau2:r.R2/100, QE:r.QE, QE_p:r.QEp })) near(a[key], expected, key);
}
test('P08 control: oracle records native R versions and unchanged generator', () => {
  const r = reference(); for (const key of ['R','metafor','metadat']) assert.ok(r.provenance[key]);
  assert.equal(r.rows.length, 13);
  assert.equal(r.provenance.script_md5, createHash('md5').update(readFileSync(new URL('./p08-bcg-reference.R', import.meta.url))).digest('hex'));
});
test('P08 control: initial synthetic example parses eight studies and plots eight bubbles', () => accepted(loadPage(), 8));
test('P08 control: Load example button parses eight studies with zero rejected lines', () => {
  const h = loadPage(); h.setData('broken'); h.elements.get('btn-example').click(); accepted(h, 8);
});
test('P08 plant: Load example resets the effect label to its logOR scale', () => {
  const h = loadPage(); h.elements.get('f-effectlabel').value = 'Effect (logRR)'; h.elements.get('btn-example').click();
  assert.equal(h.elements.get('f-effectlabel').value, 'Effect (logOR)'); accepted(h, 8);
});
test('P08 plant: canonical/hero dataset picker accepts all 13 BCG rows and plots 13 bubbles', () => {
  const h = loadPage(); h.chooseBCG(); accepted(h, 13);
});
test('P08 plant: picker carries each R yi, vi and absolute latitude at full precision', () => {
  const h = loadPage(); h.chooseBCG(); const rows = h.parse().studies; assert.equal(rows.length, 13);
  reference().rows.forEach((r, i) => { near(rows[i].est,r.yi,`yi ${i}`,1e-14); near(rows[i].v,r.vi,`vi ${i}`,1e-14); assert.equal(rows[i].x,r.ablat); });
});
test('P08 plant: picker fits BCG ablat with PM/adhoc at the paper 1e-9 tolerance', () => {
  const h = loadPage(); h.chooseBCG(); parity(h);
});
test('P08 plant: picker gives bubble axes the BCG effect and moderator labels', () => {
  const h = loadPage(); h.chooseBCG();
  assert.equal(h.elements.get('f-modlabel').value, 'Absolute latitude (degrees)');
  assert.equal(h.elements.get('f-effectlabel').value, 'Effect (logRR)');
  assert.match(h.elements.get('svg-host').innerHTML, /Absolute latitude \(degrees\)/);
});
test('P08 control: primary engine with full-precision R rows matches PM/adhoc', () => {
  const h = loadPage(); h.setData(reference().rows.map(r => [r.trial,r.yi,Math.sqrt(r.vi),r.ablat].join(', ')).join('\n')); accepted(h,13); parity(h);
});
test('P08 control: multiple-moderator initial example and bubble plot accept 13 rows', () => {
  const h = loadPage(), a = h.window.AlmMetaPlusUI.current();
  assert.equal(a.result.status,'ok'); assert.equal(a.input.yi.length,13); assert.equal(a.result.full.k,13);
  assert.equal((h.elements.get('plus-plot').innerHTML.match(/data-role="bubble"/g)||[]).length,13);
  reference().rows.forEach((r,i) => { near(a.input.yi[i],r.yi,`plus yi ${i}`,1e-14); near(a.input.vi[i],r.vi,`plus vi ${i}`,1e-14); assert.equal(a.input.mods[i][0],r.year); assert.equal(a.input.mods[i][1],r.ablat); });
});
test('P08 control: Load BCG example and fit restores all multiple-moderator rows', () => {
  const h=loadPage(); h.elements.get('plus-data').value='broken'; h.elements.get('plus-interaction').checked=true; h.elements.get('plus-example').click();
  const a=h.window.AlmMetaPlusUI.current(); assert.equal(a.result.status,'ok'); assert.equal(a.input.yi.length,13); assert.equal(a.result.full.k,13); assert.equal(a.input.interaction,false);
  assert.doesNotMatch(h.elements.get('plus-status').textContent,/Refused/);
});
test('P08 plant: BCG picker URL-state round trip accepts 13 rows without rejection', () => {
  const h=loadPage(); h.chooseBCG(); const restored=loadPage({hash:h.window.location.hash}); accepted(restored,13); parity(restored);
  assert.equal(restored.elements.get('f-data').value,h.elements.get('f-data').value);
});
test('P08 control: synthetic example URL-state and saved-state restores accept eight rows', () => {
  const h=loadPage(); h.elements.get('btn-example').click(); accepted(loadPage({hash:h.window.location.hash}),8); accepted(loadPage({saved:h.window.__almSnapshot()}),8);
});
test('P08 control: actual parser rejects three-column input while valid four-column input works', () => {
  const h=loadPage(); h.setData(h.window.AlmDatasets.toForestPlotText(h.window.AlmDatasets.get('bcg')));
  assert.equal(h.parse().studies.length,0); assert.equal(h.parse().warnings.length,13);
  h.elements.get('btn-example').click(); accepted(h,8);
});
test('P08 plant: dedicated adapter preserves precision and refuses absent/non-numeric moderators', () => {
  const h=loadPage(), adapter=h.window.AlmDatasets.toMetaRegressionText;
  assert.equal(typeof adapter,'function');
  assert.equal(adapter(null),''); assert.equal(adapter({}),'');
  for(const ablat of [undefined,NaN,Infinity,'44']) assert.equal(adapter({meta_regression:[{label:'A',yi:0.123456789012345,vi:0.04,ablat}]}),'');
  assert.equal(adapter({meta_regression:[{label:'A',yi:0.123456789012345,vi:0.04,ablat:0}]}),'A, 0.123456789012345, 0.2, 0');
});
test('P08 control: pairwise adapter retains its three-column values and rounding', () => {
  const h=loadPage(), ds=h.window.AlmDatasets.get('bcg'), text=h.window.AlmDatasets.toForestPlotText(ds);
  assert.equal(text.split('\n').length,13); assert.equal(text.split('\n')[0],'Aronson 1948, -0.8893, 0.5706');
  ds.effect_se.forEach((r,i)=>assert.equal(text.split('\n')[i],`${r.label}, ${r.yi}, ${Math.sqrt(r.vi).toFixed(4)}`));
});
