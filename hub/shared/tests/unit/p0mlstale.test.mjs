import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../../../../multilevel-ma/index.html', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../../analysis-lifecycle.js', import.meta.url), 'utf8');
function harness() {
  const elements = Object.fromEntries(['src','summary','body','analysis-stale','analysis-status'].map(id => [id,{id,value:'fixture',hidden:true,innerHTML:'previous fit'}]));
  const listeners = {};
  const context = vm.createContext({ window: {alm:{}}, document: {
    getElementById: id => elements[id], querySelectorAll: () => [elements.src],
    addEventListener: (type, fn) => { listeners[type] = fn; }
  }, rows:[], fail:false });
  vm.runInContext(lifecycle, context);
  const start = html.indexOf('    function run() {');
  const end = html.indexOf('    function drawForest(', start);
  vm.runInContext(`
    var _lastResults = {mu:1}, _lastReml = {mu:1}, Z975=1.959963984540054;
    function parse() { return rows; }
    function fmt(x) { return String(x); }
    function drawForest() {}
    function fit(rows) { if(fail) throw Error('planted fit failure'); return {
      mu:0.3,seMu:0.1,seMuHK:0.1,tCrit:2,J:3,weights:rows.map(()=>1),
      tau2_study:0.02,tau2_within:0.01,I2_study:0.2,I2_within:0.1,I2_sampling:0.7
    }; }
    ${html.slice(start,end)}
    var wrapped = window.alm.analysisLifecycle(run, () => !!_lastResults, '#src');
  `,context);
  return {context,elements,listeners,run:()=>vm.runInContext('wrapped()',context)};
}
for (const n of [0,1,2]) test('refused '+n+' usable rows flags old results; valid refit control', () => {
  const h=harness(); h.context.rows=Array.from({length:n},()=>({study:'A',te:0.2,se:0.1}));
  h.run();
  assert.equal(h.elements['analysis-stale'].hidden,false);
  assert.equal(h.elements['analysis-status'].hidden,true);
  assert.equal(h.context._lastResults,null); assert.equal(h.context._lastReml,null);
  assert.equal(h.elements.summary.innerHTML,'previous fit');
  h.context.rows=Array.from({length:3},()=>({study:'A',te:0.2,se:0.1})); h.run();
  assert.equal(h.elements['analysis-stale'].hidden,true);
  assert.equal(h.elements['analysis-status'].hidden,false);
  assert.equal(h.context._lastResults.mu,0.3);
});
test('exception cannot expose a previous successful export; recovery control',()=>{
  const h=harness();h.context.rows=Array.from({length:3},()=>({study:'A',te:0.2,se:0.1}));
  h.context.fail=true; assert.throws(h.run,/planted/);
  assert.equal(h.elements['analysis-stale'].hidden,false);assert.equal(h.context._lastResults,null);
  h.context.fail=false; h.run(); assert.equal(h.elements['analysis-stale'].hidden,true);
});

test('valid input control succeeds without a stale flag',()=>{ const h=harness(); h.context.rows=Array.from({length:3},()=>({study:'A',te:0.2,se:0.1})); h.run(); assert.equal(h.elements['analysis-stale'].hidden,true); assert.equal(h.context._lastResults.mu,0.3); });

// Programmatic callers can invoke the raw run without a textarea input event.
test('raw validation run refuses short input and recovers without lifecycle wrapper',()=>{
  const h=harness();
  vm.runInContext('run()',h.context);
  assert.equal(h.elements['analysis-stale'].hidden,false);
  assert.equal(h.context._lastResults,null);
  h.context.rows=Array.from({length:3},()=>({study:'A',te:0.2,se:0.1}));
  vm.runInContext('run()',h.context);
  assert.equal(h.elements['analysis-stale'].hidden,true);
  assert.equal(h.context._lastResults.mu,0.3);
});
test('parser exception marks previous results stale; valid parser control recovers',()=>{
  const h=harness();
  vm.runInContext("parse = function () { throw Error('planted parse failure'); }",h.context);
  assert.throws(h.run,/planted parse failure/);
  assert.equal(h.elements['analysis-stale'].hidden,false);
  assert.equal(h.context._lastResults,null);
  assert.equal(h.context._lastReml,null);
  vm.runInContext('parse = function () { return rows; }',h.context);
  h.context.rows=Array.from({length:3},()=>({study:'A',te:0.2,se:0.1}));h.run();
  assert.equal(h.elements['analysis-stale'].hidden,true);
  assert.equal(h.context._lastResults.mu,0.3);
});

// Replay the multilevel branch of r1fix-lifecycle.spec.mjs with the real parser.
// Its empty-input assertion conflicts with the explicit P07 refusal contract:
// retained results must remain flagged until a successful refit.
test('P07 lifecycle edits, empty refusal and recovery preserve the stale-result warning',()=>{
  const h=harness();
  const parseStart=html.indexOf('    function parse(text) {');
  const parseEnd=html.indexOf('    function fmt(',parseStart);
  assert.ok(parseStart>=0 && parseEnd>parseStart);
  vm.runInContext(html.slice(parseStart,parseEnd),h.context);
  h.elements.src.matches=selector=>selector==='#src';
  const fill=text=>{
    h.elements.src.value=text;
    h.listeners.input({target:h.elements.src});
  };
  const clickRun=()=>{
    // A textarea change can be committed on blur before the Run click.
    h.listeners.change({target:h.elements.src});
    h.run();
  };
  const initial=html.match(/<textarea\b[^>]*id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  fill(initial);clickRun();
  assert.equal(h.elements['analysis-status'].hidden,false);
  assert.equal(h.elements['analysis-stale'].hidden,true);
  const summary=h.elements.summary.innerHTML;
  const body=h.elements.body.innerHTML;

  const valid=initial.trim().split('\n').slice(0,-1).join('\n');
  fill(valid);
  assert.equal(h.elements['analysis-stale'].hidden,false);
  fill('');clickRun();
  assert.equal(h.elements['analysis-status'].hidden,true);
  assert.equal(h.elements['analysis-stale'].hidden,false);
  assert.equal(h.elements.summary.innerHTML,summary);
  assert.equal(h.elements.body.innerHTML,body);
  assert.equal(h.context._lastResults,null);
  assert.equal(h.context._lastReml,null);

  fill(valid);clickRun();
  assert.equal(h.elements['analysis-status'].hidden,false);
  assert.equal(h.elements['analysis-stale'].hidden,true);
  assert.equal(h.context._lastResults.k,initial.trim().split('\n').length-1);
});
