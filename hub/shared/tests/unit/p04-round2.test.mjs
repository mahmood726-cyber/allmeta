import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import NM from '../../../../shared/nma-multiarm-v1.js';

const root = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('nma/index.html', root), 'utf8');
const main = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(code => code.includes('function onImportJson(file)'));
assert.ok(main, 'Run the actual NMA application script, including startup and event handlers');
const lifecycle = readFileSync(new URL('hub/shared/analysis-lifecycle.js', root), 'utf8');
const data = 's1, A, B, 0.2, 0.1\ns2, A, C, 0.5, 0.2\ns3, B, C, 0.3, 0.15';
const savedState = (ref = 'B') => ({
  data, ref, model: 'fe', ci: 'classic', dir: 'desirable', scale: 'log', title: 'Restore reference'
});

// A small Node-only DOM double. Crucially, a SELECT cannot retain a value
// absent from its current options; assigning it leaves no selected option.
// The real page's script, lifecycle, NMA engine and import/export handlers run
// unchanged. Layout, file I/O, download plumbing and plot-export UI are stubbed.
class Element {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase(); this.id = id;
    this.children = []; this.selectedIndex = -1; this._value = ''; this._html = '';
    this.listeners = new Map(); this.hidden = false; this.textContent = '';
    const classes = new Set();
    this.classList = { add: value => classes.add(value), remove: value => classes.delete(value) };
  }
  get value() {
    return this.tagName === 'SELECT' ? this.children[this.selectedIndex]?.value ?? '' : this._value;
  }
  set value(value) {
    value = String(value);
    if (this.tagName === 'SELECT') this.selectedIndex = this.children.findIndex(option => option.value === value);
    else this._value = value;
  }
  get innerHTML() { return this._html; }
  set innerHTML(value) {
    this._html = value; this.children = []; this.selectedIndex = -1;
  }
  appendChild(child) {
    this.children.push(child);
    if (this.tagName === 'SELECT' && this.selectedIndex < 0) this.selectedIndex = 0;
    return child;
  }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type) { for (const callback of this.listeners.get(type) || []) callback({ target: this }); }
  click() { this.dispatch('click'); }
}

function harness(saved = null) {
  const elements = new Map();
  for (const match of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    elements.set(match[2], new Element(match[1], match[2]));
  }
  const get = id => {
    assert.ok(elements.has(id), `Missing page element: ${id}`);
    return elements.get(id);
  };
  for (const match of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const select = get(match[1]);
    for (const option of match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const el = new Element('option');
      el.value = option[1].match(/\bvalue="([^"]*)"/)?.[1] ?? option[2];
      select.appendChild(el);
      if (/\bselected\b/.test(option[1])) select.value = el.value;
    }
  }
  const storage = new Map(saved === null ? [] : [['nma-v1', JSON.stringify(saved)]]);
  const downloads = [], alerts = [];
  const context = {
    document: {
      getElementById: get,
      createElement: tag => new Element(tag),
      body: new Element('body'),
      addEventListener() {},
      querySelectorAll: () => [...elements.values()].filter(el => el.id.startsWith('f-'))
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    FileReader: class {
      readAsText(file) { this.result = file.text; this.onload(); }
    },
    Blob,
    URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
    setTimeout() {},
    alert: message => alerts.push(message),
    confirm: () => true,
    AlmNmaMultiarm: NM,
    alm: { plotExport() {} },
    NMA_EXAMPLES: { pending: { title: 'Pending reference', measure: 'MD',
      data: 's1, A, Placebo, 0.2, 0.1\ns2, A, Placebo, 0.3, 0.15' } }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(lifecycle, context, { filename: 'analysis-lifecycle.js' });
  vm.runInContext(main, context, { filename: 'nma/index.html' });
  return {
    get, alerts,
    saved: () => JSON.parse(storage.get('nma-v1')),
    run: () => get('btn-run').click(),
    import(state) {
      get('file-import').files = [{ text: JSON.stringify(state) }];
      get('file-import').dispatch('change');
      assert.deepEqual(alerts, [], 'Import completes without an alert');
    },
    async export() {
      const before = downloads.length;
      get('btn-json').click();
      assert.equal(downloads.length, before + 1, 'Valid analysis exports JSON');
      return JSON.parse(await downloads.at(-1).text());
    }
  };
}

function assertReference(h, ref) {
  assert.equal(h.get('f-ref').value, ref, 'Selected comparator');
  assert.match(h.get('stats-wrap').innerHTML, new RegExp('Reference</span><span class="v">' + ref + '</span>'));
  assert.ok(h.get('ref-host').innerHTML.includes('vs ' + ref + ' (95% CI)'), 'Rendered estimates use the comparator');
  assert.equal(h.get('analysis-status').hidden, false, 'Analysis succeeded');
}

function assertSaved(h, ref) {
  assert.equal(h.saved().ref, ref, 'Autosave records the effective comparator on the first render');
}

test('control: select double rejects absent options and accepts existing options', () => {
  const select = new Element('select');
  select.value = 'B';
  assert.equal(select.value, '');
  const option = new Element('option'); option.value = 'A'; select.appendChild(option);
  assert.equal(select.value, 'A');
  select.value = 'B';
  assert.equal(select.value, '');
  select.value = 'A';
  assert.equal(select.value, 'A');
});

test('plant P04-R2: JSON import into a different network preserves B through export and reload', async () => {
  const h = harness();
  assert.ok(!h.get('f-ref').children.some(option => option.value === 'B'), 'Incoming comparator is absent initially');
  h.import(savedState());
  assertReference(h, 'B'); assertSaved(h, 'B');
  assert.deepEqual(h.saved(), savedState(), 'All imported fields survive');
  const exported = await h.export();
  assert.equal(exported.ref, 'B');
  const reloaded = harness(exported);
  assertReference(reloaded, 'B'); assertSaved(reloaded, 'B');
});

test('plant P04-R2: autosave startup restores B with initially empty options and across two reloads', () => {
  let state = savedState();
  for (let reload = 0; reload < 3; reload++) {
    const h = harness(state);
    assertReference(h, 'B'); assertSaved(h, 'B');
    state = h.saved();
    assert.deepEqual(state, savedState());
  }
});

test('plant P04-R2: unavailable imported reference persists the effective fallback immediately', () => {
  const h = harness();
  h.import(savedState('Missing'));
  assertReference(h, 'A'); assertSaved(h, 'A');
  const reloaded = harness(h.saved());
  assertReference(reloaded, 'A'); assertSaved(reloaded, 'A');
});

test('plant P04-R2: existing pending example reference is autosaved on its first render', () => {
  const h = harness();
  const option = new Element('option'); option.value = 'pending';
  h.get('f-example').appendChild(option); h.get('f-example').value = 'pending';
  h.get('btn-example').click();
  assertReference(h, 'Placebo'); assertSaved(h, 'Placebo');
});

test('control: same-network JSON round-trip preserves B and a later manual selection wins', async () => {
  const h = harness();
  h.get('f-data').value = data; h.run();
  h.get('f-ref').value = 'B'; h.get('f-ref').dispatch('change');
  const exported = await h.export();
  assert.equal(exported.ref, 'B');
  h.get('f-ref').value = 'A'; h.get('f-ref').dispatch('change');
  h.import(exported);
  assertReference(h, 'B'); assertSaved(h, 'B');
  h.get('f-ref').value = 'C'; h.get('f-ref').dispatch('change');
  assertReference(h, 'C'); assertSaved(h, 'C');
});

test('control: missing saved comparator retains the current valid selection', () => {
  const h = harness();
  h.get('f-data').value = data; h.run();
  h.get('f-ref').value = 'C'; h.get('f-ref').dispatch('change');
  const state = savedState(); delete state.ref;
  h.import(state);
  assertReference(h, 'C'); assertSaved(h, 'C');
});

test('control: unavailable saved comparator selects the first incoming treatment', () => {
  const h = harness();
  h.import(savedState('Missing'));
  assertReference(h, 'A');
});
