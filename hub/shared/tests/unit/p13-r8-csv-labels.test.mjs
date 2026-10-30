import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('gosh/index.html');
const appScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).find(script => script.includes('// ---- engine ----'));
assert.ok(appScript, 'load the actual GOSH app script, without replacing its importer or engine');

const good = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';
const csv = label => 'yi,sei,study\n0.1,0.2,"' + label.replace(/"/g, '""') + '"\n0.2,0.3,B\n0.3,0.4,C';

// Only the DOM and unrelated UI modules are substituted. CSV parsing, its paste
// handler, GOSH loading/analysis/rendering, lifecycle and JSON export run as shipped.
function harness(model = 'FE') {
  class Element {
    constructor(id = '') {
      this.id = id;
      this.style = {};
      this.hidden = false;
      this.textContent = '';
      this.innerHTML = '';
      this.children = new Map();
      this.listeners = new Map();
      this.value = '';
    }
    set value(value) { this._value = String(value).replace(/\r\n?/g, '\n'); }
    get value() { return this._value; }
    querySelector(selector) {
      if (!this.children.has(selector)) this.children.set(selector, new Element());
      return this.children.get(selector);
    }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    click() { return this.listeners.get('click')?.(); }
    appendChild() {}
    removeChild() {}
    setAttribute(name, value) { this[name] = value; }
  }
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  const document = {
    getElementById: el,
    querySelector: selector => el(selector.slice(1)),
    querySelectorAll: selector => selector.split(',').map(id => el(id.trim().slice(1))),
    createElement: () => new Element(),
    addEventListener() {},
    head: new Element(),
    body: new Element(),
  };
  el('src').value = good;
  el('model').value = model;
  el('n-sample').value = '5000';
  const noop = () => {};
  const urlState = Object.assign(noop, { read: () => null, isSuspended: () => true });
  const window = { alm: { plotExport: noop, axisControls: noop, resetUndo: noop, tooltips: noop, urlState } };
  let exportedBlob;
  const context = vm.createContext({ window, document, console, Blob,
    // File reads preserve raw CR/CRLF, whereas a textarea normalizes them to LF.
    FileReader: class {
      readAsText(file) { this.result = file.text; this.onload(); }
    },
    URL: { createObjectURL(blob) { exportedBlob = blob; return 'blob:test'; }, revokeObjectURL() {} },
    setTimeout: fn => fn(),
  });
  for (const path of ['hub/shared/csv-upload.js', 'hub/shared/results-export.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(appScript, context, { filename: 'gosh/index.html' });
  return {
    el, window,
    importCSV(text) {
      const mount = el('alm-csv-mount');
      mount.querySelector('textarea').value = text;
      mount.querySelector('[data-action="parse-paste"]').click();
    },
    importFile(text) {
      const input = el('alm-csv-mount').querySelector('input[type="file"]');
      input.files = [{ text }];
      input.listeners.get('change')();
    },
    async exportJSON() {
      await el('alm-export-mount').querySelector('[data-action="json"]').click();
      assert.ok(exportedBlob, 'the real JSON click handler produced a download');
      return JSON.parse(await exportedBlob.text());
    },
    result: () => JSON.parse(JSON.stringify(window._almLastGosh())),
  };
}

function assertRefused(h) {
  assert.equal(h.result(), null, 'a multiline label must not produce an analysis');
  assert.match(h.el('input-error').textContent, /label.*single.line/i, 'explain how to correct the label');
  assert.equal(h.el('src').value, '', 'do not leave poisoned or stale input available for rerun');
  assert.equal(h.el('plot').innerHTML, '');
  for (const id of ['m-n', 'm-est', 'm-i2']) assert.equal(h.el(id).textContent, '\u2014');
  assert.equal(h.el('analysis-status').hidden, true);
}

test('control: RFC-4180 parsing preserves three records and the quoted multiline label', () => {
  const h = harness();
  for (const newline of ['\n', '\r\n', '\r']) {
    const label = 'A' + newline + '10,0.1,phantom';
    const parsed = h.window.alm.csvUpload.parse(csv(label), [
      { name: 'yi', type: 'float' }, { name: 'sei', type: 'float' }, { name: 'study', type: 'string' },
    ]);
    assert.equal(parsed.rows.length, 3);
    assert.equal(parsed.rows[0].study, label);
    assert.equal(parsed.rows[0].yi, 0.1);
    assert.equal(parsed.rows[0].sei, 0.2);
    assert.equal(parsed.warnings.length, 0);
  }
});

for (const model of ['FE', 'DL']) {
  for (const [name, newline] of [['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']]) {
    test(`plant P13-R8: ${model} quoted ${name} label cannot inject a study or JSON result`, async t => {
      const h = harness(model);
      assert.equal(h.result().k, 3);
      const controlMedian = h.result().median_est;
      h.importCSV(csv('A' + newline + '10,0.1,phantom'));
      const result = h.result();
      const exported = await h.exportJSON();
      t.diagnostic(JSON.stringify({ model, newline: name, controlMedian,
        observed: result && { k: result.k, n_subsets: result.n_subsets, median_est: result.median_est, studies: result.studies },
        exported: exported && { k: exported.k, n_subsets: exported.n_subsets, median_est: exported.median_est } }));
      assertRefused(h);
      assert.equal(exported, null, 'refused input must not export phantom or previous results');
      h.el('btn-run').click();
      assert.equal(h.result(), null, 'rerun cannot reinterpret the refused label');
      h.importCSV(csv('A'));
      assert.equal(h.result().k, 3, 'corrected CSV recovers');
      assert.equal(h.result().n_subsets, 7);
      assert.equal(h.result().median_est, controlMedian);
    });
  }
  test(`control: ${model} single-line quoted labels preserve data, all seven subsets and JSON`, async () => {
    const h = harness(model);
    const expected = h.result();
    for (const label of ['A', 'A "quoted"', 'A\\n10', 'A\\r\\n10']) {
      h.importCSV(csv(label));
      expected.studies[0].label = label;
      assert.equal(h.el('input-error').textContent, '');
      assert.equal(h.el('m-n').textContent, '7');
      assert.equal((h.el('plot').innerHTML.match(/<circle /g) || []).length, 7);
      assert.equal(h.el('analysis-status').hidden, false);
      assert.deepEqual(h.result(), expected);
      assert.deepEqual(await h.exportJSON(), expected);
    }
  });
}

for (const alias of ['study', 'label', 'Study']) {
  test(`plant P13-R8: direct loader refuses multiline ${alias} before line-based conversion`, async () => {
    const h = harness();
    h.window.__almGoshLoad([
      { yi: 0.1, sei: 0.2, [alias]: 'A\n10,0.1,phantom' },
      { yi: 0.2, sei: 0.3, [alias]: 'B' },
      { yi: 0.3, sei: 0.4, [alias]: 'C' },
    ]);
    assertRefused(h);
    assert.equal(await h.exportJSON(), null);
  });
}

test('control: direct imports retain variance, SE and label aliases', () => {
  const h = harness();
  const expected = h.result();
  for (const alias of ['study', 'label', 'Study']) {
    h.window.__almGoshLoad([
      { effect: 0.1, vi: 0.2 * 0.2, [alias]: 'A' },
      { TE: 0.2, SE: 0.3, [alias]: 'B' },
      { te: 0.3, se: 0.4, [alias]: 'C' },
    ]);
    assert.deepEqual(h.result(), expected);
  }
});

for (const model of ['FE', 'DL']) {
  for (const [name, newline] of [['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']]) {
    test(`plant P13-R8: ${model} file upload refuses raw ${name} in a quoted label`, async () => {
      const h = harness(model);
      const expected = h.result();
      h.importFile(csv('A' + newline + '10,0.1,phantom'));
      assertRefused(h);
      assert.equal(await h.exportJSON(), null);
      h.importFile(csv('A'));
      assert.deepEqual(h.result(), expected, 'a corrected file preserves the control analysis');
      assert.deepEqual(await h.exportJSON(), expected);
    });
  }
}

test('plant P13-R8: refused import cancels outstanding exact work and clears extras', () => {
  const h = harness();
  let pendingExact = true;
  let extras = { k: 3 };
  h.window.AlmGoshExact = { request(value) { if (value === null) pendingExact = false; }, labelResult() {} };
  h.window.AlmGoshPlus = { clear() { extras = null; } };
  h.importCSV(csv('A\n10,0.1,phantom'));
  assertRefused(h);
  assert.equal(pendingExact, false, 'cancel previous work before it can restore stale results');
  assert.equal(extras, null);
});
