import test from 'node:test';
import assert from 'node:assert/strict';
import { engineParent, readLF, inTempTree, runNode } from '../../../../scripts/p04-replay-support.mjs';

const runner = 'nma/tests/p04-r5-corpus-check.mjs';
const corpus = ['nma/validate/corpus/reference.json', 'nma/validate/corpus/paper-values.json'];
const files = Object.fromEntries([
  runner, 'shared/nma-multiarm-v1.js', 'nma/validate/adapter.js', ...corpus,
].map(path => [path, readLF(path)]));

for (const eol of ['LF', 'CRLF']) {
  test(`P04 provenance ${eol === 'LF' ? 'control' : 'defect'}: ${eol} checkout retains the recorded corpus hashes and 410 checks`, () => {
    const checkout = { ...files };
    if (eol === 'CRLF') for (const path of corpus) checkout[path] = checkout[path].replace(/\n/g, '\r\n');
    const run = inTempTree(checkout, dir => runNode(dir, [runner]));
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.checks, 410);
    assert.equal(result.passed, 410);
  });
}

test('P04 provenance control: non-line-ending corruption still fails the recorded hash', () => {
  const path = corpus[0];
  const run = inTempTree({ ...files, [path]: files[path] + ' ' }, dir => runNode(dir, [runner]));
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /AssertionError/);
  assert.match(run.stderr, /validate\/corpus\/reference\.json/);
});

test('P04 provenance planted defect: historical raw-byte reader rejects an unchanged CRLF corpus', t => {
  const normalizedRead = "readFileSync(new URL(path, root), 'utf8').replace(/\\r\\n/g, '\\n')";
  assert.equal(files[runner].split(normalizedRead).length, 2, 'exactly one LF normalization at the read boundary');
  const checkout = { ...files,
    [runner]: files[runner].replace(normalizedRead, "readFileSync(new URL(path, root), 'utf8')"),
  };
  for (const path of corpus) checkout[path] = checkout[path].replace(/\n/g, '\r\n');
  const run = inTempTree(checkout, dir => runNode(dir, [runner]));
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /AssertionError/);
  assert.match(run.stderr, /validate\/corpus\/reference\.json/);
  t.diagnostic('Historical reader: CRLF fixture failed the recorded reference.json hash (exit 1).');
});

test('P04 publication control: authenticated PR engine parent and shipped engine produce identical corpus results', t => {
  const old = { ...files,
    'shared/nma-multiarm-v1.js': engineParent(files['shared/nma-multiarm-v1.js']),
  };
  const results = [old, files].map(checkout => inTempTree(checkout, dir => {
    const run = runNode(dir, [runner]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    return JSON.parse(run.stdout);
  }));
  // Includes every reported maximum and the digest of every raw analysis result.
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[1].passed, 410);
  t.diagnostic(`PR parent and shipped engine: identical 410 checks, maxima and analysis digest ${results[1].analysisSha256}.`);
});
