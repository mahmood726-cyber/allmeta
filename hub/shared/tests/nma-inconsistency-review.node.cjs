const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {harness} = require('./nma-inconsistency-dom.cjs');
const pasted = 'A,B,.2,.1\nB,C,.3,.2\nA,C,.6,.15\nA,B,.25,.12';
const edit = (h, text) => {
  h.document.getElementById('src').value = text;
  h.document.getElementById('src').dispatchEvent(new h.c.Event('input'));
};
test('P1-1 rejected debounced Baker edit clears results and exports', async () => {
  const h = harness({live: true}), {c, document} = h;
  c.__almIncoLoad(c.AlmIncoExamples.find(x => /Baker/.test(x.label)).text);
  await h.advance(100);
  assert.ok(c.AlmIncoPlus.methodsText());
  edit(h, 'A,B,.1,.1');
  await h.advance(600);
  assert.equal(c._almLastInco().status, 'refused');
  assert.equal(document.querySelectorAll('#ns-body tr').length, 0);
  assert.equal(c.AlmIncoPlus.state().base.status, 'refused');
  assert.equal(c.AlmIncoPlus.state().loo, null);
  assert.equal(c.AlmIncoPlus.methodsText(), '');
  assert.throws(() => c.AlmIncoPlus.rScript(false));
  assert.throws(() => c.AlmIncoPlus.rScript(true));
  edit(h, pasted);
  await h.advance(600);
  assert.equal(c._almLastInco().dbt.df, 1);
  assert.equal(c.AlmIncoPlus.state().base.k, 4);
});
test('P1-2 loss of last loop is untestable, not a threshold crossing', () => {
  const {c} = harness(), P = c.AlmIncoPlusCore;
  const E = Object.fromEntries(['inputIssue','estimateTau2','fitNMA','nodeSplit','dbt'].map(k => [k,c[k]]));
  const L = P.loo(E, c.parse('A,B,0,.1,s1\nB,C,0,.1,s2\nA,C,1,.1,s3\nC,D,0,.1,s4'), 'FE');
  assert.ok(L.base.dbt.p < .05);
  const drop = L.drops.find(d => d.study === 's1');
  assert.equal(drop.globalTestable, false);
  assert.equal(drop.globalFlip, false);
  assert.equal(L.globalFlips.length, 0);
  assert.doesNotMatch(P.looSummary(L), /p crosses 0.05/);
  assert.match(P.looSummary(L), /untestable.*s1/);
  for (const [before, after, expected] of [[.01,.2,true],[.2,.01,true],[.01,.02,false],[null,.01,false],[.01,null,false],[NaN,.01,false],[.01,Infinity,false]]) {
    const base = {...L.base, dbt: {...L.base.dbt, p: before}};
    const fit = {...L.base, dbt: {...L.base.dbt, p: after}};
    assert.equal(P.summarizeDrop(base, fit, 'test', 0).globalFlip, expected);
  }
});
test('P1-3 usability valid-input assertion rejects disabled debounce auto-run', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'nma-inconsistency-usability.spec.mjs'), 'utf8');
  const predicate = source.match(/expect\.poll\(\(\)=>page\.evaluate\(\(\)=>(.*?)\)\)\.toBeTruthy/)[1];
  for (const mutant of [true, false]) {
    const h = harness({live: true, transformPlus: code => {
      if (!mutant) return code;
      const changed = code.replace(/(src\.value !== shownText\) )window\.run\(\);/, '$1void 0;');
      assert.notEqual(changed, code, 'mutation must remove the debounce run call');
      return changed;
    }});
    await h.advance(100);
    edit(h, pasted);
    await h.advance(600);
    assert.equal(!!vm.runInContext(predicate, h.c), !mutant,
      mutant ? 'browser assertion must reject previous results when auto-run is removed' : 'browser assertion must accept the newly computed result');
  }
});
