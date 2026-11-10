import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = new URL('../../../../meta-regression/', import.meta.url);
await import(new URL('plus-engine.js', base));
await import(new URL('validate/contract.js', base));
const read = path => JSON.parse(readFileSync(new URL(path, base), 'utf8'));
const corpus = read('validate/plus/corpus.json'), refs = read('validate/plus/reference.json');

// These existing R references exposed the min(vi)-only repair's regression.
// Reuse their original contract and tolerances, including the 1e-9 p-value gate.
function checkPinned(id) {
  const index = corpus.findIndex(c => c.id === id);
  assert.ok(index >= 0, id);
  assert.equal(refs[index].id, id);
  const actual = AlmMetaPlus.compute(corpus[index]);
  assert.equal(actual.status, 'ok', `${id}: ${actual.reason}`);
  const failures = AlmMetaPlusContract.audit(actual, refs[index].result).filter(row => !row.pass);
  assert.deepEqual(failures, [], id);
}

test('plant P08 review: precise studies do not force ML to chase floating-point oscillation', () => {
  for (const mode of ['additive', 'interaction']) checkPinned(`dat.obrien2003::PLO::2::${mode}`);
});
test('plant P08 review: heterogeneous sampling precision retains pinned p-value accuracy', () => {
  for (const moderators of [2, 3]) {
    checkPinned(`dat.chiarito2020::RR:p2y12.stroke+p2y12.total+aspirin.stroke+aspirin.total::${moderators}::additive`);
  }
});
test('control P08 review: other high-precision corpus models retain their reference behavior', () => {
  for (const mode of ['additive', 'interaction']) checkPinned(`dat.obrien2003::PLO::3::${mode}`);
});
