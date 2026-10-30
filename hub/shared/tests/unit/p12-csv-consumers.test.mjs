import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load the actual page, CSV decoder, shared bus and live-validation adapter.
// Only DOM, storage and unrelated UI are simulated; Save/Load listeners are real.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../../../../limit-ma/index.html');
const csvSource = read('../../csv-upload.js');
const busSource = read('../../../../shared/ma-studies-v1.js');
const adapterSource = read('../../../../limit-ma/validate/adapter.js');
const plain = value => JSON.parse(JSON.stringify(value));
const studies = [
  { yi: 0.1, sei: 0.1, study: 'A' },
  { yi: 0.2, sei: 0.2, study: 'B' },
  { yi: -0.1, sei: 0.15, study: 'C' },
  { yi: 0.3, sei: 0.25, study: 'D' },
];
const busRows = rows => rows.map(r => ({ label: r.study, est: r.yi, se: r.sei,
  moderator: null, group: null, year: null, measure: null }));
const pageRows = rows => rows.map(r => ({ label: r.study, te: r.yi, se: r.sei }));
const csv = rows => 'yi,sei,study\r\n' + rows.map(r =>
  `${r.yi},${r.sei},"${r.study.replace(/"/g, '""')}"`).join('\r\n');

function load() {
  const nodes = {};
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    const listeners = new Map();
    nodes[match[1]] = { value: '', innerHTML: '', textContent: '', parentNode: {},
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
      click() { this.dispatchEvent({ type: 'click' }); },
      setAttribute() {},
    };
  }
  nodes.src.value = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const document = { getElementById: id => nodes[id],
    querySelector: selector => nodes[selector.slice(1)] || null, querySelectorAll: () => [] };
  const store = new Map(), messages = [];
  const noop = () => {};
  const window = { document, structuredClone, Event,
    localStorage: { getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) },
    Toast: { show: (message, kind) => messages.push({ message, kind }) },
    AlmValidate: { mount: (_target, adapter) => adapter },
    alm: { analysisLifecycle: run => run, plotExport: noop,
      axisControls: noop, resultsExport: noop, resetUndo: noop, tooltips: noop,
      urlState: Object.assign(noop, { read: () => null }) },
  };
  window.window = window;
  const context = vm.createContext(window);
  vm.runInContext(busSource, context, { filename: 'ma-studies-v1.js' });
  vm.runInContext(csvSource, context, { filename: 'csv-upload.js' });
  const decode = window.alm.csvUpload.parse;
  let options;
  window.alm.csvUpload = Object.assign(value => { options = value; }, { parse: decode });
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context,
    { filename: 'limit-ma/index.html' });
  vm.runInContext(adapterSource, context, { filename: 'limit-ma/validate/adapter.js' });
  return { window, nodes, messages,
    import(rows) {
      const decoded = decode(csv(rows), options.columns);
      assert.deepEqual(plain(decoded.rows), rows);
      assert.deepEqual(plain(decoded.warnings), []);
      options.onParse(decoded);
      assert.equal(window._almLastLimit()?.k, rows.length);
    },
    saved() { return plain(window.MaStudies.read()); },
    live() { return plain(window.AlmLimitValidationAdapter.live.currentState()); },
  };
}

const cases = [
  ['control: ordinary labels', 'A'],
  ['plant: literal quotes', 'Trial "A"'],
  ['plant: comma', 'Trial A, subgroup B'],
  ['plant: numeric newline', 'Trial A\n9,0.2,Injected'],
  ['plant: ordinary multiline label', 'Trial A\ncontinued'],
  ['plant: quotes, CRLF and blank lines', 'Trial "A"\r\n\r\n9,0.2,"Injected"'],
];
for (const [name, label] of cases) {
  const rows = studies.map((r, i) => i === 0 ? { ...r, study: label } : r);
  test(`P12 consumers Save ${name}: preserves exact bus records`, () => {
    const h = load(); h.import(rows);
    h.nodes['btn-bus-save'].click();
    assert.deepEqual(h.saved(), busRows(rows));
    const stored = JSON.parse(h.window.localStorage.getItem('ma-studies-v1'));
    assert.equal(stored._schema, 'ma-studies-v1');
    assert.deepEqual(stored.studies, busRows(rows));
    assert.match(h.messages.at(-1)?.message || '', /Saved 4 studies/);
  });
  test(`P12 consumers Load ${name}: preserves exact page records`, () => {
    const h = load();
    assert.equal(h.window.MaStudies.write(busRows(rows)), true);
    h.nodes['btn-bus-load'].click();
    assert.equal(h.window._almLastLimit()?.k, 4);
    assert.deepEqual(plain(h.window.__almLimitParse(h.nodes.src.value)), pageRows(rows));
  });
  test(`P12 consumers live R ${name}: exact arrays and count match the page`, () => {
    const h = load(); h.import(rows);
    const state = h.live();
    assert.deepEqual(state.te, rows.map(r => r.yi));
    assert.deepEqual(state.se, rows.map(r => r.sei));
    const values = Object.fromEntries(state.values.map(v => [v.key, v.value]));
    assert.equal(values.k, rows.length);
    assert.equal(state.values.filter(v => v.key.startsWith('te_limit.')).length, rows.length);
    assert.equal(h.window._almLastLimit().k, rows.length);
    const script = h.window.AlmLimitValidationAdapter.live.buildScript(state);
    assert.match(script, /te <- c\(0\.1,0\.2,-0\.1,0\.3\); se <- c\(0\.1,0\.2,0\.15,0\.25\)/);
    assert.doesNotMatch(script, /Injected|continued|Trial/);
  });
}

test('P12 consumers control: Save and live R read pending input, not stale results', () => {
  const h = load(); h.import(studies);
  const pending = studies.map((r, i) => i === 0 ? { yi: 0.6, sei: 0.11, study: 'Edited' } : r);
  h.nodes.src.value = pending.map(r => `${r.yi},${r.sei},${r.study}`).join('\n');
  h.nodes['btn-bus-save'].click();
  assert.deepEqual(h.saved(), busRows(pending));
  const state = h.live();
  assert.deepEqual(state.te, pending.map(r => r.yi));
  assert.deepEqual(state.se, pending.map(r => r.sei));
});

test('P12 consumers control: empty Save and Load leave existing data untouched', () => {
  const h = load(); h.import(studies); h.nodes['btn-bus-save'].click();
  const before = h.window.localStorage.getItem('ma-studies-v1');
  h.nodes.src.value = '';
  h.nodes['btn-bus-save'].click();
  assert.equal(h.window.localStorage.getItem('ma-studies-v1'), before);
  h.window.MaStudies.clear(); h.import(studies);
  const text = h.nodes.src.value;
  h.nodes['btn-bus-load'].click();
  assert.equal(h.nodes.src.value, text);
});

test('P12 consumers plant: malformed quoted record cannot partially overwrite the bus', () => {
  const h = load(); h.import(studies); h.nodes['btn-bus-save'].click();
  const before = h.window.localStorage.getItem('ma-studies-v1');
  h.nodes.src.value += '\n0.4,0.3,"unterminated';
  h.nodes['btn-bus-save'].click();
  assert.equal(h.window.localStorage.getItem('ma-studies-v1'), before);
  assert.match(h.messages.at(-1)?.message || h.nodes['limit-error'].textContent, /Line 5:.*unterminated/);
});

test('P12 consumers plant: live R accepts the page header and default-label records', () => {
  const h = load();
  h.nodes.src.value = '\r\neffect, SE, label\r\n0.1,0.1\r\n0.2,0.2\r\n-0.1,0.15\r\n0.3,0.25\r\n';
  const state = h.live();
  assert.deepEqual(state.te, studies.map(r => r.yi));
  assert.deepEqual(state.se, studies.map(r => r.sei));
  assert.equal(h.window._almLastLimit().k, 4);
});

test('P12 consumers control: live R refuses fewer than three rows and invalid SE', () => {
  const h = load();
  for (const text of ['', '0.1,0.1,A\n0.2,0.2,B', '0.1,0.1,A\n0.2,0.2,B\n0.3,0,C']) {
    h.nodes.src.value = text;
    assert.throws(() => h.live());
  }
});
