import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('dose-response-ma/index.html');
const pageScript = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .find(([, attrs, code]) => !/\bsrc\s*=/.test(attrs) && code.includes('function analyse()'))[2];
const plain = value => JSON.parse(JSON.stringify(value));
const cells = [
  ['1', 0, 20, 100, 0, '', 'cc'],
  ['1', 10, 25, 100, 0.2, 0.2, 'cc'],
  ['1', 20, 30, 100, 0.4, 0.25, 'cc'],
  ['2', 0, 30, 120, 0, 0, 'cc'],
  ['2', 10, 35, 120, 0.1, 0.22, 'cc'],
  ['2', 20, 40, 120, 0.3, 0.27, 'cc']
];
const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
const csv = (rows = cells, allQuoted = false) => '# study,dose,cases,n,logRR,SE,type,covariate\n' +
  rows.map(row => row.map(value => allQuoted || /[,"\r\n]/.test(String(value)) ? quote(value) : value).join(',')).join('\n');
const expectedRows = (rows = cells) => {
  const groups = new Map();
  for (const [label, dose, cases, n, logrr, se, type, mod] of rows) {
    if (!groups.has(label)) groups.set(label, { rows: [], mod: null });
    const group = groups.get(label);
    if (mod !== undefined && mod !== '') group.mod = Number(mod);
    group.rows.push({ dose, cases, n, logrr, se: se === '' ? null : se, type: (type || 'cc').toLowerCase() });
  }
  return [...groups.values()].flatMap((group, i) => group.rows.map(row => ({ ...row, id: i + 1, mod: group.mod })));
};

// Execute the shipped page handler, parser, engine and adapter without a browser.
// Only DOM surfaces and unrelated export widgets are stubbed; fitting is real.
function harness() {
  const elements = new Map(), capture = new Map();
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    const listeners = new Map();
    elements.set(id, {
      id, value: '', checked: false, hidden: true, innerHTML: '', textContent: '', options: [],
      matches() { return id.startsWith('f-'); },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent(event) {
        const e = { type: event.type, target: this };
        for (const fn of capture.get(e.type) || []) fn(e);
        for (const fn of listeners.get(e.type) || []) fn(e);
        return true;
      }
    });
  }
  const get = id => { assert.ok(elements.has(id), 'unexpected DOM id: ' + id); return elements.get(id); };
  for (const [id, value] of Object.entries({ 'f-shape': 'linear', 'f-cov': 'gl', 'f-proc': '2stage', 'f-method': 'FE' })) get(id).value = value;
  get('f-method').options = ['REML', 'ML', 'MM', 'FE', 'PM', 'DL'].map(value => ({ value }));
  const document = {
    readyState: 'complete', getElementById: get,
    querySelectorAll() { return [...elements.values()].filter(el => el.id.startsWith('f-')); },
    addEventListener(type, fn) {
      if (!capture.has(type)) capture.set(type, []);
      capture.get(type).push(fn);
    }
  };
  const context = createContext({ document, Event: class { constructor(type) { this.type = type; } } });
  context.window = context;
  context.alm = { plotExport() {} };
  for (const path of ['shared/ma-core.js', 'shared/dose-response.js', 'hub/shared/analysis-lifecycle.js']) runInContext(read(path), context, { filename: path });
  runInContext(pageScript, context, { filename: 'dose-response-ma/index.html' });
  runInContext(read('dose-response-ma/validate/adapter.js'), context, { filename: 'dose-response-ma/validate/adapter.js' });
  return {
    get, window: context, live: context.AlmDoseValidate.live,
    fit(text) {
      get('f-data').value = text;
      get('btn-run').dispatchEvent({ type: 'click' });
      assert.ok(context._almLastDoseResponse(), get('msgs').innerHTML);
      return plain(context._almLastDoseResponse());
    }
  };
}

test('control P02-R1: ordinary CSV preserves all fitted rows and R data columns', () => {
  const h = harness();
  const result = h.fit(csv());
  const state = h.live.currentState();
  assert.equal(result.k, 2);
  assert.deepEqual(plain(state.rows), expectedRows());
  assert.deepEqual(plain(state.result), result);
  const script = h.live.buildScript(state);
  assert.ok(script.includes('id=c(1,1,1,2,2,2), dose=c(0,10,20,0,10,20)'));
  assert.ok(script.includes('se=c(NA_real_,0.2,0.25,0,0.22,0.27)'));
  assert.ok(script.includes('type=c("cc","cc","cc","cc","cc","cc")'));
});

test('plant P02-R1: quoting every CSV cell preserves the fit and live R input', () => {
  const h = harness();
  const ordinary = h.fit(csv());
  const control = h.live.currentState();
  const quoted = h.fit(csv(cells, true));
  assert.deepEqual(quoted, ordinary, 'the page accepts and fits equivalent quoted data');
  const state = h.live.currentState();
  assert.deepEqual(plain(state.rows), expectedRows());
  assert.deepEqual(plain(h.live.appValues(state)), plain(h.live.appValues(control)));
  assert.equal(h.live.buildScript(state), h.live.buildScript(control));
});

test('plant P02-R1: comma-containing study labels cannot shift live R columns', () => {
  const h = harness();
  const ordinary = h.fit(csv());
  const control = h.live.currentState();
  const labelled = cells.map(row => [row[0] === '1' ? 'Trial,1' : 'Trial,2', ...row.slice(1)]);
  const fitted = h.fit(csv(labelled));
  assert.deepEqual(fitted.beta, ordinary.beta);
  assert.deepEqual(fitted.predictions, ordinary.predictions);
  const state = h.live.currentState();
  assert.deepEqual(plain(state.rows), expectedRows(labelled));
  assert.equal(h.live.buildScript(state), h.live.buildScript(control));
});

test('plant P02-R1: validation snapshots the successful fit before a later input listener edits CSV', () => {
  const h = harness();
  h.fit(csv());
  h.get('f-data').addEventListener('input', () => {
    h.get('f-data').value = csv(cells.map(row => [row[0], row[1] + 50, ...row.slice(2)]));
  });
  const state = h.live.currentState();
  assert.deepEqual(plain(state.rows), expectedRows());
  assert.ok(h.live.buildScript(state).includes('dose=c(0,10,20,0,10,20)'));
});

test('control P02-R1: grouped study order, defaults and study-level moderators follow the fit', () => {
  const h = harness();
  h.get('f-mod').checked = true;
  const rows = cells.map((row, i) => [...row.slice(0, 6), i < 3 ? '' : 'CC', i === 1 ? -1 : i === 4 ? 2 : '']);
  const interleaved = [rows[3], rows[0], rows[4], rows[1], rows[5], rows[2]];
  h.fit(csv(interleaved));
  const state = h.live.currentState();
  assert.equal(state.result.metaRegression, true);
  assert.deepEqual(plain(state.rows), expectedRows(interleaved));
  assert.ok(h.live.buildScript(state).includes('moderator=c(2,2,2,-1,-1,-1)'));
});

test('control P02-R1: captured validation state survives subsequent edits and fits', () => {
  const h = harness();
  h.fit(csv());
  const state = h.live.currentState(), before = plain(state), script = h.live.buildScript(state);
  h.fit(csv(cells.map(row => [row[0], row[1] * 2, ...row.slice(2)])));
  assert.deepEqual(plain(state), before);
  assert.equal(h.live.buildScript(state), script);
  assert.notDeepEqual(plain(h.live.currentState().rows), before.rows);
});

test('control P02-R1: invalid input, excluded studies and PM/DL still refuse live validation', () => {
  const h = harness();
  for (const invalid of [csv().replace('0.2,0.2', 'bad,0.2'), csv(cells.slice(0, 3))]) {
    h.fit(csv());
    h.get('f-data').value = invalid;
    assert.throws(() => h.live.currentState(), /Enter data that the dose-response app can fit/);
    assert.equal(h.window._almLastDoseResponse(), null);
  }
  h.fit(csv());
  h.get('f-shape').value = 'quadratic';
  h.get('f-data').value = csv(cells.filter((_, i) => i !== 2));
  assert.throws(() => h.live.currentState(), /Enter data that the dose-response app can fit/);
  assert.match(h.get('msgs').innerHTML, /A two-stage fit needs at least 2 non-reference dose levels/);
  // The short quadratic study above is refused before any study is excluded.
  // A positive SE whose square underflows gives the real engine a second
  // zero-variance reference and exercises the separate excluded-study guard.
  h.get('f-shape').value = 'linear';
  h.get('f-data').value = csv(cells.map((row, i) => i === 1 ? [...row.slice(0, 5), 1e-200, ...row.slice(6)] : row));
  assert.throws(() => h.live.currentState(), /Enter data that the dose-response app can fit/);
  assert.match(h.get('msgs').innerHTML, /Excluded:/);
  h.get('f-shape').value = 'linear';
  for (const method of ['PM', 'DL']) {
    h.get('f-method').value = method;
    h.fit(csv());
    assert.throws(() => h.live.currentState(), /dosresmeta does not implement the selected PM\/DL estimator/);
  }
});
