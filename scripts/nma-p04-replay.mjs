// Read-only replay of the publication corpus through the unchanged adapter.
// Prints evidence to stdout; no snapshots, corpus edits, or generated files.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const manifest = JSON.parse(read('nma/validate/MANIFEST.json'));
const files = {};
for (const file of manifest.files) {
  const raw = readFileSync(new URL(`nma/${file.path}`, root));
  assert.equal(createHash('sha256').update(raw).digest('hex'), file.sha256, file.path);
  files[file.path] = JSON.parse(raw.toString('utf8'));
}
const context = vm.createContext({ document: { getElementById: () => ({}) } });
context.window = context;
vm.runInContext(read('shared/nma-multiarm-v1.js'), context);
vm.runInContext(read('nma/validate/adapter.js'), context);
const result = await context.AlmNmaValidateAdapter.corpus.run(files);
assert.equal(result.checks, 410);
assert.equal(result.passed, 410);
assert.equal(result.failed.length, 0);
assert.equal(result.analyses, 26);
assert.equal(result.within, 24);
assert.equal(result.refusals.matched, 2);
console.log(JSON.stringify({ corpus: result }, null, 2));

// Replay the smoking cessation example at the published decimal precision.
const ds = files['validate/corpus/reference.json'].datasets.find(d => d.dataset === 'smokingcessation');
assert.ok(ds, 'paper example exists');
const rows = ds.contrasts.map(c => ({ study: c.studlab, t1: c.treat2, t2: c.treat1, est: c.TE, se: c.seTE }));
const a = context.AlmNmaMultiarm.analyse(rows);
assert.equal(a.ok, true, a.error);
const i = t => a.treatments.indexOf(t);
const versusA = (quantity, treatment) => Math.exp(a.random[quantity][i(treatment)][i('A')]);
const example = {
  ex_studies: a.k, ex_multiarm: a.multiArmStudies.length, ex_n: a.n,
  ex_tau2: a.tau2, ex_I2: 100 * a.I2, ex_I2_lo: 100 * a.lowerI2, ex_I2_hi: 100 * a.upperI2,
  ex_Q: a.Q, ex_df: a.df, ex_Qwithin: a.decomp.Q[1], ex_dfwithin: a.decomp.df[1],
  ex_Qbetween: a.decomp.Q[2], ex_dfbetween: a.decomp.df[2], ex_pbetween: a.decomp.pval[2],
  ex_or_D: versusA('TE', 'D'), ex_or_D_lo: versusA('lower', 'D'), ex_or_D_hi: versusA('upper', 'D'),
  ex_or_D_pi_lo: Math.exp(a.predict.lower[i('D')][i('A')]), ex_or_D_pi_hi: Math.exp(a.predict.upper[i('D')][i('A')]),
  ex_or_C: versusA('TE', 'C'), ex_or_C_lo: versusA('lower', 'C'), ex_or_C_hi: versusA('upper', 'C'),
  ex_or_B: versusA('TE', 'B'), ex_or_B_lo: versusA('lower', 'B'), ex_or_B_hi: versusA('upper', 'B'),
};
const benefit = context.AlmNmaMultiarm.analyse(rows, { smallValues: 'undesirable' });
example.ex_best = benefit.treatments[benefit.pscore.random.indexOf(Math.max(...benefit.pscore.random))];
example.ex_best_pscore = Math.max(...benefit.pscore.random);
example.ex_pscore_A = benefit.pscore.random[i('A')];
const expected = files['validate/corpus/paper-values.json'].values;
const rounded = {};
for (const [name, value] of Object.entries(example)) {
  rounded[name] = typeof value === 'number' ? Number(value.toFixed(expected[name].decimals)) : value;
  assert.equal(rounded[name], expected[name].value, name);
}
console.log(JSON.stringify({ paperExample: example, rounded, reference: 'Archived R corpus; no fresh R run' }, null, 2));
