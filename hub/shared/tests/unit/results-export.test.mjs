// node:test — hub/shared/results-export.js: a getResults() that answers null/undefined/a non-object (an app whose last
// run was refused) exports exactly what the default {} exports, on every button, and never throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../results-export.js', import.meta.url), 'utf8');
const ACTIONS = ['json', 'csv', 'md', 'report-md', 'report-txt'];
let checks = 0;
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };

// Minimal DOM: the module only needs <style>/<a> creation, a target whose buttons it wires, and URL/Blob for downloads.
function mount(getResults) {
  const handlers = {}, blobs = [];
  const target = {
    set innerHTML(_) {},
    querySelector(sel) {
      const action = /data-action="([^"]+)"/.exec(sel)[1];
      return { addEventListener: (type, fn) => { handlers[action] = fn; } };
    }
  };
  const document = {
    title: 'Unit app',
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
    createElement: () => ({ click() {} }),
    querySelector: () => null
  };
  const sandbox = {
    document, Blob, console,
    URL: { createObjectURL: b => { blobs.push(b); return 'blob:unit'; }, revokeObjectURL() {} },
    setTimeout: () => 0
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'results-export.js' });
  sandbox.window.alm.resultsExport({ target, basename: 'unit', getResults });
  return async action => {
    const before = blobs.length;
    await handlers[action]();
    assert.equal(blobs.length, before + 1, action + ' downloaded one file');
    return blobs[blobs.length - 1].text();
  };
}

async function exportAll(getResults) {
  const click = mount(getResults), out = {};
  for (const action of ACTIONS) out[action] = await click(action);
  return out;
}

test('a null/undefined/non-object result exports exactly what the {} default exports, without throwing', async () => {
  const empty = await exportAll(() => ({}));
  eq(JSON.parse(empty.json), {});
  eq(empty.csv, 'key,value');
  eq(empty.md.split('\n').length, 2);
  for (const r of ['report-md', 'report-txt']) assert.match(empty[r], /No results yet/), checks++;
  for (const bad of [null, undefined, 0, 42, '', 'text', true, false]) {
    const got = await exportAll(() => bad);
    eq(got, empty, 'getResults() -> ' + JSON.stringify(bad) + ' exports as empty');
  }
  const noGetter = await exportAll(undefined);
  eq(noGetter, empty, 'no getResults option exports as empty');
});

test('a real result object is exported unchanged', async () => {
  const got = await exportAll(() => ({ _schema: 'unit-v1', k: 3, mu: 0.25, nested: { lo: 0 }, list: [1, 2] }));
  eq(JSON.parse(got.json), { _schema: 'unit-v1', k: 3, mu: 0.25, nested: { lo: 0 }, list: [1, 2] });
  eq(got.csv, 'key,value\r\n_schema,unit-v1\r\nk,3\r\nmu,0.25\r\nnested.lo,0\r\nlist,"[1,2]"');
  assert.match(got['report-md'], /\| mu +\| 0\.25 +\|/); checks++;
  assert.match(got['report-txt'], /^nested\.lo: 0$/m); checks++;
  console.log('results-export null-safety checks: ' + checks);
});
