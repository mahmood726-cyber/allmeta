import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('correlation-ma/index.html');
const main = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .find(([, attrs, body]) => !/\bsrc=/.test(attrs) && body.includes('var EXAMPLE'))[2];
const manifest = JSON.parse(read('correlation-ma/validate/MANIFEST.json'));
const files = () => Object.fromEntries(manifest.files.map(f => [f.path,
  // Model CI's LF checkout without editing the pinned corpus or its hashes.
  new TextEncoder().encode(read('correlation-ma/' + f.path).replace(/\r\n/g, '\n'))]));

// Exercise the real page, engine, build script, pin verifier and entire adapter
// replay. This small DOM boundary only retains values and rendered markup;
// DOM/geometry checks are left to the unchanged browser spec. Assertions here
// cover the result contract, numerical checks, refusals and result restoration.
function setup({ loadBuild = true, alternateBuild = false, mutate = () => {} } = {}) {
  const nodes = new Map();
  for (const id of ['f-data', 'f-method', 'headline', 'res-body', 'forest-host']) {
    nodes.set(id, {
      value: id === 'f-method' ? 'REML' : '', disabled: false, readOnly: false,
      innerHTML: '', textContent: '', childNodes: [],
      addEventListener() {}, replaceChildren(...children) { this.childNodes = children; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      closest() { return null; }, hasAttribute() { return false; },
    });
  }
  const document = {
    readyState: 'loading', body: { children: [] },
    getElementById: id => nodes.get(id), addEventListener() {},
    querySelectorAll() { return []; },
  };
  const ctx = vm.createContext({ document, console, Blob, URL, TextEncoder, TextDecoder,
    ArrayBuffer, Uint8Array, crypto: webcrypto, matchMedia: () => ({ matches: false }),
    setTimeout: fn => fn(),
  });
  ctx.window = ctx;
  const run = path => vm.runInContext(read(path), ctx, { filename: path });
  run('shared/ma-core.js');
  if (loadBuild) run('shared/build-info.js');
  if (alternateBuild) ctx.AlmBuildInfo = {
    version: 'v9.8.7-test', sha: '0123456789abcdef0123456789abcdef01234567',
  };
  vm.runInContext(main, ctx, { filename: 'correlation-ma/index.html' });
  ctx.alm = { chartExportAuto: { scan() {} } };
  run('shared/alm-validate.js');
  run('correlation-ma/validate/pins.js');
  run('correlation-ma/validate/adapter.js');
  const calculate = ctx.__almCorrValidationRun;
  ctx.__almCorrValidationRun = () => { calculate(); const a = ctx._almLastCorrMA(); if (a) mutate(a); };
  return { ctx, nodes, replay: async () => JSON.parse(JSON.stringify(await ctx.AlmCorrValidationAdapter.corpus.run(files()))) };
}

const contractFailures = r => r.failed.filter(f => f.quantity === 'output.fields');
for (const alternateBuild of [false, true]) {
  test(`plant P17-R4: replay accepts exact loaded provenance (${alternateBuild ? 'alternate' : 'shipped'} build)`, async () => {
    const h = setup({ alternateBuild }), before = h.ctx._almLastCorrMA();
    const r = await h.replay();
    assert.equal(r.checks, manifest.checks, 'retain the pinned check count');
    assert.equal(r.refusals.length, 8);
    assert.deepEqual(contractFailures(r), [], 'all 64 accepted configurations must satisfy the strict result contract');
    assert.equal(h.ctx._almLastCorrMA(), before, 'restore the original result object');
    for (const id of ['f-data', 'f-method']) assert.equal(h.nodes.get(id).disabled, false);
    const numerical = new Set(['schema', 'k', 'method', 'membership', 'mu_z', 'se_z', 'tau2_z',
      'I2', 'r', 'r_lo', 'r_hi', 'r_pi_lo', 'r_pi_hi', 'weight']);
    assert.deepEqual(r.failed.filter(f => numerical.has(f.quantity)), [], 'unchanged archived R comparisons');
  });
}

test('control P17-R4: replay accepts the original fields when build metadata is unavailable', async () => {
  const h = setup({ loadBuild: false }), r = await h.replay();
  assert.equal(r.checks, manifest.checks);
  assert.deepEqual(contractFailures(r), []);
});

test('control P17-R4: metadata property insertion order does not change the contract', async () => {
  const r = await setup({ mutate(a) { a.producedBy = { sha: a.producedBy.sha, version: a.producedBy.version }; } }).replay();
  assert.deepEqual(contractFailures(r), []);
});

for (const [name, mutate] of [
  ['missing provenance', a => { delete a.producedBy; }],
  ['wrong version', a => { a.producedBy.version = 'v0.0.0-wrong'; }],
  ['wrong SHA', a => { a.producedBy.sha = '0'.repeat(40); }],
  ['missing version', a => { delete a.producedBy.version; }],
  ['missing SHA', a => { delete a.producedBy.sha; }],
  ['extra provenance key', a => { a.producedBy.unexpected = true; }],
  ['null provenance', a => { a.producedBy = null; }],
  ['extra result key', a => { a.unexpected = true; }],
  ['missing numerical key', a => { delete a.mu_z; }],
]) {
  test(`control P17-R4: strict replay rejects ${name}`, async () => {
    const r = await setup({ mutate }).replay();
    assert.equal(r.checks, manifest.checks);
    assert.equal(contractFailures(r).length, 64, 'reject the defect in every accepted configuration');
  });
}

test('control P17-R4: unavailable build metadata does not allow arbitrary provenance', async () => {
  const r = await setup({ loadBuild: false, mutate(a) { a.producedBy = { version: 'fake', sha: 'fake' }; } }).replay();
  assert.equal(contractFailures(r).length, 64);
});

test('control P17-R4: the real verifier still refuses tampered corpus bytes', async () => {
  const h = setup(), bytes = files();
  bytes[manifest.files[0].path][10] ^= 1;
  await assert.rejects(() => h.ctx.AlmCorrValidationAdapter.corpus.run(bytes), /SHA-256 mismatch/);
});
