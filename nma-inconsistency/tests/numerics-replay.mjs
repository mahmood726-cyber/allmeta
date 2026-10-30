// Read-only arithmetic replay. This does not replace the DOM/browser suites.
// The full shipped plus adapter runs with its existing pins/checks/tolerances.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { harness } from './numerics-harness.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root));
const json = p => JSON.parse(read(p));
const manifest = json('validate/MANIFEST.json');
for (const f of manifest.files) assert.equal(createHash('sha256').update(read(f.path)).digest('hex'), f.sha256, f.path);
const corpus = json('validate/corpus/corpus.json');
const reference = json('validate/corpus/reference.json');
const originalSource = json('tests/fixtures/p16-original-source.json');
const original = harness(originalSource), current = harness();
const clean = x => JSON.parse(JSON.stringify(x));
let accepted = 0, refused = 0, busExcluded = 0, quantities = 0;
function compare(actual, expected, model, path = '') {
  if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path + ' membership');
    for (const [k, v] of Object.entries(expected)) compare(actual[k], v, model, path ? path + '.' + k : k);
    return;
  }
  quantities++;
  if (typeof expected !== 'number' || /^(df|trts\.)|\.df$/.test(path)) assert.equal(actual, expected, path);
  else {
    const probability = /(^|\.)p$/.test(path);
    const tolerance = probability ? 1e-9 : model === 'PM' && !path.startsWith('estimates.') && path !== 'Q' ? 1e-6 : 1e-9;
    assert.ok(Number.isFinite(actual), path + ' finite');
    assert.ok(Math.abs(actual - expected) / (probability ? 1 : Math.max(1, Math.abs(expected))) <= tolerance,
      `${path}: app=${actual}, R=${expected}, tolerance=${tolerance}`);
  }
}
for (let i = 0; i < corpus.length; i++) {
  const item = corpus[i], ref = reference.cases[i];
  assert.equal(item.key, ref.key);
  if (item.bus) { busExcluded++; continue; }
  for (const h of [original, current]) {
    h.elements.get('f-model').value = item.model;
    h.c.__almIncoLoad(item.text);
  }
  const before = clean(original.c._almLastInco()), after = clean(current.c._almLastInco());
  assert.deepEqual(after, before, item.key + ' exact pre/post state');
  for (const id of ['ns-body', 'ns-plot', 'dbt']) assert.equal(current.elements.get(id).innerHTML,
    original.elements.get(id).innerHTML, item.key + ' exact pre/post ' + id);
  assert.deepEqual(clean(current.c.parse(item.text)), ref.parsed, item.key + ' parsed rows');
  if (ref.reason) {
    refused++;
    assert.deepEqual(after, { status: 'refused', reason: ref.reason }, item.key);
  } else {
    accepted++;
    const expected = {};
    for (const k of ['model', 'trts', 'Q', 'df', 'tau2', 'Qrandom', 'estimates', 'estimatesRandom', 'dbt']) expected[k] = ref.numeric[k];
    expected.nodeSplit = ref.numeric.nodeSplit.map(({ kDirect, ...s }) => s).sort((a, b) => a.comparison.localeCompare(b.comparison));
    after.nodeSplit.sort((a, b) => a.comparison.localeCompare(b.comparison));
    compare(after, expected, item.model, '');
  }
}
console.log(`Base arithmetic replay: ${accepted} accepted, ${refused} refused, ${quantities} reference leaves; exact pre/post states and render strings match. ${busExcluded} bus cases excluded (requires DOM importer).`);

const { c } = current;
Object.assign(c, { crypto: webcrypto, TextDecoder, setTimeout });
for (const file of ['validate/manifest-plus.js', 'validate/plus-adapter.js']) vm.runInContext(read(file).toString('utf8'), c, { filename: file });
const adapter = c.AlmIncoPlusAdapter;
const loaded = Object.fromEntries(adapter.corpus.files.map(f => [f.path, read(f.path)]));
const replay = await adapter.corpus.run(loaded);
console.log(`Shipped plus replay: ${replay.passed}/${replay.checks}; groups=${JSON.stringify(replay.groups)}; boundary=${replay.boundary.length}`);
if (replay.failed.length) console.log(JSON.stringify(replay.failed.slice(0, 8), null, 2));
assert.equal(replay.failed.length, 0);
assert.equal(replay.passed, replay.checks);
assert.equal(replay.checks, json('validate/MANIFEST-plus.json').checks);
console.log(replay.summaryLines.join('\n'));
