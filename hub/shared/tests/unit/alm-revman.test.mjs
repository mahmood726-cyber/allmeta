// All numbers/identifiers are synthetic software fixtures, never research output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const R = require('../../../../shared/alm-revman.js').reader;
const fixture = name => readFileSync(new URL('../fixtures/revman/' + name, import.meta.url), 'utf8');
const xml = () => R.parseText(fixture('multi.rm5'));
const pick = (review, outcome = 0, subgroup = 0, schema = 'binary2x2') => R.select(review, {comparison: 0, outcome, subgroup}, schema, {filename: 'multi.rm5'});

test('rm5 actual CONT/IV tags, child NAME, study IDs/years, Unicode and zero cell', () => {
  const r = xml();
  assert.equal(r.comparisons.length, 2);
  assert.equal(r.comparisons[0].name, 'Synthetic A versus B');
  const b = pick(r), c = pick(r, 1, 0, 'continuous'), g = pick(r, 2, 0, 'generic');
  assert.deepEqual(b.map(x => [x.study, x.studyId, x.year, x.ai, x.n1i, x.ci, x.n2i]), [['Étude α','s1',2020,0,40,4,42],['試験 β','s2',2021,7,60,11,61]]);
  assert.deepEqual([c[0].m1i,c[0].sd1i,c[0].n1i,c[0].m2i,c[0].sd2i,c[0].n2i], [5.25,1.2,40,4.5,1.4,42]);
  assert.deepEqual(g.map(x => [x.yi,x.sei]), [[-0.25,0.125],[0.1,0.2]]);
  assert.equal(g[0].effectMeasure, 'HR');
  assert.deepEqual(xml(), xml(), 'deterministic identifiers');
});

test('legacy fixture remains readable and bus refuses generic IV rather than fabricating counts', async () => {
  const buf = readFileSync(new URL('../../../../tests/fixtures/revman/tiny.rm5', import.meta.url));
  const r = await R.parse(buf);
  assert.equal(r.comparisons[0].outcomes[0].studies[0].arms[0].events, 1135);
  assert.equal(r.comparisons[0].outcomes[1].studies[0].arms[0].n, 13780);
  const g = xml().comparisons[0].outcomes[2];
  assert.equal(R.comparisonToBus({outcomes: [g]})._unsupported, 'generic');
});

test('PLANTED: no automatic comparison/outcome/subgroup or coercion of invalid indices', () => {
  for (const selection of [{}, {comparison:0}, {comparison:0,outcome:0}, {comparison:0,outcome:0,subgroup:null}, {comparison:0,outcome:0,subgroup:-1}, {comparison:0,outcome:0,subgroup:'0'}]) {
    assert.throws(() => R.select(xml(), selection, 'binary2x2'), /choose|select|subgroup|comparison|outcome/i);
  }
  assert.equal(pick(xml(),0,1)[0].studyId,'s3');
  assert.throws(() => pick(xml(),0,0,'generic'), /binary|schema|compatible/i);
});

test('provenance carries file, comparison, outcome, subgroup, IDs and exact values', () => {
  const r = pick(xml())[0], p = r.provenance;
  assert.equal(p.location, 'RevMan file multi.rm5, comparison Synthetic A versus B, outcome Synthetic events');
  assert.equal(p.choice.subgroup,'First subgroup');
  assert.equal(p.studyId, 's1');
  assert.equal(p.year, 2020);
  assert.equal(p.values.find(v=>v.field==='ai').value, 0);
  assert.equal(p.confirmed, false, 'file import is not confirmation against a paper');
});

for (const [file,schema,values] of [
  ['binary.csv','binary2x2',[0,40,4,42]],
  ['continuous.csv','continuous',[5.25,1.2,40,4.5,1.4,42]],
  ['generic.csv','generic',[-0.25,0.125]]
]) test('CSV and tab '+schema+': exact numbers, round trip, PLANTED invalid data', () => {
  const text=fixture(file), r=R.parseText(text), fields=R.fields[schema];
  const rows=pick(r,0,0,schema);
  assert.deepEqual(fields.map(f=>rows[0][f]),values);
  assert.deepEqual(fields.map(f=>pick(R.parseText(text.replaceAll(',', '\t')),0,0,schema)[0][f]),values);
  const out=R.exportCSV(rows,schema,{comparison:'A, B',outcome:'Outcome "quoted"',subgroup:'Chosen'});
  const back=pick(R.parseText(out.csv),0,0,schema);
  assert.deepEqual(back.map(x=>fields.map(f=>x[f])),rows.map(x=>fields.map(f=>x[f])));
  assert.deepEqual(back.map(x=>[x.study,x.studyId,x.year]),rows.map(x=>[x.study,x.studyId,x.year]));
  assert.match(out.note,/recompute/i);
  assert.throws(()=>R.exportCSV([{...rows[0],[fields.at(-1)]:-1}],schema), /invalid|positive|total|SD|SE/i);
  assert.throws(()=>R.parseText(text.replace(/,40,|,0.125,/,',NaN,')), /number|numeric|invalid/i);
});

test('PLANTED malformed XML/CSV, missing values, trailing junk, invalid year and unresolved study refused', () => {
  const good=fixture('multi.rm5');
  for(const bad of [fixture('malformed.rm5'),good.replace('EVENTS_1="0"','EVENTS_1="4oops"'),good.replace('TOTAL_1="40"','TOTAL_1=""'),good.replace('EVENTS_1="0"','EVENTS_1="41"'),good.replace('SD_1="1.2"','SD_1="-1"'),good.replace('SE="0.125"','SE="0"'),good.replace('YEAR="2020"','YEAR="20xx"'),good.replace('STUDY_ID="s1"','STUDY_ID="missing"')]) {
    assert.throws(()=>R.parseText(bad), /malformed|invalid|missing|study|number|SD|SE|year|events|total/i);
  }
  assert.throws(()=>R.parseText('Study,Effect Estimate,SE\n"unclosed,0.1,0.2'), /quote|CSV/i);
  assert.throws(()=>R.parseText('Study,Effect Estimate,SE\nA,0.1'), /column|row|CSV/i);
  assert.throws(()=>R.parseText('<!DOCTYPE x [<!ENTITY a "x">]><COCHRANE_REVIEW/>'), /DOCTYPE|DTD/i);
  assert.equal(pick(xml()).length,2);
});

test('PLANTED duplicate studies within chosen group refused; duplicate labels with distinct IDs retained', () => {
  const good=fixture('multi.rm5');
  assert.throws(()=>R.parseText(good.replace('STUDY_ID="s2" EVENTS','STUDY_ID="s1" EVENTS')),/duplicate/i);
  const rows=pick(R.parseText(good.replace('NAME="試験 β"','NAME="Étude α"')));
  assert.equal(rows.length,2);assert.notEqual(rows[0].studyId,rows[1].studyId);
});

test('full Web analysis columns choose populated data type; never use displayed ratio or weight as input', () => {
  const csv='Analysis group,Analysis number,Analysis name,Subgroup,Study,Study year,GIV Mean,GIV SE,Experimental mean,Experimental SD,Experimental cases,Experimental N,Control mean,Control SD,Control cases,Control N,Mean,Weight\n1,1,Events,,A,2020,,,,,0,40,,,4,42,0.5,99\n1,2,Effect,,B,2021,-0.25,0.125,,,,,,,,,0.7788,99';
  const r=R.parseText(csv);
  assert.equal(pick(r)[0].ai,0);
  assert.equal(pick(r,1,0,'generic')[0].yi,-0.25);
  assert.throws(()=>R.parseText(csv.replace('SUBGROUP','SUBGROUP').replace('0.125,,,,','0.125,2,1,3,')),/mixed|ambiguous/i);
});

test('PLANTED spreadsheet formulas and unknown/ambiguous headers are refused, safe quotes preserved', () => {
  const good=pick(xml());
  for(const study of ['=1+1','+SUM(A1)','@formula','\tcmd']) assert.throws(()=>R.exportCSV([{...good[0],study}],'binary2x2'),/formula|unsafe/i);
  assert.throws(()=>R.parseText('Study,Mean,SE\nA,0.8,0.1'),/header|ambiguous|unsupported/i);
  assert.throws(()=>R.parseText('Study,Effect Estimate,SE,SE\nA,0.8,0.1,0.2'),/duplicate|ambiguous/i);
});

test('apply uses registered entry.apply and commits provenance only on successful, complete import', async t => {
  const previous=globalThis.AlmFeaturesState;t.after(()=>{globalThis.AlmFeaturesState=previous;});
  const A=require('../../../../shared/alm-revman.js');
  let received;
  const spec={entry:{schema:'binary2x2',apply:rows=>{received=rows;return {ok:true,n:rows.length};}}};
  globalThis.AlmFeaturesState={provenance:[{id:'old'}],entryLog:[]};
  await A.applySelection(spec,xml(),{comparison:0,outcome:0,subgroup:0},'multi.rm5');
  assert.equal(received.length,2);assert.equal(globalThis.AlmFeaturesState.provenance[0].studyId,'s1');
  const before=JSON.stringify(globalThis.AlmFeaturesState);
  for(const result of [{ok:false,error:'planted refusal'},{ok:true,n:1}]) {
    await assert.rejects(A.applySelection({entry:{schema:'binary2x2',apply:()=>result}},xml(),{comparison:0,outcome:0,subgroup:0},'multi.rm5'),/refusal|complete|import|rows/i);
    assert.equal(JSON.stringify(globalThis.AlmFeaturesState),before);
  }
});

test('RevMan 5 clipboard repeated arm columns retain order; PLANTED incomplete repeated header refused',()=>{
  const copy='Study or Subgroup\tEvents\tTotal\tEvents\tTotal\tWeight\nÉtude α\t0\t40\t4\t42\t25%';
  assert.deepEqual(R.fields.binary2x2.map(f=>pick(R.parseText(copy))[0][f]),[0,40,4,42]);
  assert.throws(()=>R.parseText(copy.replace('Events\tTotal\tEvents','Events\tWrong\tEvents')),/header|ambiguous|unsupported/i);
  const continuous='Study or Subgroup\tMean\tSD\tTotal\tMean\tSD\tTotal\nSynthetic\t-1\t2\t30\t0\t3\t31';
  assert.deepEqual(R.fields.continuous.map(f=>pick(R.parseText(continuous),0,0,'continuous')[0][f]),[-1,2,30,0,3,31]);
});

test('RevMan Web upload CSV package has documented arm/contrast columns, correct reference arm and exact data',()=>{
  const meta={outcome:'Synthetic outcome',arm1:'A',arm2:'B',effectMeasure:'HR'};
  for(const [schema,oi] of [['binary2x2',0],['continuous',1],['generic',2]]){
    const rows=pick(xml(),oi,0,schema),p=R.exportPackage(rows,schema,meta);
    const table=R.splitTable(p.results),head=table.shift();
    const objects=table.map(row=>Object.fromEntries(head.map((k,i)=>[k,row[i]])));
    assert.equal(objects.length,rows.length*2);
    assert.equal(objects[0].Study,'s1');assert.equal(objects[0].Outcome,meta.outcome);
    assert.deepEqual(objects.slice(0,2).map(r=>r.Arm),['A','B']);
    if(schema==='binary2x2')assert.deepEqual(objects.slice(0,2).map(r=>[r.Cases,r['Sample size']]),[['0','40'],['4','42']]);
    if(schema==='continuous')assert.deepEqual(objects.slice(0,2).map(r=>[r.Mean,r.SD,r['Sample size']]),[['5.25','1.2','40'],['4.5','1.4','42']]);
    if(schema==='generic'){
      assert.deepEqual(objects.slice(0,2).map(r=>[r.Mean,r.SE,r['Reference arm']]),[['-0.25','0.125','false'],['','','true']]);
      assert.equal(objects[0]['Effect measure'],'log[Hazard Ratio]');
      assert.equal(objects[0]['Data type'],'Contrast level');
    }else{assert.equal(objects[0]['Data type'],'Arm level');assert.equal(objects[0]['Effect measure'],'');}
    assert.match(p.information,/Study,Year/);assert.match(p.arms,/Study,Arm,Description,Intervention/);
    assert.match(p.note,/recompute/);
    assert.throws(()=>R.exportPackage(rows,schema,{...meta,arm2:'A'}),/distinct/i);
    assert.throws(()=>R.exportPackage(rows,schema,{...meta,outcome:''}),/outcome/i);
  }
  assert.throws(()=>R.exportPackage(pick(xml(),2,0,'generic'),'generic',{...meta,effectMeasure:'OTHER'}),/effect measure/i);
});

test('PLANTED app adapter label/row gates reject before native inputs mutate; current export reads edits',()=>{
  const A=require('../../../../shared/alm-revman.js');
  const H=require('../../../../heterogeneity/alm-revman.js'),M=require('../../../../mh-peto/alm-revman.js'),C=require('../../../../effect-size-converter/alm-revman.js');
  assert.doesNotThrow(()=>H.entry.validate(pick(xml(),2,0,'generic')));
  assert.throws(()=>H.entry.validate([{...pick(xml(),2,0,'generic')[0],study:'#lost'}]),/native/);
  assert.doesNotThrow(()=>M.entry.validate(pick(xml())));
  assert.throws(()=>M.entry.validate([{...pick(xml())[0],study:'first\nsecond'}]),/newline/);
  assert.doesNotThrow(()=>C.entry.validate(pick(xml(),1,0,'continuous')));
  assert.throws(()=>C.entry.validate([pick(xml(),1,0,'continuous')[0],pick(xml(),1,1,'continuous')[0]]),/one study/);
  assert.throws(()=>A.check({entry:C.entry},R.parseText(fixture('continuous.csv')),{comparison:0,outcome:0,subgroup:0}),/one study/);
});

test('PLANTED export cannot restore a stale effect measure over current app data',()=>{
  const rows=pick(xml()).map(r=>({...r,effectMeasure:'RR'}));
  const back=pick(R.parseText(R.exportCSV(rows,'binary2x2',{effectMeasure:'OR'}).csv));
  assert.equal(back[0].effectMeasure,'RR');
});

// Exercise the page's OWN parser after entry.apply, with just the controls stubbed.
// Real browser rendering/result parity is separately required by features-revman.spec.mjs.
function pageFunction(app,name){
  const html=readFileSync(new URL('../../../../'+app+'/index.html',import.meta.url),'utf8');
  const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);
  let at=html.indexOf('{',start),depth=1;
  while(depth&&++at<html.length){if(html[at]==='{')depth++;if(html[at]==='}')depth--;}
  return html.slice(start,at+1);
}
function adapterHarness(app){
  const controls=new Map(),node=id=>{if(!controls.has(id))controls.set(id,{value:'',click(){this.clicked=(this.clicked||0)+1;}});return controls.get(id);};
  const doc={getElementById:node,querySelector:node};
  const context=vm.createContext({document:doc,console,TextDecoder,Uint8Array,ArrayBuffer,Number,Math,Set,Map,JSON,Error});
  context.window=context;
  for(const path of ['shared/revman-reader.js','shared/alm-revman.js',app+'/alm-revman.js']){
    context.module={exports:{}};vm.runInContext(readFileSync(new URL('../../../../'+path,import.meta.url),'utf8'),context);
  }
  return {context,adapter:context.module.exports,node};
}

test('heterogeneity adapter uses native parser and exports current edits; PLANTED invalid numeric input refused',()=>{
  const h=adapterHarness('heterogeneity');
  vm.runInContext(pageFunction('heterogeneity','parseStudies'),h.context);
  const rows=pick(xml(),2,0,'generic');h.adapter.entry.apply(rows);
  assert.equal(h.node('btn-run').clicked,1);
  const parsed=h.context.parseStudies(h.node('f-data').value);
  assert.equal(parsed.warnings.length,0);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.studies.map(s=>[s.label,s.est,s.se]))),rows.map(r=>[r.study,r.yi,r.sei]));
  h.node('f-data').value='Changed\t-0.5\t0.25';
  assert.equal(h.adapter.read()[0].yi,-0.5);
  for(const value of ['0x10','Infinity','1junk','']){
    h.node('f-data').value='Bad\t'+value+'\t0.25';
    assert.throws(()=>h.context.AlmRevman.current({entry:h.adapter.entry,revman:h.adapter}),/number|numeric|Invalid/);
  }
});

test('mh-peto adapter uses native parser; zero-cell, quoted Unicode labels, legacy input and current measure survive',()=>{
  const h=adapterHarness('mh-peto');
  vm.runInContext(['splitFields','isCount','looksNumeric','parseInput'].map(n=>pageFunction('mh-peto',n)).join('\n')+'\nvar COUNT_RE=/^\\d+$/;',h.context);
  h.node('measure').value='OR';const rows=pick(xml()).map((r,i)=>({...r,study:i?'試験 "β", synthetic':r.study}));h.adapter.entry.apply(rows);
  const parsed=h.context.parseInput(h.node('src').value);
  assert.equal(parsed.errors.length,0);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.rows.map(s=>[s.label,s.e1,s.n1,s.e2,s.n2]))),rows.map(r=>[r.study,r.ai,r.n1i,r.ci,r.n2i]));
  h.node('src').value='1,40,4,42,Legacy';h.node('measure').value='RR';
  assert.equal(h.adapter.read()[0].study,'Legacy');assert.equal(h.adapter.read()[0].effectMeasure,'RR');
  h.node('src').value='Bad,1.5,40,4,42';assert.throws(()=>h.adapter.read(),/whole-number/);
});

test('continuous entry uses native means/SD controls; PLANTED numerical overflow refused before applying',()=>{
  const h=adapterHarness('effect-size-converter');
  // The production accuracy module, never a duplicate formula.
  const html=readFileSync(new URL('../../../../effect-size-converter/index.html',import.meta.url),'utf8');
  const accuracy=html.match(/src="([^"]*accuracy[^"]*\.js)"/);assert.ok(accuracy);
  vm.runInContext(readFileSync(new URL('../../../../effect-size-converter/'+accuracy[1],import.meta.url),'utf8'),h.context);
  const rows=pick(xml(),1,0,'continuous');h.adapter.entry.apply(rows);
  assert.equal(h.node('#alm-csv-mount [data-action="parse-paste"]').clicked,1);
  assert.match(h.node('#alm-csv-mount textarea').value,/5.25,1.2,40,4.5,1.4,42/);
  const before=h.node('#alm-csv-mount textarea').value;
  assert.throws(()=>h.adapter.entry.apply([{...rows[0],sd1i:1e308}]),/finite|Invalid|overflow|variance|SD/i);
  assert.equal(h.node('#alm-csv-mount textarea').value,before);
});

test('PLANTED invalid XML syntax never recovered; valid entities and deterministic empty subgroup preserved',()=>{
  const good=fixture('multi.rm5');
  for(const bad of [good.replace('NAME="Étude α"','NAME="A &wrong;"'),good.replace('ID="s1"','ID="s1" ID="x"'),good+'<COCHRANE_REVIEW/>',good.replace('STUDY_ID="s1"','STUDY_ID="s1"bad="x"'),good.replace('EVENTS_1="0"','EVENTS_1="0x10"')])assert.throws(()=>R.parseText(bad),/Malformed|Invalid/);
  assert.equal(pick(R.parseText(good.replace('NAME="Étude α"','NAME="Étude &amp; &#945;"')))[0].study,'Étude & α');
});

test('UTF-8 BOM preserves provenance row, buffer view offsets and year suffix; invalid UTF-8 refused',async()=>{
  const text='\uFEFF'+fixture('multi.rm5').replace('YEAR="2020"','YEAR="2020b"');
  const row=pick(R.parseText(text))[0];assert.equal(row.year,'2020b');
  assert.ok(row.provenance.pastedText.startsWith('<DICH_DATA '));
  assert.ok(row.provenance.pastedText.endsWith('/>'));
  const bytes=Buffer.from(fixture('multi.rm5')),framed=Buffer.concat([Buffer.from('junk'),bytes,Buffer.from('junk')]);
  assert.equal((await R.parse(framed.subarray(4,-4))).comparisons.length,2);
  await assert.rejects(R.parse(new Uint8Array([0xff,0xfe,0x61])),/encoded|encoding|UTF/i);
});

test('ZIP review selection cannot silently take the first review file',async()=>{
  const magic=new Uint8Array([80,75,3,4]);
  const jszip={loadAsync:async()=>({files:{'one.rm5':{dir:false},'two.rm5':{dir:false}},file:()=>({async:async()=>fixture('multi.rm5')})})};
  await assert.rejects(R.parse(magic,{jszip}),/exactly one/);
  jszip.loadAsync=async()=>({files:{'one.rm5':{dir:false}},file:()=>({async:async()=>fixture('multi.rm5')})});
  assert.equal((await R.parse(magic,{jszip})).comparisons.length,2);
});

test('continuous single-study app requires an explicit row choice for a multi-row subgroup',()=>{
  const A=require('../../../../shared/alm-revman.js');
  const spec={entry:require('../../../../effect-size-converter/alm-revman.js').entry};
  const review=R.parseText(fixture('continuous.csv')),choice={comparison:0,outcome:0,subgroup:0};
  assert.throws(()=>A.check(spec,review,choice,'continuous.csv'),/one study/);
  assert.equal(A.check(spec,review,{...choice,study:1},'continuous.csv')[0].m1i,-1.5);
  for(const study of [-1,2,'1',null])assert.throws(()=>A.check(spec,review,{...choice,study},'continuous.csv'),/study/i);
  for(const study of [-1,1,'0',null])assert.throws(()=>A.check(spec,xml(),{comparison:0,outcome:1,subgroup:0,study},'multi.rm5'),/study/i);
  assert.equal(A.check(spec,xml(),{comparison:0,outcome:1,subgroup:0,study:0},'multi.rm5').length,1);
});

test('every R witness selection maps to native input; manifest covers every valid fixture',()=>{
  const lines=fixture('rcheck-cases.txt').trimEnd().split(/\r?\n/).map(l=>l.split('\t'));
  const head=lines.shift(),cases=lines.map(r=>Object.fromEntries(head.map((k,i)=>[k,r[i]])));
  const covered=[...new Set(cases.map(c=>c.file))].sort();
  const actual=readdirSync(new URL('../fixtures/revman/',import.meta.url)).filter(n=>/\.(rm5|csv)$/.test(n)&&n!=='malformed.rm5').sort();
  assert.deepEqual(covered,actual);
  assert.equal(new Set(cases.map(c=>c.case)).size,cases.length);
  for(const c of cases){
    const review=R.parseText(fixture(c.file));
    const spec={entry:require('../../../../'+c.app+'/alm-revman.js').entry};
    const choice={comparison:Number(c.comparison),outcome:Number(c.outcome),subgroup:Number(c.subgroup),...(c.study!==''?{study:Number(c.study)}:{})};
    const A=require('../../../../shared/alm-revman.js'),rows=A.check(spec,review,choice,c.file);
    assert.ok(rows.length>0,c.case);
    assert.ok(rows.every(r=>r.studyId&&r.year&&r.provenance.location.includes(c.file)),c.case);
    assert.throws(()=>A.check(spec,review,{...choice,subgroup:999},c.file),/subgroup/i);
  }
});

test('rm5 analysis settings survive parsing; natural-scale generic ratios fail closed',()=>{
  const text=fixture('multi.rm5').replace('LOG_DATA="YES"','LOG_DATA="YES" RANDOM="YES" METHOD="IV"');
  const r=R.parseText(text),o=r.comparisons[0].outcomes[2];
  assert.deepEqual(o.settings,{random:'YES',method:'IV',ciStudy:null,ciTotal:null});
  assert.equal(pick(r,2,0,'generic')[0].yi,-0.25);
  assert.throws(()=>pick(R.parseText(text.replace('LOG_DATA="YES"','LOG_DATA="NO"')),2,0,'generic'),/log|scale/i);
});
