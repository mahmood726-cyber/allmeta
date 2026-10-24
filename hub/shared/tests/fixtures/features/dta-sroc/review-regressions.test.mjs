// Run directly with node when sandbox policy forbids test-runner child processes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../../../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');
const app = source('dta-sroc/index.html');
const original = JSON.parse(app.match(/const EXAMPLE = ("[^\r\n]+");/)[1]);
const parse = text => text.split('\n').filter(l => l && !l.startsWith('#')).map(line => {
  const [study, ...counts] = line.split(', ');
  return Object.fromEntries(['study', 'tp', 'fp', 'fn', 'tn'].map((key, i) => [key, i ? Number(counts[i - 1]) : study]));
});
const confirmed = rows => rows.map(row => {
  const text = [row.study, row.tp, row.fp, row.fn, row.tn].join('\t');
  let start = row.study.length + 1;
  return { ...row, provenance: { label: row.study, reference: 'Synthetic regression fixture', location: 'Fixture table',
    confirmed: true, pastedText: text, values: ['tp', 'fp', 'fn', 'tn'].map(field => {
      const s = String(row[field]), span = [start, start + s.length]; start += s.length + 1;
      return { field, value: row[field], span, text: s };
    }) } };
});

function fixture() {
  const fields = Object.fromEntries(['data', 'title', 'cov', 'cc', 'method', 'example'].map(k => ['f-' + k, { value: '' }]));
  Object.assign(fields['f-data'], { value: original });
  fields['f-title'].value = 'Example SROC - diagnostic test';
  fields['f-cc'].value = 'all'; fields['f-method'].value = 'reml';
  const snapshots = [];
  const ctx = vm.createContext({ console, document: {
    getElementById: id => fields[id],
    querySelectorAll: selector => selector === '#stats-wrap .stat' ? [
      { querySelector: q => ({ textContent: q === '.k' ? 'Moses α (intercept)' : '4.309' }) },
      { querySelector: q => ({ textContent: q === '.k' ? 'Moses β (slope)' : '0.464' }) },
      { querySelector: q => ({ textContent: q === '.k' ? 'Summary Se (REML)' : '0.811 (0.767 to 0.848)' }) }
    ] : [],
    querySelector: selector => selector === '#fagan-host svg text:last-child' ? { textContent: '20% 69% 5%' } : null
  }, AlmFeaturesState: { provenance: [], entryLog: [] }, alm: { resetUndo: { snapshot() {
    snapshots.push({ data: fields['f-data'].value, title: fields['f-title'].value });
  } } } });
  for (const path of ['shared/dta-bivariate.js', 'shared/alm-text.js']) vm.runInContext(source(path), ctx);
  let fit = ctx.AlmDTABivariate.fit(parse(original), { method: 'reml', correctionControl: 'all' });
  ctx.__almBivariate = () => fit;
  ctx.__almDeeks = () => ctx.AlmDTABivariate.deeksTest(parse(fields['f-data'].value));
  ctx.__almMetaRegression = () => null;
  fields['btn-run'] = { click() { fit = ctx.AlmDTABivariate.fit(parse(fields['f-data'].value), { method: 'reml', correctionControl: 'all' }); } };
  vm.runInContext(source('dta-sroc/alm-features.js'), ctx);
  return { ctx, spec: ctx.AlmDTAFeatures, fields, snapshots };
}

test('P1 provenance: reject missing, unconfirmed, detached and incomplete sources before mutation', () => {
  for (const edit of [r => { delete r.provenance; }, r => { r.provenance.confirmed = false; },
    r => { r.provenance.reference = ''; }, r => { r.provenance.location = ''; },
    r => { r.provenance.label = 'Other'; }, r => { r.provenance.values[0].value++; },
    r => { r.provenance.values[0].span = [0, 1]; }]) {
    const { spec, fields, snapshots } = fixture(), rows = confirmed(parse(original)).slice(1);
    edit(rows[rows.length - 1]);
    assert.throws(() => spec.entry.apply(rows), /provenance|confirm|source/i);
    assert.equal(fields['f-data'].value, original);
    assert.equal(snapshots.length, 0);
  }
});

test('P2 boundary: displayed boundary and degenerate HSROC variance warn; interior does not', () => {
  const { ctx, spec } = fixture(), r = spec.text.results();
  const flags = row => ctx.AlmText.render(spec.text.templates, row, {}).flags.map(f => f.text).join(' ');
  for (const value of [r, { ...r, rho: 0.9996 }, { ...r, rho: -0.9996 }, { ...r, rho: 0.5, sigma2theta: 0.000001 }])
    assert.match(flags(value), /covariance may be poorly identified/);
  assert.doesNotMatch(flags({ ...r, rho: 0.5, sigma2theta: 0.1, sigma2alpha: 0.1 }), /covariance may be poorly identified/);
});

test('P2 audit: exclude display-sourced values, retain independent sensitivity check', () => {
  const { ctx, spec } = fixture(), r = spec.text.results();
  assert.equal(r.mosesAlpha, 4.309);
  assert.equal(spec.text.dom().mosesAlpha, undefined);
  const text = ctx.AlmText.render(spec.text.templates, r, {});
  assert.equal(ctx.AlmText.audit(text, r, { dom: spec.text.dom() }).ok, true);
  assert.equal(ctx.AlmText.audit(text, { ...r, sens: r.sens + 0.01 }, { dom: spec.text.dom() }).ok, false);
});

test('P2 constants: independent Deeks correction and engine conventions', () => {
  const { ctx, spec } = fixture(), r = spec.text.results(), engine = source('shared/dta-bivariate.js');
  assert.equal(r.deeksCc, 0.5);
  assert.ok(engine.includes('tp += ' + r.deeksCc + '; fp += ' + r.deeksCc));
  assert.equal(r.chiSquare, Number(engine.match(/_R95 = Math.sqrt\(([\d.]+)\)/)[1]));
  assert.equal(r.aucGrid, Number(engine.match(/i <= (\d+); i\+\+\) full.push/)[1]));
  assert.ok(engine.includes('Math.max(' + r.aucMin + ','));
  assert.ok(engine.includes('Math.min(' + r.aucMax + ','));
  const text = ctx.AlmText.render(spec.text.templates, { ...r, ccAdd: 0.75 }, {});
  assert.match(text.methods.text, /For this test, 0.5 was added/);
});

test('P2 undo: snapshot original inputs and clear only the built-in example title', () => {
  const { spec, fields, snapshots } = fixture();
  spec.entry.apply(confirmed(parse(original)).slice(1));
  assert.deepEqual(snapshots, [{ data: original, title: 'Example SROC - diagnostic test' }]);
  assert.equal(fields['f-title'].value, '');
  fields['f-title'].value = 'Custom title';
  spec.entry.apply(confirmed(parse(original)));
  assert.equal(fields['f-title'].value, 'Custom title');
});

test('P2 refit PLANTED: new-data gate catches a missing Run click that the old unchanged-data gate misses', () => {
  const { ctx, spec, fields } = fixture(), before = ctx.__almBivariate();
  const click = fields['btn-run'].click;
  fields['btn-run'].click = () => {};
  spec.entry.apply(confirmed(parse(original)));
  assert.equal(ctx.__almBivariate().sens, before.sens, 'old gate accepts the planted defect');
  const rows = confirmed(parse(original)).slice(1);
  const expected = ctx.AlmDTABivariate.fit(rows, { method: 'reml', correctionControl: 'all' });
  const gate = () => ['sens', 'spec', 'dor'].forEach(key => assert.ok(
    Math.abs(ctx.__almBivariate()[key] - expected[key]) / Math.abs(expected[key]) <= 1e-9, 'refitted ' + key));
  spec.entry.apply(rows);
  assert.throws(gate, /refitted/, 'new gate fails on the planted missing refit');
  fields['btn-run'].click = click;
  spec.entry.apply(rows);
  gate();
  assert.ok(Math.abs(ctx.__almBivariate().sens - before.sens) > 1e-6);
});
