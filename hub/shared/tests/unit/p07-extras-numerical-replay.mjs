// Execute the existing numerical contract without overwriting its published report.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const app = new URL('../../../../multilevel-ma/', import.meta.url);
const read = path => readFileSync(new URL(path, app), 'utf8');
const manifest = JSON.parse(read('validate/MANIFEST-plus.json'));
for (const file of manifest.files) {
  const bytes = readFileSync(new URL(file.path, app));
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
}
const originalCorpus = readFileSync(new URL('validate/corpus/corpus.json', app));
assert.equal(createHash('sha256').update(originalCorpus).digest('hex'),
  manifest.files.find(file => file.path === 'validate/plus-corpus/corpus-plus.json').sha256);

const scriptURL = new URL('validate/compare-plus.mjs', app);
const storedReport = read('validate/numerical-plus.json');
let report;
const context = vm.createContext({
  URL, readFileSync, console,
  // Synthetic empty settings: no access to host environment variables or override references.
  process: { env: Object.freeze({}), exitCode: 0 }, scriptURL,
  writeFileSync(path, contents) {
    assert.equal(path.href, new URL('numerical-plus.json', scriptURL).href);
    assert.equal(report, undefined, 'One report is expected');
    report = JSON.parse(contents);
  }
});
vm.runInContext(read('plus-engine.js'), context, { filename: 'plus-engine.js' });
let source = readFileSync(scriptURL, 'utf8');
for (const declaration of ["import {readFileSync,writeFileSync} from 'node:fs';", "import '../plus-engine.js';"]) {
  assert.ok(source.includes(declaration), 'Expected replay import');
  source = source.replace(declaration, '');
}
// Only the module/IO boundary is adapted. Every comparison and tolerance stays unchanged.
source = source.replaceAll('import.meta.url', 'scriptURL');
vm.runInContext(source, context, { filename: 'compare-plus.mjs' });
assert.equal(context.process.exitCode, 0);
assert.equal(report.complete, true);
assert.equal(report.configurations, 65);
assert.equal(report.checks, 3835);
assert.equal(report.passed, 3835);
assert.deepEqual(report.failed, []);
assert.equal(read('validate/numerical-plus.json'), storedReport, 'Published evidence stays untouched');
const published = JSON.parse(storedReport);
console.log('P07-R2 numerical maxima', JSON.stringify(report.maxima));
assert.deepEqual(report.maxima, published.maxima, 'Published maxima remain unchanged');
console.log('P07-R2 numerical contract: 3835/3835; seven corpus hashes and published maxima unchanged');
