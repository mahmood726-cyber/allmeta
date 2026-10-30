// Reproduce the original silent-refusal defect without git or a second tree.
// This is an in-memory mutation, not a claim to reconstruct an absent base.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const testFile = new URL('./p13-study-limit.test.mjs', import.meta.url);
const testSource = readFileSync(testFile, 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(testFile.href));
const passed = [], failed = [];
runInNewContext(testSource, {
  URL, assert, runInNewContext,
  readFileSync(path, encoding) {
    const source = readFileSync(path, encoding);
    const needle = "clearInputResults('Enter at most 100 valid studies (effect, SE[, label]); found ' + rows.length + '.');";
    assert.equal(source.split(needle).length, 2, 'The mutation must target exactly the over-cap message');
    return source.replace(needle, "clearInputResults('');");
  },
  test(name, fn) {
    try { fn(); passed.push(name); }
    catch (error) { failed.push({ name, message: error.message }); }
  }
});
assert.equal(failed.length, 2);
assert.ok(failed.every(row => row.name.startsWith('plant P13-R5:') && /at most/.test(row.message)));
assert.equal(passed.length, 5);
console.log(JSON.stringify({ mutation: 'silence only the over-cap alert', failed, passed }, null, 2));
