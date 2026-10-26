// Synthetic rows; compare adapters with the actual native page parsers.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../../../../'+p,import.meta.url),'utf8');
function pageFunction(app,name){
  const html=source(app+'/index.html'),start=html.indexOf('function '+name+'(');
  assert.ok(start>=0,name);
  let at=html.indexOf('{',start),depth=1;
  while(depth&&++at<html.length){if(html[at]==='{')depth++;if(html[at]==='}')depth--;}
  return html.slice(start,at+1);
}
function harness(app){
  const nodes=new Map(),node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',click(){this.clicked=(this.clicked||0)+1;}});
    return nodes.get(id);
  };
  const context=vm.createContext({document:{getElementById:node},TextDecoder,Uint8Array,ArrayBuffer});
  context.window=context;
  for(const path of ['shared/alm-revman.js',app+'/alm-revman.js']){
    context.module={exports:{}};vm.runInContext(source(path),context);
  }
  const names=app==='mh-peto'?['splitFields','isCount','looksNumeric','parseInput']:['parseStudies'];
  vm.runInContext(names.map(n=>pageFunction(app,n)).join('\n')+'\nvar COUNT_RE=/^\\d+$/;',context);
  return {node,context,adapter:context.module.exports};
}

test('MH/Peto refuses imported names that native parsing trims, before changing inputs or provenance',async()=>{
  const h=harness('mh-peto');h.node('measure').value='OR';
  const R=h.context.AlmRevmanReader,A=h.context.AlmRevman;
  const review=name=>R.parseText('<COCHRANE_REVIEW><STUDY ID="source-id" NAME="'+name+'" YEAR="2020"/>'+
    '<COMPARISON><DICH_OUTCOME EFFECT_MEASURE="OR"><DICH_DATA STUDY_ID="source-id" EVENTS_1="0" TOTAL_1="40" EVENTS_2="4" TOTAL_2="42"/></DICH_OUTCOME></COMPARISON></COCHRANE_REVIEW>');
  const spec={entry:h.adapter.entry,revman:h.adapter},choice={comparison:0,outcome:0,subgroup:0};
  await A.applySelection(spec,review('Synthetic, control'),choice,'control.rm5');
  assert.equal(h.context.parseInput(h.node('src').value).rows[0].label,'Synthetic, control');
  assert.equal(A.current(spec)[0].studyId,'source-id');
  const before=h.node('src').value,state=JSON.stringify(h.context.AlmFeaturesState);
  for(const name of [' Synthetic trial','Synthetic trial ']){
    // Demonstrate the native incompatibility independently of adapter validation.
    const text=R.csvRows([[name,0,40,4,42]]);
    assert.equal(h.context.parseInput(text).rows[0].label,name.trim());
    await assert.rejects(A.applySelection(spec,review(name),choice,'bad.rm5'),/name|label/i);
    assert.equal(h.node('src').value,before);
    assert.equal(JSON.stringify(h.context.AlmFeaturesState),state);
    assert.equal(h.node('btn-run').clicked,1);
  }
});

test('cumulative export preserves quoted hash-prefixed studies and skips actual comments',()=>{
  const h=harness('cumulative-subgroup');
  h.node('f-data').value='# Input comment\nStudy,yi,se,year,subgroup\n"# Synthetic, trial",0.2,0.1,2020,Group\nControl,-0.1,0.2,2021,Group';
  const native=h.context.parseStudies(h.node('f-data').value);
  assert.equal(native.warnings.length,0);
  assert.equal(native.studies.length,2);
  const spec={entry:h.adapter.entry,revman:h.adapter},rows=h.context.AlmRevman.current(spec);
  assert.equal(rows.length,native.studies.length,'export must not silently omit a native study');
  assert.deepEqual(Array.from(rows,r=>[r.study,r.yi,r.sei]),Array.from(native.studies,r=>[r.label,r.est,r.se]));
  const R=h.context.AlmRevmanReader;
  const back=R.select(R.parseText(R.exportCSV(rows,'generic').csv),{comparison:0,outcome:0,subgroup:0},'generic');
  assert.deepEqual(Array.from(back,r=>r.study),['# Synthetic, trial','Control']);
});

test('cumulative export control retains ordinary rows, quoted multiline subgroups, and comments',()=>{
  const h=harness('cumulative-subgroup');
  h.node('f-data').value='# Input comment\nSynthetic,0.2,0.1,2020,"First line\n# subgroup text, continued"\nControl,-0.1,0.2,2021,Group';
  const native=h.context.parseStudies(h.node('f-data').value),rows=h.adapter.read();
  assert.equal(native.warnings.length,0);
  assert.equal(rows.length,2);
  assert.deepEqual(Array.from(rows,r=>[r.study,r.subgroup]),Array.from(native.studies,r=>[r.label,r.group]));
});

test('cumulative export still refuses an unmatched quote instead of repairing a study label',()=>{
  const h=harness('cumulative-subgroup');
  h.node('f-data').value='"Synthetic,0.2,0.1';
  assert.throws(()=>h.adapter.read(),/quot/i);
});
