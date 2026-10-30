import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('effect-size-converter/index.html');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('function runConvert()'));
const adapter = scripts.find(s => s.includes('window.__almSnapshot ='));
assert.ok(engine && adapter, 'run the real converter engine and adapter');
const plain = value => JSON.parse(JSON.stringify(value));
const formats = ['json', 'csv', 'md', 'report-md', 'report-txt'];
const evFields = ['ev-measure', 'ev-point', 'ev-lo', 'ev-hi', 'ev-rare'];

// Only DOM/platform surfaces and unrelated UI mounts are doubles. Calculations,
// event handlers, download serializers, and URL encoding/decoding are real.
// Numerical comparisons check serialization fidelity, not independent R parity.
function page({ hash = '', readyState = 'complete' } = {}) {
  const downloads = [], blobs = new Map(), ready = [];
  function element(tag = 'div', attrs = '') {
    const listeners = {}, children = [], selectors = new Map(), attributes = new Map();
    let markup = '', text = '', value = attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? '';
    return {
      tagName: tag.toUpperCase(), type: attrs.match(/\btype="([^"]*)"/)?.[1] ?? '',
      checked: /\bchecked\b/.test(attrs), hidden: /\bhidden\b/.test(attrs), style: {},
      setAttribute(name, value) { attributes.set(name, String(value)); },
      get value() { return value; }, set value(v) { value = String(v); },
      get innerHTML() { return markup; },
      set innerHTML(v) { markup = String(v); text = ''; children.length = 0; selectors.clear(); },
      get textContent() { return text || markup.replace(/<[^>]*>/g, ''); },
      set textContent(v) { text = String(v); markup = ''; children.length = 0; },
      appendChild(child) { children.push(child); },
      removeChild(child) { children.splice(children.indexOf(child), 1); },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      async dispatch(type) { for (const fn of listeners[type] || []) await fn(); },
      async click() {
        if (tag === 'a') downloads.push({ name: this.download, blob: blobs.get(this.href) });
        await this.dispatch('click');
      },
      querySelector(selector) {
        const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
        if (!action || !markup.includes(`data-action="${action}"`)) return null;
        if (!selectors.has(selector)) selectors.set(selector, element('button'));
        return selectors.get(selector);
      },
    };
  }
  const nodes = new Map([...html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)]
    .map(m => [m[3], element(m[1], m[2])]));
  for (const m of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const options = [...m[2].matchAll(/<option\b([^>]*)>/g)];
    const option = options.find(o => /\bselected\b/.test(o[1])) || options[0];
    nodes.get(m[1]).value = option[1].match(/\bvalue="([^"]*)"/)?.[1] ?? '';
  }
  const el = id => nodes.get(id) ?? null;
  const document = {
    readyState, title: 'Effect-Size Converter', head: element('head'), body: element('body'),
    getElementById: el, createElement: element,
    querySelector(selector) { return /^#[\w-]+$/.test(selector) ? el(selector.slice(1)) : null; },
    addEventListener(type, fn) { if (type === 'DOMContentLoaded') ready.push(fn); },
  };
  const context = vm.createContext({
    document, console, Blob, location: { hash },
    URL: {
      createObjectURL(blob) { const id = `blob:test-${blobs.size}`; blobs.set(id, blob); return id; },
      revokeObjectURL() {},
    },
    setTimeout() {},
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    escape, unescape, encodeURIComponent, decodeURIComponent,
    alm: { csvUpload() {}, axisControls() {}, resetUndo() {}, tooltips() {} },
  });
  context.window = context;
  for (const path of ['shared/effect-size-accuracy.js', 'shared/evalue.js',
    'hub/shared/results-export.js', 'hub/shared/url-state.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  vm.runInContext(engine, context, { filename: 'effect-size-converter/index.html:engine' });
  vm.runInContext(adapter, context, { filename: 'effect-size-converter/index.html:adapter' });
  return {
    el, context,
    loaded() { document.readyState = 'complete'; for (const fn of ready) fn(); },
    async download(format) {
      const button = el('alm-export-mount').querySelector(`[data-action="${format}"]`);
      assert.ok(button, 'real export button is mounted');
      await button.click();
      assert.equal(downloads.length, 1);
      return downloads[0].blob.text();
    },
  };
}

async function configure(p, { measure = 'RR', point = '4', lo = '3', hi = '6', rare = false } = {}) {
  for (const [id, value] of Object.entries({
    'ev-measure': measure, 'ev-point': point, 'ev-lo': lo, 'ev-hi': hi,
  })) p.el(id).value = value;
  p.el('ev-rare').checked = rare;
  await p.el('ev-point').dispatch('input');
}

for (const format of formats) {
  test(`plant P20-R5: ${format} download retains displayed E-value inputs and full-precision results`, async () => {
    const p = page();
    await configure(p);
    const shown = plain(p.context.__almLastEValue());
    assert.match(p.el('ev-out').innerHTML, new RegExp(shown.point.toFixed(3)), 'control: widget rendered');
    const output = await p.download(format);
    assert.ok(output.includes(String(shown.point)), 'download must retain the unrounded displayed point E-value');
    assert.ok(output.includes(String(shown.ci)), 'download must retain the CI E-value');
    if (format === 'json') {
      assert.deepEqual(JSON.parse(output).e_value, {
        inputs: { measure: 'RR', point: 4, lo: 3, hi: 6, rare: false }, results: shown,
      });
    } else {
      for (const key of ['inputs.measure', 'inputs.point', 'inputs.lo', 'inputs.hi', 'inputs.rare',
        'results.point', 'results.ci', 'results.rr.point', 'results.rr.lo', 'results.rr.hi']) {
        assert.ok(output.includes('e_value.' + key), `download labels ${key}`);
      }
    }
  });

  test(`control P20-R5: ${format} download retains real conversion results`, async () => {
    const p = page();
    const output = await p.download(format);
    const row = p.context.__almResults().rows.find(r => r.scale === 'ln(OR)');
    assert.equal(row.point, Math.log(0.75));
    assert.ok(output.includes(String(row.point)));
    assert.ok(output.includes('input_estimate'));
    if (format === 'json') assert.equal(JSON.parse(output)._schema, 'esc-results-v1');
  });
}

for (const measure of ['RR', 'OR', 'HR', 'SMD']) {
  test(`plant P20-R5: ${measure} export keeps inputs, rare flag, and the widget's own result`, async () => {
    const p = page();
    for (const rare of [true, false]) {
      await configure(p, { measure, rare });
      const shown = plain(p.context.__almLastEValue());
      assert.deepEqual(plain(p.context.__almResults()).e_value, {
        inputs: { measure, point: 4, lo: 3, hi: 6, rare }, results: shown,
      });
    }
  });
}

for (const readyState of ['loading', 'complete']) {
  test(`plant P20-R5: Convert URL round-trip restores all E-value fields and rerenders (${readyState})`, async () => {
    const source = page();
    await configure(source, { measure: 'OR', rare: true });
    source.el('in-est').value = '1.25';
    await source.el('btn-convert').click();
    const restored = page({ hash: source.context.location.hash, readyState });
    restored.loaded();
    assert.equal(restored.el('in-est').value, '1.25', 'control: core input round-trip');
    for (const id of evFields) {
      const prop = id === 'ev-rare' ? 'checked' : 'value';
      assert.equal(restored.el(id)[prop], source.el(id)[prop], `round-trip ${id}`);
    }
    assert.deepEqual(plain(restored.context.__almLastEValue()), plain(source.context.__almLastEValue()));
    assert.equal(restored.el('ev-out').innerHTML, source.el('ev-out').innerHTML);
  });
}

test('plant P20-R5: direct restore rerenders E-value and round-trips both checkbox states', async () => {
  const p = page();
  for (const rare of [true, false]) {
    const saved = { 'ev-measure': 'OR', 'ev-point': '4', 'ev-lo': '3', 'ev-hi': '6', 'ev-rare': rare };
    p.context.__almRestore(saved);
    assert.equal(p.el('ev-rare').checked, rare);
    assert.deepEqual(plain(p.context.__almLastEValue()),
      plain(p.context.AlmEValue.eValues('OR', 4, 3, 6, { rare })));
    assert.ok(p.el('ev-out').innerHTML.includes(p.context.__almLastEValue().point.toFixed(3)));
    const snap = p.context.__almSnapshot();
    for (const id of evFields) assert.equal(snap[id], saved[id], `snapshot ${id}`);
  }
});

test('plant P20-R5: blank CI inputs export as null and remain blank through sharing', async () => {
  const p = page();
  await configure(p, { lo: '', hi: '' });
  const shown = plain(p.context.__almLastEValue());
  assert.deepEqual(plain(p.context.__almResults()).e_value, {
    inputs: { measure: 'RR', point: 4, lo: null, hi: null, rare: false }, results: shown,
  });
  await p.el('btn-convert').click();
  const restored = page({ hash: p.context.location.hash });
  assert.equal(restored.el('ev-lo').value, '');
  assert.equal(restored.el('ev-hi').value, '');
});

test('plant P20-R5: invalid point export and restore do not retain a previous E-value result', async () => {
  const p = page();
  await configure(p);
  await configure(p, { point: '' });
  assert.equal(p.context.__almLastEValue(), null, 'control: widget rejects empty point');
  assert.deepEqual(plain(p.context.__almResults()).e_value, {
    inputs: { measure: 'RR', point: null, lo: 3, hi: 6, rare: false }, results: null,
  });
  await configure(p);
  p.context.__almRestore({ 'ev-point': '' });
  assert.equal(p.context.__almLastEValue(), null);
  assert.match(p.el('ev-out').textContent, /Enter a positive estimate/);
});

test('control P20-R5: old URLs without E-value fields retain defaults and core input round-trip', async () => {
  const source = page();
  source.context.alm.urlState.write({ 'in-type': 'MD', 'in-est': '3.25', 'in-se': '0.3', 'ctx-sd': '2' });
  const restored = page({ hash: source.context.location.hash });
  assert.equal(restored.el('in-type').value, 'MD');
  assert.equal(restored.el('in-est').value, '3.25');
  assert.equal(restored.el('ev-point').value, '2.0');
  assert.equal(restored.el('ev-rare').checked, false);
  assert.deepEqual(plain(restored.context.__almLastEValue()), plain(source.context.__almLastEValue()));
  assert.equal(restored.context.__almResults().rows.find(r => r.scale === 'MD').point, 3.25);
});
