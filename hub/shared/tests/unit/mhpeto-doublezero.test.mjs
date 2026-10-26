import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../../../../mh-peto/index.html', import.meta.url), 'utf8');
const reference = JSON.parse(readFileSync(new URL('../../../../mh-peto/validate/corpus/reference.json', import.meta.url), 'utf8'));
const script = html.match(/<script>\s*(\(function \(\) \{[\s\S]*?)<\/script>/)[1];
// Execute the actual parser, engine, renderers and export hooks. Only shared-widget
// initialization is omitted; a real-browser run is still needed for those widgets.
const appScript = script.slice(0, script.indexOf('    // ---- module init ----')) + '\n})();';
function setup(text, measure = 'OR') {
  const nodes = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    innerHTML: '', textContent: '', hidden: true, value: '', checked: false,
    events: {}, addEventListener(type, fn) { this.events[type] = fn; },
    setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; },
  }]));
  const window = { alm: { analysisLifecycle: fn => fn } };
  const document = { getElementById: id => nodes[id], querySelector: () => null, querySelectorAll: () => [] };
  runInNewContext(appScript, { window, document, _axisState: null });
  const run = (input = text, selected = measure) => {
    nodes.src.value = input;
    nodes.measure.value = selected;
    window.__mhValidation.run();
    return window._almLastMhPeto();
  };
  const result = run();
  return { window, nodes, run, result };
}

// Deliberately synthetic tables: opposite effects plus a double-zero table.
const control = 'A,1,100,10,100\nB,10,100,1,100';
const affected = control + '\nZero,0,100,0,100';
const close = (a, b) => assert.ok(a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))), `${a} != ${b}`);

test('control: existing example statistics still match the untouched metafor reference for OR/RR/RD', () => {
  const app = setup(control);
  app.nodes['btn-example'].events.click();
  const example = app.nodes.src.value;
  for (const measure of ['OR', 'RR', 'RD']) {
    const r = app.run(example, measure);
    const ref = reference.find(x => x.id === 'dat.yusuf1985|binary|6|' + measure);
    assert.ok(ref);
    for (const [key, field] of [['mh_est', 'est'], ['mh_QE', 'QE'], ['mh_QEp', 'QEp'], ['mh_I2', 'I2'], ['mh_H2', 'H2']]) close(r[key], ref[field]);
  }
});

test('control: double-zero retention changes MH heterogeneity but not the raw OR estimate or Peto', () => {
  const base = setup(control).result, retained = setup(affected).result;
  close(retained.mh_est, base.mh_est);
  close(retained.mh_QE, base.mh_QE); // balanced zero table has log OR = 0 = pooled log OR
  assert.equal(retained.mh_Q_df, base.mh_Q_df + 1);
  assert.ok(retained.mh_I2 < base.mh_I2);
  for (const key of ['peto_est', 'peto_QE', 'peto_QEp', 'peto_I2', 'peto_H2', 'peto_Q_df']) close(retained[key], base[key]);
});

for (const measure of ['OR', 'RR']) {
  test(`${measure}: planted double-zero input is warned beside the labelled heterogeneity row; clean control is not`, () => {
    const app = setup(affected, measure);
    assert.match(app.nodes['het-body'].innerHTML, /retained-table convention/);
    assert.match(app.nodes['het-body'].innerHTML, /k = 3/);
    assert.equal(app.nodes['het-warning']?.hidden, false);
    assert.match(app.nodes['het-warning'].textContent, /1 table.*no events.*both groups/);
    assert.match(app.nodes['het-warning'].textContent, /I².*lower/);
    assert.match(app.nodes['het-warning'].textContent, /default.*exclu/i);
    const clean = app.run(control, measure);
    assert.equal(app.nodes['het-warning'].hidden, true);
    assert.equal(app.nodes['het-warning'].textContent, '');
    assert.equal(clean.mh_heterogeneity_warning, '');
  });
}

test('controls: a single-zero table and RD do not get the OR/RR double-zero warning', () => {
  for (const [text, measure] of [[control + '\nSingle,0,100,3,100', 'OR'], [affected, 'RD']]) {
    const app = setup(text, measure);
    assert.notEqual(app.nodes['het-warning']?.hidden, false);
    assert.ok(Number.isFinite(app.result.mh_est));
  }
});

test('both-all-event tables are also disclosed, with the actual retained study count', () => {
  const app = setup(affected + '\nAll,50,50,70,70');
  assert.equal(app.nodes['het-warning']?.hidden, false);
  assert.match(app.nodes['het-warning'].textContent, /2 tables.*no events.*no non-events/);
  assert.equal(app.result.mh_Q_k, 4);
  assert.equal(app.result.mh_Q_df, 3);
});

test('result export carries the convention, k and the same warning as the visible results', () => {
  const app = setup(affected);
  assert.match(app.result.mh_heterogeneity_convention ?? '', /retained-table convention.*drop00 = FALSE/);
  assert.equal(app.result.mh_Q_k, 3);
  assert.equal(app.result.peto_Q_k, 2);
  assert.ok(app.result.mh_heterogeneity_warning);
  assert.equal(app.result.mh_heterogeneity_warning, app.nodes['het-warning'].textContent);
});

test('leave-one-out labels I2 and CSV discloses the convention for each remaining study set', () => {
  const app = setup(affected);
  app.window.__mhPetoLoo.run();
  assert.match(app.nodes['loo-head'].innerHTML, /MH OR I&sup2;.*retained tables/);
  const lines = app.window.__mhPetoLoo.csv().trim().split('\n');
  assert.equal(lines.length, 5);
  assert.match(lines[1], /MH heterogeneity: retained-table convention.*k = 3/);
  assert.match(lines[2], /MH heterogeneity: retained-table convention.*k = 2/);
  assert.match(lines[2], /I².*lower/);
  // Omitting the only double-zero row clears the warning, retaining the policy label.
  assert.match(lines[4], /MH heterogeneity: retained-table convention.*k = 2/);
  assert.doesNotMatch(lines[4], /I².*lower/);
});

test('self-checking R export carries the disclosure and preserves the numerical convention', () => {
  const app = setup(affected);
  const r = app.window.__mhPetoRScript();
  assert.match(r, /# MH heterogeneity: retained-table convention.*k = 3/);
  assert.match(r, /# .*I².*lower/);
  assert.match(r, /drop00 = c\(FALSE, FALSE\), correct = FALSE/);
  assert.match(r, /drop00 = TRUE/);
});

test('invalid and insufficient input clear the warning and exports; re-analysis restores them', () => {
  const app = setup(affected);
  assert.equal(app.nodes['het-warning']?.hidden, false);
  for (const bad of ['A,1.5,100,2,100\nB,1,100,1,100', 'A,1,100,2,100', '']) {
    assert.equal(app.run(bad), null);
    assert.equal(app.nodes['het-warning'].hidden, true);
    assert.equal(app.nodes['het-warning'].textContent, '');
  }
  app.run(affected);
  assert.equal(app.nodes['het-warning'].hidden, false);
  app.run(affected, 'RD');
  assert.equal(app.nodes['het-warning'].hidden, true);
});

test('control: all double-zero input remains not estimable, never numeric heterogeneity', () => {
  const app = setup('ZeroA,0,10,0,10\nZeroB,0,12,0,9');
  assert.equal(app.result.mh_est, null);
  assert.equal(app.result.mh_QE, null);
  assert.equal(app.result.peto_QE, null);
  assert.equal((app.nodes['het-body'].innerHTML.match(/not-estimable/g) || []).length, 2);
});
