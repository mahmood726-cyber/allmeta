import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { capture, destination } from './p12-rank-corpus.mjs';
const before = JSON.parse(readFileSync(path.join(destination,'before.json'),'utf8'));
const after = capture();
writeFileSync(path.join(destination,'after.json'),JSON.stringify(after));
for (const tier of ['hashes','primary','plus','loo']) {
  assert.equal(JSON.stringify(after[tier]),JSON.stringify(before[tier]),`${tier}: exact before/after equality`);
  console.log(`${tier}: ${after[tier].length}/${before[tier].length} byte-identical records before/after fix`);
}
console.log('VM engine/DOM-stub equality only; no fresh browser/pixel validation claimed.');
