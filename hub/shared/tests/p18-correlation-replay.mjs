// Read-only arithmetic audit and numerical subset of the existing pinned contract.
// The full 54,612-check replay additionally requires linkedom and rendered strings.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { root, read, engine, html, oldEngine, oldHtml } from './p18-correlation-sources.mjs';

const manifest = JSON.parse(read('multivariate-ma/validate/MANIFEST-plus.json'));
for (const file of manifest.files) {
  const bytes = readFileSync(new URL('multivariate-ma/' + file.path, root));
  assert.equal(bytes.length, file.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
}
const corpus = JSON.parse(read('multivariate-ma/validate/plus/corpus.json'));
const reference = JSON.parse(read('multivariate-ma/validate/plus/reference.json'));
assert.equal(corpus.configurations.length, manifest.configurations);
assert.deepEqual(corpus.grid, manifest.grid);
function load(source, page) {
  const context = vm.createContext({});
  context.window = context;
  for (const code of [source, read('multivariate-ma/plus.js'), read('multivariate-ma/validate/plus-contract.js')]) {
    vm.runInContext(code, context);
  }
  const start = page.indexOf('    function number(s)');
  const end = page.indexOf('    // The mode is kept', start);
  assert.ok(start >= 0 && end > start);
  context.parse = vm.runInContext(page.slice(start, end) + '\nparse;', context);
  return context;
}
const before = load(oldEngine, oldHtml), after = load(engine, html);
let rows = 0, covariances = 0;
for (const configuration of corpus.configurations) {
  for (const row of configuration.rows) {
    rows++;
    const [v1, v2] = row.v;
    const csv = `${row.label}, ${row.y[0]}, ${v1}, ${row.y[1]}, ${v2}, ${row.cov}`;
    assert.equal(after.parse(csv, 'cov').rows[0].r, before.parse(csv, 'cov').rows[0].r,
      configuration.id + ': derived correlation must be exactly unchanged');
    for (const r of corpus.grid) {
      assert.equal(after.AlmMultivariate.covFromR(v1, v2, r), before.AlmMultivariate.covFromR(v1, v2, r),
        configuration.id + ': covariance must be exactly unchanged at r=' + r);
      covariances++;
    }
  }
}
console.log('Exact pre/post conversion equality:', JSON.stringify({ rows, covariances }));
let previous;
for (const [label, context] of [['before', before], ['after', after]]) {
  const contract = context.AlmMvPlusContract;
  assert.equal(contract.expectedChecks(corpus, reference, true), manifest.checks);
  const result = JSON.parse(JSON.stringify(contract.replay(corpus, reference, context.AlmMvPlus)));
  console.log(label, JSON.stringify({ node: process.version, R: manifest.R, packages: manifest.versions,
    checks: result.checks, passed: result.passed, failedChecks: result.failedChecks,
    maxima: result.maxima, logLikComparison: result.logLikComparison }));
  assert.equal(result.failedChecks, 0, JSON.stringify(result.failed.slice(0, 5)));
  if (previous) assert.deepEqual(result, previous, 'Numerical counts, maxima and adjudications must be exactly unchanged');
  previous = result;
}
console.log('Numerical contract results exactly unchanged; rendered-string checks were not run.');
