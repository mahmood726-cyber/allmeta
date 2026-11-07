import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('proportion-ma/index.html');
const app = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('function snapshot()'));
assert.ok(app, 'load the actual proportion-ma application script');
const studies = '10,100,A\n20,100,B';

// Only DOM/widgets are stand-ins: execute the actual app, pooling core,
// lifecycle, URL state and reset/undo module without a browser.
function element(id = '') {
  const listeners = new Map();
  return {
    id, value: '', innerHTML: '', textContent: '', hidden: true,
    disabled: false, style: {}, attributes: {},
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    fire(type) {
      for (const handler of listeners.get(type) || []) handler({ target: this });
    },
    setAttribute(key, value) { this.attributes[key] = value; },
    appendChild() {},
    matches(selector) { return selector.split(',').some(s => s.trim() === '#' + id); },
  };
}

function harness({ src = studies, trans = 'logit', tau = 'PM', urlState } = {}) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(match => [match[1], element(match[1])]));
  const get = id => {
    assert.ok(elements.has(id), 'known DOM element: ' + id);
    return elements.get(id);
  };
  get('src').value = src;
  get('trans').value = trans;
  get('tau-est').value = tau;
  const undo = element(), clear = element(), dialog = element();
  let opened = false;
  dialog.showModal = () => { opened = true; };
  get('alm-undo-mount').querySelector = selector => {
    const child = {
      'button[data-action="undo"]': undo,
      'button[data-action="clear"]': clear,
      dialog,
    }[selector];
    assert.ok(child, 'known reset/undo selector: ' + selector);
    return child;
  };
  const document = {
    head: element(), createElement: () => element(),
    getElementById: get,
    querySelector: selector => get(selector.slice(1)),
    querySelectorAll: selector => selector.split(',').map(s => get(s.trim().slice(1))),
    addEventListener() {},
  };
  let resultsExport, plotExport;
  const window = { location: { hash: '' }, alm: {
    csvUpload() {}, axisControls() {}, tooltips() {},
    resultsExport(options) { resultsExport = options; },
    plotExport(options) { plotExport = options; },
  } };
  const context = vm.createContext({
    window, document, console,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
  });
  for (const path of ['shared/ma-core.js', 'hub/shared/analysis-lifecycle.js',
    'hub/shared/url-state.js', 'hub/shared/reset-undo.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  if (urlState) window.alm.urlState.write(urlState);
  vm.runInContext(app, context, { filename: 'proportion-ma/index.html:inline' });
  const plain = value => JSON.parse(JSON.stringify(value));
  return {
    get, window, undo,
    results: () => plain(resultsExport.getResults()),
    receipt: () => plain(plotExport.getReceiptInput()),
    inputs: () => ({ src: get('src').value, trans: get('trans').value, tau: get('tau-est').value }),
    state() {
      return {
        inputs: this.inputs(), results: this.results(), receipt: this.receipt(),
        validation: plain(window.__almPropValidation.snapshot()),
        table: get('res-body').innerHTML, het: get('het').innerHTML,
        forest: get('forest').innerHTML,
        updatedHidden: get('analysis-status').hidden,
        staleHidden: get('analysis-stale').hidden,
      };
    },
    closeClear(value) {
      clear.fire('click');
      assert.equal(opened, true, 'Clear all opens the confirmation dialog');
      opened = false;
      dialog.returnValue = value;
      dialog.fire('close'); // real reset-undo confirmation handler
    },
    run: () => window.__almPropValidation.run(),
  };
}

function assertPopulated(h) {
  assert.equal(h.results().k, 2);
  assert.match(h.get('res-body').innerHTML, /Pooled/);
  assert.notEqual(h.get('het').innerHTML, '');
  assert.match(h.get('forest').innerHTML, /<polygon/);
  assert.equal(h.get('analysis-status').hidden, false);
}

function assertRefused(h) {
  assert.match(h.get('res-body').innerHTML, /Need at least 2 studies\./);
  assert.equal(h.results(), null, 'old results cannot be exported');
  assert.equal(h.receipt(), null, 'old results cannot enter a plot receipt');
  assert.equal(h.window.__almPropValidation.snapshot(), null);
  assert.equal(h.get('het').innerHTML, '', 'old heterogeneity is removed');
  assert.equal(h.get('forest').innerHTML, '', 'old forest is removed');
  assert.equal(h.get('k-warn').style.display, 'none');
  assert.equal(h.get('analysis-status').hidden, true);
  assert.equal(h.get('analysis-stale').hidden, true);
}

for (const options of [{ trans: 'logit', tau: 'PM' }, { trans: 'ft', tau: 'DL' }]) {
  test(`P09-R8 plant: confirmed Clear all empties input and results (${options.trans}/${options.tau})`, () => {
    const h = harness(options);
    assertPopulated(h);
    assert.equal(h.undo.disabled, true);
    h.closeClear('confirm');
    assert.deepEqual(h.inputs(), { src: '', trans: 'logit', tau: 'PM' });
    assertRefused(h);
    assert.equal(h.window.alm.resetUndo.size(), 1);
    assert.equal(h.undo.disabled, false);
  });
}

for (const [name, src] of [['empty', ''], ['one study', '10,100,A']]) {
  test(`P09-R8 plant: ${name} refusal removes previous visual results`, () => {
    const h = harness({ tau: 'DL' });
    assertPopulated(h);
    assert.equal(h.get('k-warn').style.display, 'block');
    h.get('src').value = src;
    h.run();
    assertRefused(h);
  });
}

test('P09-R8 control: Undo after Clear all restores exact inputs, settings and results', () => {
  const h = harness({ trans: 'raw', tau: 'FE' });
  assertPopulated(h);
  const before = h.state();
  h.closeClear('confirm');
  // Distinct edits ensure restoration is exercised even on the defective code.
  h.get('src').value = '30,100,C\n40,100,D';
  h.get('trans').value = 'ft';
  h.get('tau-est').value = 'DL';
  h.run();
  assert.notDeepEqual(h.results(), before.results);
  h.undo.fire('click');
  assert.deepEqual(h.state(), before);
  assert.equal(h.window.alm.resetUndo.size(), 0);
  assert.equal(h.undo.disabled, true);
});

test('P09-R8 control: cancelling Clear all leaves data, results and undo history intact', () => {
  const h = harness({ trans: 'ft', tau: 'DL' });
  assertPopulated(h);
  const before = h.state();
  h.closeClear('cancel');
  assert.deepEqual(h.state(), before);
  assert.equal(h.window.alm.resetUndo.size(), 0);
  assert.equal(h.undo.disabled, true);
});

test('P09-R8 control: a partial nonempty restore preserves unspecified settings', () => {
  const h = harness({ trans: 'raw', tau: 'FE', urlState: { src: '30,100,C\n40,100,D' } });
  assertPopulated(h);
  assert.deepEqual(h.inputs(), { src: '30,100,C\n40,100,D', trans: 'raw', tau: 'FE' });
  assert.equal(h.results().transform, 'raw');
  assert.equal(h.results().tauEstimator, 'FE');
});
