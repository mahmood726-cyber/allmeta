// Read-only replay: published tolerances/counts are assertions; historical maxima are observations.
// Run before and after the design-key fix and compare the complete output fingerprint.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import NM from '../../../../shared/nma-multiarm-v1.js';
import { jobsOf, runAll } from '../_nma_parity_check.mjs';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(read('nma/validate/MANIFEST.json'));
const files = {};
for (const file of manifest.files) {
  const bytes = readFileSync(new URL(`nma/${file.path}`, root));
  assert.equal(sha(bytes), file.sha256, file.path);
  files[file.path] = JSON.parse(bytes.toString('utf8'));
}
// Run the actual shipped adapter with only its mounting host stubbed out.
const context = vm.createContext({ AlmNmaMultiarm: NM, document: { getElementById: () => ({}) } });
context.window = context;
vm.runInContext(read('nma/validate/adapter.js'), context);
const replay = await context.AlmNmaValidateAdapter.corpus.run(files);
assert.equal(replay.checks, 410);
assert.equal(replay.passed, 410);
assert.equal(replay.failed.length, 0);
assert.equal(replay.analyses, 26);
assert.equal(replay.fitted, 24);
assert.equal(replay.refusals.matched, 2);

const corpus = files['validate/corpus/reference.json'];
const paper = files['validate/corpus/paper-values.json'].values;
const results = corpus.datasets.map(ds => ({ dataset: ds.dataset, results: runAll(jobsOf(ds)) }));
const smoking = results.find(ds => ds.dataset === 'smokingcessation');
for (const a of smoking.results) {
  for (const [key, actual] of Object.entries({ ex_Q: a.decomp.Q[0], ex_Qwithin: a.decomp.Q[1], ex_Qbetween: a.decomp.Q[2],
    ex_df: a.decomp.df[0], ex_dfwithin: a.decomp.df[1], ex_dfbetween: a.decomp.df[2], ex_pbetween: a.decomp.pval[2] })) {
    assert.equal(Number(actual.toFixed(paper[key].decimals)), paper[key].value, key);
  }
}
const inputs = JSON.parse(read('nma/tests/fixtures/p04-design-labels-input.json'));
console.log(JSON.stringify({
  sourceSha256: sha(read('shared/nma-multiarm-v1.js')),
  corpusHashesVerified: true,
  checks: replay.checks, passed: replay.passed, analyses: replay.analyses, fitted: replay.fitted, refusals: replay.refusals.matched,
  outputSha256: sha(JSON.stringify(results)),
  table1: smoking.results.map(a => a.decomp),
  table2: { reportedDecompositionMaximum: 1.1e-14, observedDecompositionMaximum: replay.maxima.decomp,
    matchesReportedRounding: replay.maxima.decomp.toExponential(1) === '1.1e-14' },
  reproduction: Object.fromEntries(Object.entries(inputs).map(([name, rows]) => [name, NM.analyse(rows).decomp]))
}, null, 2));
