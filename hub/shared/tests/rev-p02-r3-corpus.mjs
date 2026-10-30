// Read-only replay through the shipped adapter and its unchanged tolerances.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const root = new URL('../../../', import.meta.url);
const ctx = vm.createContext({ setTimeout, document: { getElementById: () => ({}) } });
ctx.window = ctx;
for (const file of ['shared/dose-response.js', 'dose-response-ma/validate/adapter.js']) {
  vm.runInContext(readFileSync(new URL(file, root), 'utf8'), ctx);
}
const manifest = JSON.parse(readFileSync(new URL('dose-response-ma/validate/MANIFEST.json', root), 'utf8'));
const files = {};
for (const f of manifest.files) {
  const bytes = readFileSync(new URL('dose-response-ma/' + f.path, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), f.sha256, f.path);
  files[f.path] = JSON.parse(bytes);
}
const result = await ctx.AlmDoseValidate.corpus.run(files);
console.log(JSON.stringify(result));
assert.equal(result.checks, 724);
assert.equal(result.passed, 724);
assert.equal(result.refusals.reference, 148);
assert.equal(result.refusals.app, 148);
assert.equal(result.refusals.matched, 148);
assert.equal(result.failed.length, 0);
assert.equal(result.coverageFails.length, 0);
