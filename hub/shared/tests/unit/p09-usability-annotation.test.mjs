import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const specURL = new URL('../proportion-ma-usability.spec.mjs', import.meta.url);

// Register the unchanged browser spec, then execute only its annotation prefix.
// Navigation stops the callback before any DOM assertion; browser behavior is
// covered by the original spec and p09-refusal.test.mjs.
async function annotationsFor(title) {
  const cases = new Map();
  const annotations = [];
  const browserTest = (name, body) => cases.set(name, body);
  browserTest.describe = (_name, body) => body();
  browserTest.describe.configure = () => {};
  browserTest.fail = (condition, reason) => {
    if (condition) annotations.push(reason);
  };
  const source = readFileSync(specURL, 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(specURL.href));
  vm.runInNewContext(source, { test: browserTest, URL }, { filename: specURL.pathname });
  assert.ok(cases.has(title), 'The existing browser test must still be registered');
  const stop = new Error('navigation boundary');
  await assert.rejects(cases.get(title)({ page: { goto() { throw stop; } } }), error => error === stop);
  return annotations;
}

test('P09-CI plant: resolved refusal browser case requires a normal pass', async () => {
  assert.deepEqual(await annotationsFor('4 refusal does not leave the previous result on screen'), []);
});

test('P09-CI control: unresolved Load example case retains its expected failure', async () => {
  const annotations = await annotationsFor('2 example dataset: "Load example" restores and analyses the example in one click');
  assert.equal(annotations.length, 1);
  assert.match(annotations[0], /there is no "Load example" control/);
});
