import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('nma/validate/MANIFEST.json', root), 'utf8'));
const corpus = new Map(manifest.files.map(file => [
  new URL(`nma/${file.path}`, root).href,
  readFileSync(new URL(`nma/${file.path}`, root), 'utf8').replace(/\r\n/g, '\n'),
]));

// Exercise each shipped manifest-verification loop with simulated checkout bytes.
// Keep the recorded hashes and real corpus intact; substitute only file reads.
for (const [label, path, scriptRoot, end] of [
  ['extraction replay', 'hub/shared/tests/unit/p04-extraction-replay.mjs', root, 'const context ='],
  ['paper replay', 'scripts/p04-paper-replay.mjs', new URL('nma/', root), 'const ctx ='],
]) {
  const source = readFileSync(new URL(path, root), 'utf8');
  const start = source.indexOf('const files = {};');
  const stop = source.indexOf(end, start);
  assert.ok(start >= 0 && stop > start, `Missing manifest verification loop: ${path}`);
  const verify = (lineEnding, tamper = false) => {
    const context = vm.createContext({
      assert, createHash, URL, Buffer, manifest, root: scriptRoot,
      readFileSync: url => {
        assert.ok(corpus.has(url.href), `Unexpected corpus read: ${url.href}`);
        const lf = corpus.get(url.href);
        assert.ok(lf.includes('\n'), 'Fixture must distinguish LF from CRLF');
        // Even a harmless extra space is outside the permitted EOL conversion.
        return Buffer.from((tamper ? ' ' : '') + lf.replace(/\n/g, lineEnding));
      },
    });
    return vm.runInContext(`${source.slice(start, stop)}\nfiles;`, context);
  };

  test(`P04 provenance control: ${label} accepts recorded LF corpus`, () => {
    const files = verify('\n');
    for (const file of manifest.files) {
      assert.deepEqual(JSON.parse(JSON.stringify(files[file.path])),
        JSON.parse(corpus.get(new URL(`nma/${file.path}`, root).href)));
    }
  });

  test(`P04 provenance plant: ${label} accepts CRLF checkout against recorded LF hashes`, () => {
    const files = verify('\r\n');
    for (const file of manifest.files) {
      assert.deepEqual(JSON.parse(JSON.stringify(files[file.path])),
        JSON.parse(corpus.get(new URL(`nma/${file.path}`, root).href)));
    }
  });

  test(`P04 provenance control: ${label} rejects other byte changes in LF and CRLF`, () => {
    for (const ending of ['\n', '\r\n']) {
      assert.throws(() => verify(ending, true), error => error.code === 'ERR_ASSERTION'
        && manifest.files.some(file => file.sha256 === error.expected)
        && error.actual !== error.expected);
    }
  });
}
