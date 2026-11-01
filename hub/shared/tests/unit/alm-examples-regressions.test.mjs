import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import * as transport from '../../../../validation/examples/plain-evidence.mjs';
const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const E = createRequire(import.meta.url)('../../../../shared/alm-examples.js');

test('heterogeneity prepares its existing script builder without starting R', async () => {
  let registration, loads = 0;
  const ctx = { URL, console, AlmExamples: { register: (app, spec) => { registration = spec; } } };
  ctx.window = ctx;
  ctx.document = { baseURI: 'http://127.0.0.1:8000/heterogeneity/', createElement: () => ({}),
    head: { append: script => {
      loads++;
      assert.equal(script.src, 'http://127.0.0.1:8000/shared/webr-runner.js');
      ctx.document.currentScript = script;
      vm.runInContext(read('shared/webr-runner.js'), ctx);
      script.onload();
    } } };
  vm.createContext(ctx);
  vm.runInContext(read('heterogeneity/alm-examples.js'), ctx);
  await registration.prepare();
  await registration.prepare();
  assert.equal(loads, 1);
  assert.match(ctx.AlmWebR.buildMetaforScript([{ est: .1, se: .2 }, { est: .2, se: .3 }], 'PM', 'z', true), /fit\("PM"/);
  assert.equal(ctx.webR, undefined);
});

test('missing heterogeneity helper rejects loading; a later retry can recover', async () => {
  let registration, pending;
  const ctx = { URL, AlmExamples: { register: (app, spec) => { registration = spec; } },
    document: { baseURI: 'http://127.0.0.1:8000/heterogeneity/', createElement: () => ({}), head: { append: s => { pending = s; } } } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('heterogeneity/alm-examples.js'), ctx);
  const refused = registration.prepare();
  pending.onerror();
  await assert.rejects(refused, /script builder|runner/i);
  const recovered = registration.prepare();
  ctx.AlmWebR = { buildMetaforScript() {} };
  pending.onload();
  await recovered;
});

test('trim-and-fill display is selected by method even when selection-model output follows', () => {
  const displayed = { textContent: 'adjusted est=-0.123' };
  const row = (label, cell) => ({ querySelector: s => s === 'td:first-child code' ? { textContent: label } : cell });
  const rows = [row('Egger (generic)', {}), row('Trim-and-fill', displayed), row('Selection model (Vevea-Hedges, ML)', { textContent: 'adjusted mu=9.876' })];
  const document = { querySelectorAll: s => { assert.equal(s, '#body tr'); return rows; } };
  const spec = E.specifications['pubbias-tests'].display.find(x => x.key === 'trimfill_est');
  assert.equal(E.displayElement(document, spec), displayed);
  assert.equal(E.readNumber(E.displayElement(document, spec).textContent), -.123);
  rows.splice(1, 1);
  assert.throws(() => E.displayElement(document, spec), /missing/i);
  rows.push(row('Trim-and-fill', displayed), row('Trim-and-fill', displayed));
  assert.throws(() => E.displayElement(document, spec), /ambiguous/i);
});

test('example panel goes after the features host, never before main or beside a plot', () => {
  const panel = {}, placements = [];
  const features = { closest: () => null, insertAdjacentElement: (where, node) => placements.push([where, node]) };
  const document = { getElementById: () => features, body: { append() { throw Error('Unexpected fallback'); } } };
  E.mountPanel(document, panel);
  assert.deepEqual(placements, [['afterend', panel]]);
  features.closest = () => ({});
  assert.throws(() => E.mountPanel(document, panel), /outside|results/i);
});

test('pages without a features host append it and the example panel after existing content', () => {
  const appended = [], panel = {}, host = {};
  E.mountPanel({ getElementById: () => null, createElement: () => host, body: { append: (...nodes) => appended.push(...nodes) } }, panel);
  assert.equal(host.id, 'alm-features');
  assert.deepEqual(appended, [host, panel]);
});

test('worker restarts invalidate only the current example and retain earlier evidence', () => {
  const folder = mkdtempSync(join(tmpdir(), 'alm-examples-'));
  try {
    const first = join(folder, 'dta-sroc.metadata.csv'), current = join(folder, 'heterogeneity.metadata.csv');
    writeFileSync(first, 'previous successful page capture');
    writeFileSync(current, 'stale capture');
    transport.clearExampleEvidence(folder, 'heterogeneity');
    assert.equal(readFileSync(first, 'utf8'), 'previous successful page capture');
    assert.equal(existsSync(current), false);
    transport.clearExampleEvidence(folder, 'heterogeneity');
    assert.equal(existsSync(first), true);
    assert.throws(() => transport.clearExampleEvidence(folder, '../dta-sroc'), /app/i);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
