import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const page = read('dta-sroc/index.html');
const plus = read('dta-sroc/plus-ui.js');
const plain = value => JSON.parse(JSON.stringify(value));

function dom() {
  const elements = new Map();
  return { getElementById(id) {
    if (!elements.has(id)) {
      const listeners = new Map();
      let value = '';
      elements.set(id, {
        get value() { return value; }, set value(v) { value = String(v); },
        innerHTML: '', textContent: '', disabled: false,
        classList: { add() {}, remove() {} },
        addEventListener(type, fn) { listeners.set(type, fn); },
        dispatch(type) { listeners.get(type)?.(); },
        replaceChildren() { this.innerHTML = ''; this.textContent = ''; }
      });
    }
    return elements.get(id);
  } };
}

// Exercise the app's actual CSV parse/onParse callbacks without mounting a browser.
function importer({ unquote = false } = {}) {
  const document = dom();
  let config;
  const c = vm.createContext({ document, window: {}, readState: () => ({ cov: '' }),
    render() {}, warnEl: document.getElementById('warn-banner') });
  vm.runInContext(read('hub/shared/csv-upload.js'), c);
  const parse = c.window.alm.csvUpload.parse;
  c.window.alm.csvUpload = Object.assign(options => { config = options; }, { parse });
  vm.runInContext(page.slice(page.indexOf('    const COUNT_FIELDS'), page.indexOf('    // Per-study points')), c);
  let callback = page.slice(page.indexOf('    window.alm.csvUpload({'), page.indexOf('    // Keep the axis ranges'));
  if (unquote) {
    assert.ok(callback.includes('[formatStudyLabel(label)]'));
    callback = callback.replace('[formatStudyLabel(label)]', '[label]');
  }
  vm.runInContext(callback, c);
  return text => {
    config.onParse(config.parse(text, config.columns));
    const native = document.getElementById('f-data').value;
    return { native, parsed: plain(c.parseStudies(native, '')),
      error: document.getElementById('warn-banner').textContent };
  };
}

const counts = [[85, 10, 15, 140], [62, 12, 18, 108], [110, 25, 40, 200], [55, 6, 8, 90]];
const labels = ['Study, Alpha', 'Study "B"', 'Study C', 'Study D'];
const csv = 'study,TP,FP,FN,TN\n"Study, Alpha",+85,1e1,15.0,1.4e2\n"Study ""B""",62,12,18,108\nStudy C,110,25,40,200\nStudy D,55,6,8,90';
function assertImport(result, expectedLabels = labels) {
  assert.equal(result.error, '');
  assert.deepEqual(result.parsed.warnings, []);
  assert.deepEqual(result.parsed.studies.map(s => s.label), expectedLabels);
  assert.deepEqual(result.parsed.studies.map(s => [s.tp, s.fp, s.fn, s.tn]), counts);
}

test('DTA CI: CSV callbacks preserve quoted labels and the complete count matrix', () => {
  assertImport(importer()(csv));
});

test('DTA CI CSV control: plain and generated labels retain every study', () => {
  const body = counts.map(row => row.join(',')).join('\n');
  assertImport(importer()('TP,FP,FN,TN\n' + body), counts.map((_, i) => 'Study ' + (i + 1)));
  const names = ['A', 'B', 'C', 'D'];
  assertImport(importer()('study,TP,FP,FN,TN\n' + counts.map((row, i) => [names[i], ...row].join(',')).join('\n')), names);
});

test('DTA CI CSV plant: removing label quoting fails the lossless-import requirement', () => {
  const broken = importer({ unquote: true })(csv);
  assert.throws(() => assertImport(broken), { code: 'ERR_ASSERTION' });
  assert.equal(broken.native, '');
  assert.match(broken.error, /CSV rejected.*round-tripped losslessly/);
});

function extras(source = plus) {
  const document = dom();
  const c = vm.createContext({ document });
  for (const path of ['dta-sroc/plus-bivariate.js', 'dta-sroc/plus.js', 'dta-sroc/validate/plus-render-reference.js']) {
    vm.runInContext(read(path), c);
  }
  vm.runInContext(source, c);
  return { ui: c.AlmDTAPlusUI, reference: c.AlmDTAPlusReference,
    el: key => document.getElementById('plus-' + key) };
}
const good = { rows: counts.map(([TP, FP, FN, TN], i) => ({ TP, FP, FN, TN, x: [0.5, -0.1, 0.25, 1][i] })),
  method: 'fixed', correction: 'all', at: 0, prevalence: 0.1 };

test('DTA CI: malformed extras clear results, export and raw-scale note with the current count order', () => {
  const h = extras();
  for (const bad of ['x', ...['0x1F', '0b101', '0o17', 'Infinity'].map(x => '85,10,15,140,' + x)]) {
    assert.ok(h.ui.set(good));
    assert.match(h.el('scale-note').textContent, /The covariate is not standardised/);
    h.el('data').value = bad;
    h.el('data').dispatch('input');
    assert.equal(h.el('results').innerHTML, '');
    assert.equal(h.el('scale-note').textContent, '');
    assert.equal(h.el('export').disabled, true);
    assert.equal(h.ui.render(), null);
    assert.equal(h.el('error').textContent, 'Each row must contain TP,FP,FN,TN,x');
    assert.equal(h.el('results').innerHTML, '');
    assert.equal(h.el('scale-note').textContent, '');
    assert.throws(() => h.ui.exportJSON(), /No current extras result/);
  }
});

test('DTA CI extras control: decimal/exponent rows recover; standardised covariates need no scale note', () => {
  const h = extras();
  assert.ok(h.ui.set(good));
  h.el('data').value = '85,1e1,15.0,1.4e2,.5\n62,12,18,108,-1e-1\n110,25,40,200,.25\n55,6,8,90,1.';
  assert.ok(h.ui.render());
  assert.equal(h.el('error').textContent, '');
  assert.equal(h.el('export').disabled, false);
  assert.deepEqual(plain(h.ui.input().rows), good.rows);
  const mean = good.rows.reduce((s, r) => s + r.x, 0) / good.rows.length;
  const sd = Math.sqrt(good.rows.reduce((s, r) => s + (r.x - mean) ** 2, 0) / (good.rows.length - 1));
  assert.ok(h.ui.set({ ...good, rows: good.rows.map(r => ({ ...r, x: (r.x - mean) / sd })) }));
  assert.equal(h.el('scale-note').textContent, '');
});

test('DTA CI extras plant: swapping FP/FN violates the common input order', () => {
  const oldOrder = plus.replaceAll("['TP','FP','FN','TN','x']", "['TP','FN','FP','TN','x']");
  assert.notEqual(oldOrder, plus);
  const assertOrder = h => {
    h.ui.set(good);
    h.el('data').value = good.rows.map(r => [r.TP, r.FP, r.FN, r.TN, r.x].join(',')).join('\n');
    assert.deepEqual(plain(h.ui.input().rows), good.rows);
  };
  assertOrder(extras());
  assert.throws(() => assertOrder(extras(oldOrder)), { code: 'ERR_ASSERTION' });
});

// Reuse precisely the pixel spec's ten inputs, including its two mobile cases.
// These are renderer/input checks, not a substitute for browser rasterisation or R parity.
const spec = read('hub/shared/tests/dta-sroc-plus-pixels.spec.mjs');
const configs = vm.runInNewContext(spec.slice(spec.indexOf('const configs='), spec.indexOf('const targets=')) + '\nconfigs;');
const corpus = JSON.parse(read('dta-sroc/validate/corpus/plus-reference.json'));

test('DTA CI pixel control: all ten configurations retain the independent renderer markup', () => {
  const h = extras();
  // Reconstruct only the old input order; no claim that this is a checkout of main.
  const legacy = extras(plus.replaceAll('TP,FP,FN,TN,x', 'TP,FN,FP,TN,x')
    .replaceAll("['TP','FP','FN','TN','x']", "['TP','FN','FP','TN','x']"));
  assert.equal(configs.length, 10);
  for (const config of configs) {
    const c = corpus.cases.find(c => c.id === config.id);
    assert.ok(c?.ok, config.id);
    const input = { rows: c.rows, method: c.method, correction: c.correction, at: config.at, prevalence: config.prevalence };
    const model = h.ui.set(input);
    assert.ok(model, h.el('error').textContent);
    assert.equal(h.el('results').innerHTML, h.reference.html(model), config.id);
    assert.ok(legacy.ui.set(input));
    assert.deepEqual(plain(model), plain(legacy.ui.current), config.id);
    assert.equal(h.el('results').innerHTML, legacy.el('results').innerHTML, config.id);
  }
});

test('DTA CI pixel plants: reversed table/cards and altered prediction stroke fail the renderer contract', () => {
  const h = extras();
  const model = h.ui.set(good);
  assert.ok(model);
  const expected = h.reference.html(model);
  const actual = h.el('results').innerHTML;
  assert.equal(actual, expected);
  const plants = [
    actual.replace(/(<td\b[^>]*>)([^<]+)(<\/td>)/g, '$1<bdo dir="rtl">$2</bdo>$3'),
    actual.replace(/(<dd\b[^>]*>)([^<]+)(<\/dd>)/g, '$1<bdo dir="rtl">$2</bdo>$3'),
    actual.replace('stroke="#a34c00"', 'stroke="white"')
  ];
  for (const broken of plants) {
    assert.notEqual(broken, actual);
    assert.equal(broken.replace(/<[^>]*>/g, ''), actual.replace(/<[^>]*>/g, ''), 'visible-text-only checks miss these plants');
    assert.throws(() => assert.equal(broken, expected), { code: 'ERR_ASSERTION' });
  }
});
