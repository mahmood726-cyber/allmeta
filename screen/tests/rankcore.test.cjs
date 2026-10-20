const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const workerSource = fs.readFileSync(path.join(root, 'rank-worker.js'), 'utf8');
const pin = '15b243065a14ecc6ce11ff3cc128d6bfa70b648a25f95116047245314100f252';

function worker(config) {
  const messages = [], imports = [];
  const ctx = vm.createContext({performance, postMessage: m => messages.push(m)});
  ctx.self = ctx;
  ctx.importScripts = file => {
    imports.push(file);
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, {filename:file});
  };
  vm.runInContext(workerSource, ctx);
  if (config) ctx.ScreenRankConfig = config;
  return {ctx, messages, imports, run(data) {
    ctx.onmessage({data});
    return messages.at(-1);
  }};
}
const records = [
  ['__control_positive_a', 'beneficial treatment response'],
  ['__control_positive_b', 'treatment clinical benefit'],
  ['__control_negative_a', 'unrelated animal experiment'],
  ['__control_negative_b', 'laboratory animal protocol'],
  ['__control_candidate_a', 'beneficial clinical treatment'],
  ['__control_candidate_b', 'animal laboratory protocol'],
  ['__control_candidate_c', 'neutral result'],
  ['__control_candidate_c', 'neutral result'],
].map(([title, abstract], i) => ({id:'__control_' + i, title, abstract}));
const labels = Object.fromEntries(records.slice(0,4).map((r,i) => [r.id,i<2?1:0]));

test('worker imports the exact frozen core bytes', () => {
  const {imports} = worker();
  const core = imports.find(p => p === 'h2h/js/rank-core.js');
  assert.ok(core);
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,core))).digest('hex'),pin);
});

function parity(embedding) {
  const config = {engine:'u4',embModel:embedding ? '__control_model' : null,embW:0.5};
  const w = worker(config), R = w.ctx.ScreenRank;
  const before = JSON.stringify({records,labels});
  const reply = w.run({id:71,records,labels,embedding});
  assert.equal(reply.id,71);
  assert.equal(reply.error,undefined);
  const result = reply.result;
  let X = R.tfidf(records.map(r => r.title + ' ' + r.abstract), R.ELAS_U4);
  if (embedding) X = R.appendDense(X,embedding.values,embedding.dim,config.embW);
  const prior = [0,1,2,3], y = [1,1,0,0];
  const model = R.trainSVM(X,prior,y,R.balancedWeights(y,R.ELAS_U4.ratio),R.ELAS_U4.C,{seed:1});
  const expected = [4,5,6,7].map(index=>({index,score:R.score(X,model,index)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index);
  assert.deepEqual(Array.from(result.ranked,r=>r.index),expected.map(r=>r.index));
  assert.deepEqual(Array.from(result.ranked,r=>r.score),expected.map(r=>r.score));
  // Hold the first fit fixed to expose its complete Max order via simulate.
  const gold = [1,1,0,0,1,1,1,1];
  const frozen = R.simulate(X,gold,prior,{...R.ELAS_U4,retrainEvery:records.length,seed:1});
  assert.deepEqual(Array.from(frozen).slice(4),expected.map(r=>r.index));
  // With normal per-decision refits, the first next record is identical.
  const normal = R.simulate(X,gold,prior,{...R.ELAS_U4,retrainEvery:1,seed:1});
  assert.equal(normal[4],expected[0].index);
  assert.equal(JSON.stringify({records,labels}),before);
  assert.equal(result.ranked.length,4);
  return result;
}
test('2+2 labels: worker ordering equals simulate first fit, with stable index ties', () => {
  const result=parity();
  const a=result.ranked.findIndex(r=>r.index===6), b=result.ranked.findIndex(r=>r.index===7);
  assert.ok(a<b);
});
test('synthetic dense block uses appendDense and the single config weight', () => {
  const values=Float32Array.from([1,0, 1,0, 0,1, 0,1, 1,0, 0,1, 0.6,0.8, 0.6,0.8]);
  assert.equal(parity({model:'__control_model',dim:2,values}).semantic.weight,0.5);
});
test('incomplete/mismatched embeddings are rejected, request id is preserved', () => {
  const w=worker({engine:'u4',embModel:'__control_model',embW:0.5});
  assert.match(w.run({id:8,records,labels,embedding:{model:'wrong',dim:2,values:[]}}).error,/model/);
  const result=w.run({id:9,records,labels,embedding:{model:'__control_model',dim:2,values:[1]}});
  assert.equal(result.id,9);
  assert.match(result.error,/incomplete/);
});
test('missing labels fail the gate and configured but unavailable vectors use lexical features', () => {
  const w=worker({engine:'u4',embModel:'__control_model',embW:0.5});
  assert.match(w.run({id:1,records,labels:{}}).error,/two relevant/);
  assert.equal(w.run({id:2,records,labels}).result.semantic,null);
});

test('maybe decisions remain in the feature corpus but not the undecided queue', () => {
  const w=worker();
  const data=records.map(r=>({...r}));
  data[4].undecided=false;
  const result=w.run({id:3,records:data,labels}).result;
  assert.deepEqual(Array.from(result.ranked,r=>r.index).sort(),[5,6,7]);
});

test('frozen SPECTER2 pack requires every row and matching provenance before switching', () => {
  const w=worker();
  const values=Float32Array.from({length:records.length*768},(_,i)=>i%768===0?1:0);
  const embedding={model:'specter2',dim:768,values,packSha:'2b1dc054c82e7ad6cf20456b11bee978416468c1af399383dbbd66b307d5748a',pooling:'cls',maxTokens:256,prefix:''};
  assert.equal(w.run({id:10,records,labels}).result.variant,'u4');
  assert.equal(w.run({id:11,records,labels,embedding:{...embedding,values:values.slice(768)}}).result.variant,'u4');
  assert.equal(w.run({id:12,records,labels,embedding:{...embedding,packSha:'tampered'}}).result.variant,'u4');
  const result=w.run({id:13,records,labels,embedding}).result;
  assert.equal(result.variant,'u4+specter2');
  assert.equal(result.semantic.dim,768);
  assert.equal(result.semantic.weight,0.5);
  assert.equal(result.semantic.packSha,embedding.packSha);
});
