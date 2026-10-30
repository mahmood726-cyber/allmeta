import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const specURL = new URL('p19-scale-defect.test.mjs', import.meta.url);
const scriptURL = new URL('p19-scale-reference.R', import.meta.url);
const canonical = readFileSync(scriptURL, 'utf8').replace(/\r\n/g, '\n');

function checkProvenance(script) {
  let check;
  // Execute the existing provenance assertion with only the script bytes
  // substituted, so the test covers the real hash calculation and pinned hash.
  const source = readFileSync(specURL, 'utf8')
    .replace(/^import .*;\r?$/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(specURL.href));
  vm.runInNewContext(source, { URL, assert, vm, createHash,
    test(name, fn) {
      if (name === 'P19-R1 control: native R fixture records exact inputs, method and versions') check = fn;
    },
    readFileSync(url, encoding) {
      if (url.href !== scriptURL.href) return readFileSync(url, encoding);
      return encoding ? script : Buffer.from(script, 'utf8');
    },
  });
  assert.equal(typeof check, 'function');
  check();
}

test('P19 provenance control: canonical LF script matches its unchanged recorded hash', () => {
  checkProvenance(canonical);
});

test('P19 provenance plant: CRLF checkout hashes canonical LF bytes', () => {
  checkProvenance(canonical.replace(/\n/g, '\r\n'));
});

test('P19 provenance control: a script content change still fails authentication', () => {
  assert.throws(() => checkProvenance(canonical + '# changed content\n'), { code: 'ERR_ASSERTION' });
});
