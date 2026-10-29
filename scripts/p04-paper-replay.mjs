// Read-only replay of the frozen publication corpus, without browser dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import NM from '../shared/nma-multiarm-v1.js';
import { compare, jobsOf, runAll } from '../hub/shared/tests/_nma_parity_check.mjs';
globalThis.AlmNmaMultiarm = NM;
const root = new URL('../nma/', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const manifest = JSON.parse(read('validate/MANIFEST.json'));
const files = {};
for (const f of manifest.files) {
  const bytes = readFileSync(new URL(f.path, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), f.sha256);
  files[f.path] = JSON.parse(bytes);
}
const ctx = vm.createContext({ window: {}, document: { getElementById: () => ({}) }, AlmNmaMultiarm: NM });
vm.runInContext(read('validate/adapter.js'), ctx);
const result = await ctx.window.AlmNmaValidateAdapter.corpus.run(files);
console.log('P04_PAPER_REPLAY', JSON.stringify(result));
writeFileSync(join(tmpdir(), 'p04-f1-after-replay.json'), JSON.stringify(result, null, 2));
const datasets = files['validate/corpus/reference.json'].datasets;
const perDataset = datasets.map(ds => {
  const res = runAll(jobsOf(ds));
  return {dataset: ds.dataset, fits: ds.fits.map((f, i) => f.ok && res[i].ok ?
    {method: f.method_random_ci, maxima: compare(res[i], f)} : {method: f.method_random_ci, ok: res[i].ok})};
});
console.log('P04_PER_DATASET', JSON.stringify(perDataset));
writeFileSync(join(tmpdir(), 'p04-f1-after-datasets.json'), JSON.stringify(perDataset, null, 2));
const ex = datasets.find(ds => ds.dataset === 'smokingcessation');
const a = NM.analyse(jobsOf(ex)[0].rows, {smallValues: 'undesirable'});
const example = {Q:a.Q, df:a.df, tau2:a.tau2, I2:a.I2, lowerI2:a.lowerI2, upperI2:a.upperI2,
  decomp:a.decomp, treatments:a.treatments, random:a.random, predict:a.predict, pscore:a.pscore};
console.log('P04_EXAMPLE', JSON.stringify(example));
writeFileSync(join(tmpdir(), 'p04-f1-after-example.json'), JSON.stringify(example, null, 2));
assert.equal(result.checks, 410);
assert.equal(result.passed, 410);
assert.equal(result.refusals.matched, 2);
assert.equal(result.failed.length, 0);
