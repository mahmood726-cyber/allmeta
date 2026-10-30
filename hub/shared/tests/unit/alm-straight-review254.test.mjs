import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function page() {
  const source = readFileSync(new URL('../../../../component-nma/index.html', import.meta.url), 'utf8');
  const main = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('function parse(text)'))[1];
  const nodes = Object.fromEntries(['src','comp-body','int-body','forest','btn-run','alm-features'].map(id => [id, {innerHTML:'',setAttribute(){},addEventListener(){}}]));
  nodes.src.value = Array(5).fill('a | control | 0.2 | 0.1').join('\n');
  const listeners = {};
  const env = {document:{readyState:'complete',getElementById:id=>nodes[id]||null,
    querySelector:()=>({}),querySelectorAll:selector=>{
      const html=nodes[selector.includes('comp-body')?'comp-body':'int-body'].innerHTML;
      return [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map(m=>({cells:[...m[1].matchAll(/<td>(.*?)<\/td>/g)].map(c=>({textContent:c[1].replace(/<[^>]*>/g,'')}))}));
    },addEventListener(type,fn){(listeners[type]||=[]).push(fn);}},
    setTimeout:fn=>fn(),addEventListener(){},AlmStraightUI:{attach(){return {refresh(){}};}}};
  env.window=env;
  runInNewContext(main,env);
  runInNewContext(readFileSync(new URL('../../../../component-nma/alm-straight.js',import.meta.url),'utf8'),env);
  return {env,nodes,ctx:()=>env.AlmStraightAdapters['component-nma'].ctx(),edit(value,type='input'){
    nodes.src.value=value;
    for(const fn of listeners[type]||[])fn({target:nodes.src});
  }};
}

for(const type of ['input','change'])test('component advice drops retained fit after '+type+' and resumes after Run',()=>{
  const p=page();p.nodes.src.id='src';
  assert.equal(p.ctx().minPerComparison,5);
  assert.equal(p.ctx().estimates.length,2);
  const old=p.env._almLastCnma();
  p.edit('a | control | -0.1 | 0.2\na | control | 0.1 | 0.2',type);
  assert.equal(p.env._almLastCnma(),old,'the page retains its fit until Run');
  assert.equal(p.ctx().estimates,undefined,'old intervals must not describe edited input');
  assert.equal(p.ctx().minPerComparison,undefined,'new counts must not be mixed with old intervals');
  p.env.run();
  assert.equal(p.ctx().minPerComparison,2);
  assert.equal(p.ctx().estimates.length,2);
  p.edit('invalid contrast',type);
  assert.equal(p.ctx().estimates,undefined);
  p.env.run();
  assert.equal(p.env._almLastCnma(),null);
  assert.equal(p.ctx().estimates,undefined);
});

test('component advice remains available without a source edit',()=>{
  const p=page();
  const before=p.ctx();
  p.env.run();
  assert.equal(p.ctx().minPerComparison,before.minPerComparison);
  assert.deepEqual(p.ctx().estimates,before.estimates);
});
