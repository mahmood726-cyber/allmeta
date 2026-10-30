import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('influence/index.html');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engine = scripts.find(s => s.includes('const LS_KEY = "influence-v1"'));
const adapter = scripts.find(s => s.includes('window.__almLoad ='));
assert.ok(engine && adapter, 'test must execute the actual page engine and CSV adapter');

const validCsv = 'study,yi,vi\nA,0.1,0.04\nB,0.2,0.09\nC,0.3,0.16\nD,0.4,0.25';
const validNative = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C\n0.4, 0.5, D';
const outputIds = ['body', 'model-body', 'loo-plot', 'influence-plot', 'baujat-plot', 'radial-plot'];

// Minimal DOM surface; parsing, analysis, refusal, lifecycle, plots and exports
// execute the production scripts. Only unrelated widget mounting is stubbed.
function harness() {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => {
    const listeners = new Map();
    return [id, {
      id, value: '', innerHTML: '', textContent: '', hidden: true, disabled: false,
      setAttribute(name, value) { this[name] = value; },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      click() { for (const fn of listeners.get('click') || []) fn.call(this, { target: this }); },
    }];
  }));
  const el = id => {
    assert.ok(elements.has(id), `unknown DOM id: ${id}`);
    return elements.get(id);
  };
  el('src').value = validNative;
  const document = {
    getElementById: el,
    querySelector: selector => /^#[\w-]+$/.test(selector) ? elements.get(selector.slice(1)) || null : null,
    querySelectorAll: selector => selector === '#src' ? [el('src')] : [],
    addEventListener() {},
  };
  const ctx = vm.createContext({ document, console });
  ctx.window = ctx;
  for (const path of ['shared/ma-core.js', 'shared/diagnostic-plots.js', 'influence/influence-extra.js',
    'hub/shared/analysis-lifecycle.js', 'hub/shared/csv-upload.js']) {
    vm.runInContext(read(path), ctx, { filename: path });
  }
  let csvOptions;
  const parseCsv = ctx.alm.csvUpload.parse;
  ctx.alm.csvUpload = options => { csvOptions = options; };
  for (const name of ['axisControls', 'plotExport', 'resultsExport', 'tooltips']) ctx.alm[name] = () => {};
  ctx.alm.urlState = Object.assign(() => {}, { read: () => ({}) });
  ctx.alm.resetUndo = Object.assign(() => {}, { snapshot() {} });
  vm.runInContext(engine, ctx, { filename: 'influence/index.html:engine' });
  vm.runInContext(adapter, ctx, { filename: 'influence/index.html:adapter' });
  assert.ok(csvOptions, 'real CSV onParse handler must be registered');
  return {
    ctx, el,
    loadCsv(text) {
      const parsed = parseCsv(text, csvOptions.columns);
      csvOptions.onParse(parsed);
      return parsed;
    },
    runNative(text) { el('src').value = text; el('btn-run').click(); },
  };
}

function assertRefused(h, invalidRows) {
  const results = h.ctx.__almResults();
  assert.equal(results.k, 0, `invalid CSV must not publish a subset: ${JSON.stringify({
    k: results.k, mu: results.pooled_mu, warning: h.el('input-error').textContent,
  })}`);
  assert.equal(h.ctx._almLastInfluence(), null);
  assert.equal(h.ctx._almLastDiag(), null);
  assert.equal(h.ctx._almStudies().length, 0);
  assert.equal(h.ctx._almLastExclusion(), null);
  assert.equal(h.ctx.__almBaujat, null);
  assert.equal(h.ctx.__almRadial, null);
  assert.equal(Object.hasOwn(results, 'pooled_mu'), false);
  assert.equal(h.ctx.__almInfluenceStudyRows().length, 0);
  for (const id of outputIds) assert.equal(h.el(id).innerHTML, '', `${id} must be cleared`);
  assert.equal(h.el('analysis-status').hidden, true, 'refused input must not announce success');
  assert.equal(h.el('input-error').hidden, false);
  assert.match(h.el('input-error').textContent, /refused/i);
  for (const row of invalidRows) assert.match(h.el('input-error').textContent,
    new RegExp(`(?:row|line) ${row}\\b`, 'i'), `must identify invalid data row ${row}`);
}

for (const variance of ['0', '-0.04']) {
  test(`plant P11-R1: CSV vi=${variance} refuses all four records and clears prior results`, () => {
    const h = harness();
    assert.equal(h.ctx.__almResults().k, 4);
    h.ctx.__almInfluenceSetExcluded([0]);
    const parsed = h.loadCsv(validCsv.replace('B,0.2,0.09', `B,0.2,${variance}`));
    assert.equal(parsed.rows.length, 4, 'shared parser must retain the defective record');
    assert.equal(parsed.warnings.length, 0, 'nonpositive variance is an app-domain error');
    assertRefused(h, [2]);
    h.loadCsv(validCsv);
    assert.equal(h.ctx.__almResults().k, 4, 'corrected CSV must recover the complete analysis');
    assert.equal(h.el('input-error').hidden, true);
    assert.equal(h.el('analysis-status').hidden, false);
  });
}

test('plant P11-R1: mixed zero and negative variances report both original data row numbers', () => {
  const h = harness();
  h.loadCsv('study,yi,vi\nA,0.1,0.04\nB,0.2,0\nC,0.3,0.16\nD,0.4,-0.04\nE,0.5,0.25');
  assertRefused(h, [2, 4]);
});

for (const [name, row] of [
  ['nonfinite variance', 'B,0.2,Infinity'],
  ['missing variance', 'B,0.2,'],
  ['nonfinite effect', 'B,Infinity,0.09'],
  ['missing effect', 'B,,0.09'],
]) {
  test(`${name.includes('effect') ? 'control' : 'plant P11-R1'}: ${name} cannot silently remove a CSV record`, () => {
    const h = harness();
    h.loadCsv(validCsv.replace('B,0.2,0.09', row));
    assertRefused(h, [2]);
  });
}

test('plant P11-R1: missing study column refuses the CSV with data row numbers', () => {
  const h = harness();
  h.loadCsv('yi,vi\n0.1,0.04\n0.2,0.09\n0.3,0.16\n0.4,0.25');
  assertRefused(h, [1, 2, 3, 4]);
});

test('control: positive-variance CSV retains every study and matches native-input results', () => {
  const h = harness();
  const expected = JSON.stringify(h.ctx.__almResults());
  h.loadCsv(validCsv);
  assert.equal(h.ctx.__almResults().k, 4);
  assert.equal(JSON.stringify(h.ctx.__almResults()), expected);
  assert.deepEqual(Array.from(h.ctx._almStudies(), r => r.label), ['A', 'B', 'C', 'D']);
  assert.equal(h.el('input-error').textContent, '');
  assert.equal(h.el('input-error').hidden, true);
  assert.equal(h.el('analysis-status').hidden, false);
  for (const id of outputIds) assert.notEqual(h.el(id).innerHTML, '', `${id} must render`);
});

test('control: zero effect and a quoted comma in a study name remain valid CSV', () => {
  const h = harness();
  h.loadCsv(validCsv.replace('A,0.1,0.04', '"A, trial",0,0.04'));
  assert.equal(h.ctx.__almResults().k, 4);
  assert.equal(h.ctx._almStudies()[0].te, 0);
  assert.equal(h.ctx._almStudies()[0].label, 'A, trial');
  assert.equal(h.el('input-error').hidden, true);
});

test('control: mixed valid and invalid native input is refused with its original line number', () => {
  const h = harness();
  h.runNative(validNative.replace('0.2, 0.3, B', '0.2, 0, B'));
  assertRefused(h, [2]);
});

test('control: valid CSV after native refusal clears the error and restores complete results', () => {
  const h = harness();
  const expected = JSON.stringify(h.ctx.__almResults());
  h.runNative(validNative.replace('0.2, 0.3, B', '0.2, 0, B'));
  assertRefused(h, [2]);
  h.loadCsv(validCsv);
  assert.equal(JSON.stringify(h.ctx.__almResults()), expected);
  assert.equal(h.el('input-error').hidden, true);
  assert.equal(h.el('analysis-status').hidden, false);
});
