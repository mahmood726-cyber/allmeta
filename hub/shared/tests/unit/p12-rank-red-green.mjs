// Re-run the identical assertions against saved pre-fix sources and current code.
// All copied source and test output stays in temporary storage.
import assert from 'node:assert/strict';
import { run } from 'node:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { destination } from './p12-rank-corpus.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const originals = path.join(tmpdir(), 'limit-ma-p12-r4-originals-rev2-P12-f4');
const beforeRoot = mkdtempSync(path.join(tmpdir(), 'limit-ma-p12-r4-red-green-'));
const hashes = {
  'index.html': '5d5f1a705d5228014f684dd77eb98a950ed582a8175321835a8bed90792866d3',
  'plus.js': '91097a304ac7e82dcbcc7b57fb4659cb87b5abb8ac2fe796f15580d65968975e',
  'plus-ui.js': '7576d7b450257e1d37d908265bc7150c1f39d756551ba4803dcf78217ad14f26'
};
assert.deepEqual(readFileSync(path.join(originals, 'index.html')),
  readFileSync(path.join(destination, 'index-before.html')), 'same original page as pass-1 baseline');
const unit = 'hub/shared/tests/unit/';
const suite = unit + 'p12-rank.test.mjs';
const files = [
  'limit-ma/index.html', 'limit-ma/plus.js', 'limit-ma/plus-ui.js',
  'limit-ma/plus-opt.js', 'limit-ma/plus-selmodel.js', 'limit-ma/loo-limit.js',
  'limit-ma/tests/input-harness.cjs', 'limit-ma/validate/loo/replay.cjs',
  'shared/ma-core.js', 'shared/trimfill.js', 'shared/selmodel.js',
  suite, unit + 'p12-rank-input.json', unit + 'p12-rank-reference.json'
];
for (const file of files) {
  const name = path.basename(file), target = path.join(beforeRoot, file);
  const source = Object.hasOwn(hashes, name) ? path.join(originals, name) : path.join(root, file);
  if (Object.hasOwn(hashes, name)) {
    assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), hashes[name], name);
  }
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
}

async function verify(label, directory) {
  const verdicts = [];
  for await (const event of run({ files: [path.join(directory, suite)], concurrency: 1 })) {
    if (!['test:pass', 'test:fail'].includes(event.type)) continue;
    const passed = event.type === 'test:pass', name = event.data.name;
    const error = passed ? undefined : event.data.details?.error?.message;
    verdicts.push({ name, passed, error });
    console.log(`${label} ${passed ? 'PASS' : 'FAIL'} ${name}`);
  }
  writeFileSync(path.join(destination, label + '-rank-tests.json'), JSON.stringify(verdicts, null, 2));
  assert.equal(verdicts.length, 22, `${label}: complete test coverage`);
  for (const result of verdicts) {
    const expected = label === 'after' || !result.name.startsWith('P12-R4 plant');
    assert.equal(result.passed, expected, `${label}: ${result.name}: ${result.error || ''}`);
  }
  console.log(`${label}: ${verdicts.filter(r => r.passed).length} passed; ${verdicts.filter(r => !r.passed).length} failed (expected)`);
}
await verify('before', beforeRoot);
await verify('after', root);
