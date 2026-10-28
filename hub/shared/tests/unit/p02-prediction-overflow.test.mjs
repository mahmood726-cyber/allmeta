import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');
const html = source('dose-response-ma/index.html');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('var EXAMPLE ='));
const overflow = /prediction.*(?:overflow|non-finite|numeric range)/i;
const fields = ['dose', 'logRR', 'se', 'ciLo', 'ciHi', 'rr', 'rrLo', 'rrHi'];
const reference = JSON.parse(source('hub/shared/tests/unit/p02-prediction-reference.json'));

function engine() {
  const context = vm.createContext({});
  vm.runInContext(source('shared/dose-response.js'), context);
  return context.AlmDoseResponse;
}

function studies(slope = 0) {
  return [1, 2, 3].map(id => ({ id: String(id), mod: id - 2,
    rows: [0, 1, 2, 3].map(dose => ({ dose, cases: 20, n: 100,
      logrr: slope * dose, se: dose === 0 ? null : 0.1, type: 'cc' })) }));
}

function fit(opts = {}, slope = 0) {
  const result = engine().fitDR(studies(slope), {
    model: 'linear', covariance: 'indep', method: 'fixed', ...opts
  });
  assert.equal(result.ok, true, result.error);
  return result;
}

function finitePrediction(p) {
  for (const key of fields) assert.ok(Number.isFinite(p[key]), `${key}=${p[key]}`);
  const json = JSON.parse(JSON.stringify(p));
  for (const key of fields) assert.equal(json[key], p[key], `JSON ${key}`);
}

test('P02-R4 plant: finite 1e200 null-effect dose explicitly refuses prediction overflow', () => {
  const r = fit();
  assert.throws(() => r.predict([1e200], 0), overflow);
});

test('P02-R4 plant: finite log-scale uncertainty cannot silently overflow the RR interval', () => {
  const r = fit();
  // Unlike 1e200, the quadratic form is finite at this dose; exp(ciHi) still overflows.
  assert.throws(() => r.predict([1e6], 0), overflow);
});

test('P02-R4 plant: scaled uncertainty recovers a representable extreme prediction', () => {
  const r = fit({}, -0.4);
  const unit = r.predict([1], 0)[0], large = r.predict([1e200], 0)[0];
  finitePrediction(large);
  assert.ok(Math.abs(large.se / 1e200 - unit.se) < 1e-14);
  assert.ok(Math.abs(large.logRR / 1e200 - unit.logRR) < 1e-14);
  // Exponentiation underflows to finite zero here; the log-scale interval stays available.
  assert.equal(large.rrHi, 0);
});

for (const model of ['quadratic', 'rcs']) {
  test(`P02-R4 plant: ${model} basis overflow is explicitly refused`, () => {
    const r = fit({ model, knots: [0, 1, 3] });
    assert.throws(() => r.predict([1e200], 0), overflow);
  });
}

test('P02-R4 plant: overflowing reference contrast is explicitly refused', () => {
  assert.throws(() => fit().predict([1e308], -1e308), overflow);
});

test('P02-R4 plant: finite extreme moderator cannot publish non-finite uncertainty', () => {
  const r = fit({ mod: true });
  assert.throws(() => r.predict([1], 0, 1e200), overflow);
});

test('P02-R4 control: ordinary predictions and zero reference have finite JSON values', () => {
  for (const model of ['linear', 'quadratic', 'rcs']) {
    const r = fit({ model, knots: [0, 1, 3] });
    const predictions = r.predict([0, 1, 2], 0);
    predictions.forEach(finitePrediction);
    assert.equal(predictions[0].se, 0);
    assert.equal(predictions[0].rr, 1);
    assert.equal(predictions[0].rrLo, 1);
    assert.equal(predictions[0].rrHi, 1);
    assert.ok(predictions[1].se > 0);
  }
});

test('P02-R4 control: finite nonzero reference and moderator predictions remain usable', () => {
  for (const mod of [false, true]) {
    const predictions = fit({ mod }).predict([0, 1, 2], 1, 1);
    predictions.forEach(finitePrediction);
    assert.equal(predictions[1].se, 0);
    assert.equal(predictions[1].rr, 1);
  }
});

for (const extreme of [false, true]) {
  test(`P02-R4 ${extreme ? 'plant: extreme' : 'control: ordinary'} predictions match recorded R GLS values`, () => {
    const r = fit({}, -0.4);
    const close = (actual, expected, label) => assert.ok(
      Number.isFinite(actual) && Math.abs(actual - expected) <= Math.max(1e-15, 1e-12 * Math.abs(expected)),
      `${label}: actual ${actual}, R ${expected}`);
    close(r.coef[0], reference.coef, 'coef');
    close(r.vcov[0][0], reference.vcov, 'vcov');
    for (const expected of reference.predictions.filter(p => (p.dose > 1e100) === extreme)) {
      const actual = r.predict([expected.dose], 0)[0];
      for (const field of fields) close(actual[field], expected[field], `${expected.dose} ${field}`);
    }
  });
}

// Minimal DOM for the actual inline app, lifecycle, and JSON exporter. No browser or files
// are created by downloads. The harness changes inputs and dispatches the app's run button.
function app() {
  class Element {
    constructor(id = '') {
      this.id = id; this.value = ''; this.checked = false; this.hidden = false;
      this.listeners = {}; this.children = []; this.markup = ''; this.options = [];
    }
    set innerHTML(value) { this.markup = value; this.children = []; }
    get innerHTML() { return this.markup; }
    set textContent(value) { this.innerHTML = value; }
    get textContent() { return this.markup; }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    setAttribute(key, value) { this[key] = value; }
    appendChild(child) { this.children.push(child); }
    removeChild(child) { this.children = this.children.filter(c => c !== child); }
    querySelector(selector) {
      if (selector === '[data-export-error]') return this.children.find(c => 'data-export-error' in c) || null;
      const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
      if (action) {
        this.buttons ||= {};
        return this.buttons[action] ||= new Element(action);
      }
      return null;
    }
    closest(selector) { return selector === 'button' ? this : null; }
    click() {}
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  const document = {
    head: new Element(), body: new Element(), readyState: 'complete',
    getElementById: id => elements[id], createElement: () => new Element(),
    querySelector: selector => elements[selector.slice(1)] || null,
    querySelectorAll: () => Object.values(elements).filter(e => e.id.startsWith('f-')),
    addEventListener() {}
  };
  for (const [id, value] of Object.entries({ 'f-shape': 'linear', 'f-proc': '2stage',
    'f-method': 'FE', 'f-cov': 'indep' })) elements[id].value = value;
  elements['f-method'].options = ['REML', 'ML', 'MM', 'FE', 'PM', 'DL'].map(value => ({ value }));
  const downloads = [];
  const context = vm.createContext({ document, Blob, console, setTimeout() {},
    URL: { createObjectURL(blob) { downloads.push(blob); return 'blob:test'; }, revokeObjectURL() {} } });
  context.window = context;
  context.alm = { plotExport() {} };
  for (const path of ['shared/ma-core.js', 'shared/dose-response.js',
    'hub/shared/analysis-lifecycle.js', 'hub/shared/results-export.js']) {
    vm.runInContext(source(path), context, { filename: path });
  }
  vm.runInContext(script, context, { filename: 'dose-response-ma/index.html' });
  function run(values = {}) {
    for (const [id, value] of Object.entries(values)) elements[id].value = value;
    for (const listener of elements['btn-run'].listeners.click) listener();
  }
  // Null-effect data make the finite 1e200 dose reproduce the reported RR=1 / infinite SE.
  elements['f-data'].value = studies().flatMap(s => s.rows.map(row =>
    [s.id, row.dose, row.cases, row.n, row.logrr, row.se ?? '', row.type].join(','))).join('\n');
  run({ 'f-pdoses': '1, 2', 'f-xref': '0' });
  return { elements, run, result: () => context._almLastDoseResponse(), downloads,
    async jsonExport() {
      const mount = elements['alm-export-mount'], button = mount.querySelector('[data-action="json"]');
      const event = { target: button, stopped: false, preventDefault() {}, stopImmediatePropagation() { this.stopped = true; } };
      for (const listener of mount.listeners.click) listener(event);
      if (!event.stopped) for (const listener of button.listeners.click) await listener(event);
    } };
}

for (const method of ['FE', 'PM', 'DL']) {
  test(`P02-R4 plant: ${method} UI clears results and blocks export after prediction overflow`, async () => {
    const a = app();
    a.run({ 'f-method': method, 'f-cov': method === 'FE' ? 'indep' : 'gl' });
    assert.ok(a.result(), 'ordinary-dose setup must fit');
    assert.equal(a.elements['analysis-status'].hidden, false);
    a.run({ 'f-pdoses': '1, 1e200' });
    assert.equal(a.result(), null, 'overflow must not become an exportable successful analysis');
    assert.match(a.elements.msgs.innerHTML, overflow);
    assert.equal(a.elements['analysis-status'].hidden, true);
    for (const id of ['headline', 'pred-body', 'curve-host', 'resid-host']) assert.equal(a.elements[id].innerHTML, '');
    await a.jsonExport();
    assert.equal(a.downloads.length, 0);
    a.run({ 'f-pdoses': '1, 2' });
    assert.ok(a.result(), 'correcting the doses must restore a valid result');
    assert.equal(a.elements['analysis-status'].hidden, false);
  });

  test(`P02-R4 control: ${method} ordinary-dose table and JSON export agree`, async () => {
    const a = app();
    a.run({ 'f-method': method, 'f-cov': method === 'FE' ? 'indep' : 'gl' });
    const result = a.result();
    assert.ok(result, a.elements.msgs.innerHTML);
    assert.equal(result.method, method);
    assert.equal(a.elements['analysis-status'].hidden, false);
    for (const p of result.predictions) {
      for (const key of ['dose', 'rr', 'lo', 'hi', 'logRR', 'se']) assert.ok(Number.isFinite(p[key]), key);
      assert.ok(a.elements['pred-body'].innerHTML.includes(p.hi.toFixed(3)));
    }
    await a.jsonExport();
    assert.equal(a.downloads.length, 1);
    const exported = JSON.parse(await a.downloads[0].text());
    assert.deepEqual(exported.predictions, JSON.parse(JSON.stringify(result.predictions)));
  });
}
