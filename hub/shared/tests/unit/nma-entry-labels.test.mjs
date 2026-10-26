import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');
const html = read('nma/index.html');
const plain = value => JSON.parse(JSON.stringify(value));

function setup() {
  const fields = Object.fromEntries(Object.entries({
    data: 'Original,A,B,0.1,0.2', ref: 'A', model: 'fe', ci: 'classic',
    dir: 'desirable', scale: 'log', title: '', example: 'generic',
  }).map(([key, value]) => ['f-' + key, { value }]));
  const context = vm.createContext({
    document: { getElementById: id => fields[id], querySelectorAll: () => [] },
    AlmFeaturesState: { entryLog: [{ text: 'Previous import' }], provenance: [] },
  });
  vm.runInContext('var window = globalThis;', context);
  // Exercise the actual page parser and compute hook, including the multi-arm
  // engine. Only the DOM rendering is omitted from this serialization test.
  const start = html.indexOf('    function contrastCells(');
  const end = html.indexOf('    function clearResults(');
  const hook = html.indexOf('    window.__almNmaParse =');
  const hookEnd = html.indexOf('    const loaded = loadSaved();');
  assert.ok(start >= 0 && end > start && hook > end && hookEnd > hook);
  vm.runInContext(html.slice(start, end), context);
  vm.runInContext(read('shared/nma-multiarm-v1.js'), context);
  vm.runInContext(html.slice(hook, hookEnd), context);
  vm.runInContext(read('shared/alm-entry.js'), context);
  vm.runInContext(read('nma/alm-features.js'), context);
  fields['btn-run'] = { click() {} };
  return { context, fields, apply: context.AlmNmaFeatures.entry.apply };
}

function convert(context, rows) {
  const E = context.AlmEntry;
  const table = E.parseTable(['study\tt1\tt2\tyi\tsei', ...rows].join('\n'));
  const output = E.convert(table, E.detect(table, 'contrast-nma'), 'contrast-nma', {});
  assert.deepEqual(plain(output.flags.filter(f => f.blocking)), []);
  assert.deepEqual(plain(output.questions), []);
  return output.records;
}

function parsedRows(context, fields) {
  const parsed = context.__almNmaParse(fields['f-data'].value);
  assert.deepEqual(plain(parsed.warnings), []);
  return plain(parsed.rows.map(({ study, t1, t2, est, se }) => ({ study, t1, t2, yi: est, sei: se })));
}

const values = records => plain(records.map(({ study, t1, t2, yi, sei }) => ({ study, t1, t2, yi, sei })));

test('NMA entry preserves literal quotes and keeps quoted and unquoted treatments distinct', () => {
  const { context, fields, apply } = setup();
  const records = convert(context, [
    'Trial 1\t"""A"""\tB\t0.2\t0.12',
    'Trial 2\tA\tB\t0.3\t0.14',
  ]);
  assert.equal(records[0].t1, '"A"');
  apply(records);
  assert.deepEqual(parsedRows(context, fields), values(records));
  const result = context.__almNmaCompute(fields['f-data'].value);
  assert.equal(result.error, undefined);
  assert.deepEqual(plain(result.treatments), ['"A"', 'A', 'B']);
});

test('NMA entry preserves embedded quotes in study and both treatment labels', () => {
  const { context, fields, apply } = setup();
  const records = [{ study: 'Trial "one"', t1: 'Drug "low"', t2: 'Drug "high"', yi: .2, sei: .12 }];
  apply(records);
  assert.deepEqual(parsedRows(context, fields), records);
});

test('CONTROL: NMA entry preserves ordinary labels, effects, SEs and existing serialization', () => {
  const { context, fields, apply } = setup();
  const records = convert(context, ['Trial 1\tA\tB\t0.2\t0.12', 'Trial 2\tA\tB\t0.3\t0.14']);
  apply(records);
  assert.deepEqual(parsedRows(context, fields), values(records));
  assert.equal(fields['f-data'].value, 'Trial 1, A, B, 0.2, 0.12\nTrial 2, A, B, 0.3, 0.14');
  assert.deepEqual(plain(context.__almNmaCompute(fields['f-data'].value).treatments), ['A', 'B']);
});

test('CONTROL: NMA entry still refuses invalid SE atomically', () => {
  const { context, fields, apply } = setup();
  const before = fields['f-data'].value, log = plain(context.AlmFeaturesState.entryLog);
  assert.throws(() => apply([{ study: 'Bad', t1: 'A', t2: 'B', yi: .2, sei: 0 }]), /positive SE/);
  assert.equal(fields['f-data'].value, before);
  assert.deepEqual(plain(context.AlmFeaturesState.entryLog), log);
});
