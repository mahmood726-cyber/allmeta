// Read-only replay of the published adapter through the shipped engine.
// No browser, network, environment inspection, or files written by this script.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const manifest = JSON.parse(read('dose-response-ma/validate/MANIFEST.json'));
const files = {};
for (const file of manifest.files) {
  const bytes = read('dose-response-ma/' + file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  assert.equal(Buffer.byteLength(bytes), file.bytes, file.path + ' LF bytes');
  files[file.path] = JSON.parse(bytes);
}
const context = vm.createContext({ setTimeout, document: { getElementById: () => ({ textContent: '' }) } });
context.window = context;
for (const path of ['shared/ma-core.js', 'shared/dose-response.js', 'dose-response-ma/validate/adapter.js']) {
  vm.runInContext(read(path), context, { filename: path });
}
const result = await context.AlmDoseValidate.corpus.run(files);
console.log(JSON.stringify(result));
assert.equal(result.checks, 724);
assert.equal(result.passed, 724);
assert.equal(result.failed.length, 0);
assert.equal(result.coverageFails.length, 0);
assert.equal(result.refusals.reference, 148);
assert.equal(result.refusals.app, 148);
assert.equal(result.refusals.matched, 148);
