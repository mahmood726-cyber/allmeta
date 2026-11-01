// Synthetic inputs only. Exercise the actual page parsers, not copied estimators.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../../../../'+p,import.meta.url),'utf8');
function harness(app){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',click(){this.clicked=(this.clicked||0)+1;},dispatchEvent(e){this.event=e.type;}});return nodes.get(id);};
  const context=vm.createContext({document:{getElementById:node,querySelector:node},console,TextDecoder,Uint8Array,ArrayBuffer,Event});context.window=context;
  for(const p of ['shared/revman-reader.js','shared/alm-revman.js',app+'/alm-revman.js']){context.module={exports:{}};vm.runInContext(source(p),context);}
  return {context,node,adapter:context.module.exports};
}
function pageFunction(app,name){
  const html=source(app+'/index.html'),start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);
  let at=html.indexOf('{',start),depth=1;
  while(depth&&++at<html.length){if(html[at]==='{')depth++;if(html[at]==='}')depth--;}
  return html.slice(start,at+1);
}

for (const source of ['provenance', 'subgroup']) test('cumulative refuses tab-delimited subgroup corruption: '+source, () => {
  const h=harness('cumulative-subgroup');
  vm.runInContext(pageFunction('cumulative-subgroup','parseStudies'),h.context);
  const row={study:'Synthetic A',yi:0.2,sei:0.1,year:2020};
  const withGroup=group=>source==='provenance'?{...row,provenance:{choice:{subgroup:group}}}:{...row,subgroup:group};
  h.adapter.entry.apply([withGroup('Control, subgroup')]);
  const before=h.node('f-data').value;
  assert.equal(h.context.parseStudies(before).studies[0].group,'Control, subgroup');
  assert.equal(h.adapter.read()[0].subgroup,'Control, subgroup');
  assert.throws(()=>h.adapter.entry.apply([withGroup('Group\tSecond')]),/subgroup/i);
  assert.equal(h.node('f-data').value,before,'refusal must leave native inputs unchanged');
});
for (const app of ['cumulative-subgroup','heterogeneity']) test(app+': refuse study labels that native parsing trims', () => {
  const h=harness(app);
  vm.runInContext(pageFunction(app,'parseStudies'),h.context);
  const row={study:'Synthetic A',yi:0.2,sei:0.1};
  h.adapter.entry.apply([row]);
  const before=h.node('f-data').value;
  assert.equal(h.context.parseStudies(before).studies[0].label,row.study);
  assert.equal(h.adapter.read()[0].study,row.study);
  for(const study of [' Synthetic A','Synthetic A ']) {
    assert.throws(()=>h.adapter.entry.apply([{...row,study}]),/name|label/i);
    assert.equal(h.node('f-data').value,before);
  }
});
test('cumulative refuses subgroup names that native parsing trims', () => {
  const h=harness('cumulative-subgroup');
  const row={study:'Synthetic A',yi:0.2,sei:0.1,subgroup:'Control subgroup'};
  h.adapter.entry.apply([row]);
  const before=h.node('f-data').value;
  assert.equal(h.adapter.read()[0].subgroup,row.subgroup);
  for(const subgroup of [' Group','Group ']) {
    assert.throws(()=>h.adapter.entry.apply([{...row,subgroup}]),/subgroup/i);
    assert.equal(h.node('f-data').value,before);
  }
});
