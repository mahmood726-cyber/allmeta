import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../../../shared/alm-revman.js').reader;
const source = readFileSync(new URL('../fixtures/revman/multi.rm5', import.meta.url), 'utf8');

test('rm5 empty-element terminator: valid spacing preserves rows, PLANTED split terminator is refused', () => {
  const expected = R.parseText(source);
  for (const space of [' ', '\t', '\n']) {
    const valid = source.replace(/(<DICH_DATA[^>]+)\/>/, '$1' + space + '/>');
    assert.equal(R.parseText(valid).studyCount, expected.studyCount);
    assert.deepEqual(R.select(R.parseText(valid), {comparison:0,outcome:0,subgroup:0}, 'binary2x2').map(r => [r.ai,r.n1i,r.ci,r.n2i]), [[0,40,4,42],[7,60,11,61]]);
    const planted = source.replace(/(<DICH_DATA[^>]+)\/>/, '$1/' + space + '>');
    assert.notEqual(planted, source);
    assert.throws(() => R.parseText(planted), /Malformed XML/);
  }
});
