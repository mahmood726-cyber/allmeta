import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { input, reference, loadEngine, comparisons, checkGroup, near } from '../r/mh-peto-edge-harness.mjs';

const oracle = reference();
const engine = loadEngine();
const groups = comparisons(engine,oracle);

test('P10 control: native R fixture, exact inputs, generator and package versions', () => {
  assert.equal(oracle.schema,'mh-peto-edge-reference-v1');
  assert.deepEqual(oracle.input,input);
  for (const name of ['input','script']) {
    const file = name === 'input' ? 'mh-peto-edge-input.json' : 'mh-peto-edge-reference.R';
    const bytes = readFileSync(new URL(`../r/${file}`,import.meta.url));
    assert.equal(oracle.provenance[`${name}_md5`],createHash('md5').update(bytes).digest('hex'));
  }
  assert.match(oracle.provenance.R,/^R version /);
  for (const pkg of ['metafor','meta','metadat','jsonlite']) assert.match(oracle.provenance.packages[pkg],/^\d+\./);
  assert.equal(Object.keys(oracle.configurations).length,input.cases.length*3);
  assert.equal(oracle.provenance.numeric_precision,'jsonlite digits=NA');
});

// P10-COUNT-01: pass 1 observed these exact k/df differences. The app counts
// informative Peto tables; this oracle stores rma.peto()$k and derives df=k-1.
// Pass 2 confirmed that R uses $k.yi for Q's df, not $k. This is an oracle
// mapping mismatch, not an app defect. Supplemental count-parity tests use the
// separately retained native-R diagnostic; these original assertions stay intact.
// Keep the original references and execute every discrepant field as a TODO.
const countReason = 'P10-COUNT-01: informative-table count differs from R $k; see REPORT.md';
const known = Object.fromEntries([
  'one_informative|OR|peto.effective-count',
  'one_informative|OR|omit2.peto',
  'one_informative|OR|omit3.peto',
  'loo_boundary|OR|peto.effective-count',
  'loo_boundary|OR|omit1.peto',
  'loo_boundary|OR|omit2.peto',
].map(name => [name,{k:countReason,df:countReason}]));
test('P10 control: every documented TODO names an existing compared field', () => {
  for (const [name,fields] of Object.entries(known)) {
    const group = groups.find(g => g.name === name);
    assert.ok(group,`Unknown TODO group: ${name}`);
    for (const key of Object.keys(fields)) assert.ok(group.checks.some(c => c.key === key),`Unknown TODO field: ${name}.${key}`);
  }
});
for (const group of groups) {
  const pending = known[group.name] || {};
  test(`P10 parity: ${group.name}`, () => checkGroup(group,Object.keys(pending)));
  for (const [key,reason] of Object.entries(pending)) {
    test(`P10 parity: ${group.name}.${key}`,{todo:reason},() => {
      const c = group.checks.find(c => c.key === key);
      assert.ok(c,`TODO refers to a real compared quantity: ${key}`);
      near(c.actual,c.expected,`${group.name}.${key}`);
    });
  }
}

test('P10 control: homogeneous DL tau2=0 and heterogeneous DL tau2>0 are exercised', () => {
  for (const measure of ['OR','RR','RD']) {
    assert.equal(oracle.configurations[`exact_null|${measure}`].dl.values.tau2,0);
    assert.ok(oracle.configurations[`dl_heterogeneous|${measure}`].dl.values.tau2>0);
  }
});
test('P10 control: comparison rejects missing, NaN, infinity and false zero evidence', () => {
  for (const bad of [undefined,NaN,Infinity,'0',false]) assert.throws(() => near(bad,0,'invalid'));
  assert.throws(() => near(0,null,'undefined is not zero'));
  assert.throws(() => near(null,0,'zero is not undefined'));
});

// Mutate only the in-memory source. The unchanged engine is the positive control;
// each mutant must fail the very same fresh-R assertion. No production files change.
const plants = [
  ['CI quantile rounded to 1.96',['var Z975 = 1.959963984540054;','var Z975 = 1.96;'],'two_single_zero|OR|mh.inference'],
  ['Peto finite population variance',['(n * n * (n - 1))','(n * n * n)'],'two_unbalanced|OR|peto.inference'],
  ['heterogeneity degrees of freedom',['var df = k - 1, I2 = Math.max(0, 100 * (Q - df) / Q);','var df = k, I2 = Math.max(0, 100 * (Q - df) / Q);'],'two_unbalanced|OR|mh.effective-count'],
  ['metabin zero-cell increment',["var inc = (incl && (n1 - a === 0 || a === 0 || n2 - c === 0 || c === 0)) ? 0.5 : 0;","var inc = (incl && (n1 - a === 0 || a === 0 || n2 - c === 0 || c === 0)) ? 1 : 0;"],'two_single_zero|OR|meta.inference'],
  ['per-study RD uses corrected counts',['var p1 = r.e1 / r.n1, p2 = r.e2 / r.n2;','var p1 = a / (a+b), p2 = c / (c+d);'],'two_single_zero|RD|study.intervals'],
];
for (const [name,mutation,id] of plants) test(`P10 planted defect: ${name}`, () => {
  checkGroup(groups.find(g => g.name === id));
  const changed = comparisons(loadEngine(mutation),oracle).find(g => g.name === id);
  assert.throws(() => checkGroup(changed),{code:'ERR_ASSERTION'});
});
test('P10 planted defect: leave-one-out removes the wrong table', () => {
  const cfg = input.cases.find(c => c.id === 'loo_boundary');
  const mutation = ['return j !== i; }), measure)), flags = {};','return j !== (i + 1) % rows.length; }), measure)), flags = {};'];
  const altered = loadEngine(mutation).leaveOneOut(cfg.rows,'OR');
  const ref = oracle.configurations['loo_boundary|OR'].loo[0].mh.values;
  const correct = engine.leaveOneOut(cfg.rows,'OR').rows[0].mh;
  near(correct.beta,ref.beta,'control first omission');
  assert.throws(() => near(altered.rows[0].mh.beta,ref.beta,'wrong omission'),{code:'ERR_ASSERTION'});
});
