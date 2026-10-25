// Synthetic inputs only. Exercise the actual page parsers, not copied estimators.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../../../../'+p,import.meta.url),'utf8');
const generic=()=>Array.from({length:5},(_,i)=>({study:'Synthetic '+String.fromCharCode(65+i),studyId:'synthetic-'+i,year:2020+i,yi:[-.25,.1,-.4,.2,.05][i],sei:[.125,.2,.25,.15,.1][i],provenance:{choice:{subgroup:'Selected group'}}}));
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
const plain=v=>JSON.parse(JSON.stringify(v));
for(const app of ['influence','limit-ma','gosh'])test(app+': native parser parity, current edits and PLANTED invalid import/export refusal',()=>{
  const h=harness(app),rows=generic();
  vm.runInContext('var NUM=/^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?$/;'+pageFunction(app,'parse'),h.context);
  h.adapter.entry.apply(rows);
  const parsed=h.context.parse(h.node('src').value),actual=Array.isArray(parsed)?parsed:parsed.rows;
  assert.deepEqual(plain(actual.map(r=>[r.label,r.te,r.se])),rows.map(r=>[r.study,r.yi,r.sei]));
  assert.equal(h.node('btn-run').clicked,1);
  const before=h.node('src').value;
  for(const bad of [[{...rows[0],sei:0}],rows.map((r,i)=>i?r:{...r,study:'Ambiguous, name'}),rows.slice(0,2)]){
    assert.throws(()=>h.adapter.entry.apply(bad),/SE|name|studies|rows/i);assert.equal(h.node('src').value,before);
  }
  h.node('src').value='-0.75,0.25,Edited\n0.2,0.1,Control\n0.4,0.2,Third';
  assert.equal(h.adapter.read()[0].yi,-.75);
  h.node('src').value='0x10,0.25,Invalid';assert.throws(()=>h.adapter.read(),/number|numeric/i);
});
test('pubbias native generic and binary modes; PLANTED numeric labels and format mismatch refused',()=>{
  const h=harness('pubbias-tests'),rows=generic();
  vm.runInContext(['parseLines','parseTESE','parseBinary'].map(n=>pageFunction('pubbias-tests',n)).join('\n'),h.context);
  h.node('format').value='te-se';h.adapter.entry.apply(rows);
  assert.deepEqual(plain(h.context.parseTESE(h.node('src').value).map(r=>[r.te,r.se])),rows.map(r=>[r.yi,r.sei]));
  assert.deepEqual(plain(h.adapter.read().map(r=>[r.study,r.yi,r.sei])),rows.map(r=>[r.study,r.yi,r.sei]));
  const before=h.node('src').value;
  assert.throws(()=>h.adapter.entry.apply(rows.map((r,i)=>i?r:{...r,study:'2020'})),/name|numeric/i);
  assert.equal(h.node('src').value,before);
  h.node('format').value='binary';
  assert.throws(()=>h.adapter.entry.apply(rows),/number|schema/i);
  const binary=rows.map((r,i)=>({...r,ai:i,n1i:40,ci:i+3,n2i:42}));h.adapter.entry.apply(binary);
  assert.equal(h.adapter.entry.schema,'binary2x2');
  assert.deepEqual(plain(h.context.parseBinary(h.node('src').value).map(r=>[r.e1,r.n1,r.e2,r.n2])),binary.map(r=>[r.ai,r.n1i,r.ci,r.n2i]));
  assert.equal(h.adapter.read()[0].ai,0);
  h.node('src').value='0,40,3,42';assert.equal(h.adapter.read()[0].ai,0);
});
test('cumulative native parser retains source years and selected group; PLANTED unrepresentable year refused',()=>{
  const h=harness('cumulative-subgroup'),rows=generic();
  vm.runInContext(pageFunction('cumulative-subgroup','parseStudies'),h.context);
  h.adapter.entry.apply(rows);
  const actual=h.context.parseStudies(h.node('f-data').value);
  assert.equal(actual.warnings.length,0);assert.equal(h.node('f-data').event,'input');
  assert.deepEqual(plain(actual.studies.map(r=>[r.label,r.est,r.se,r.year,r.group])),rows.map(r=>[r.study,r.yi,r.sei,r.year,'Selected group']));
  assert.equal(h.adapter.read()[0].year,2020);
  const before=h.node('f-data').value;
  assert.throws(()=>h.adapter.entry.apply([{...rows[0],year:'2020b'}]),/year/i);assert.equal(h.node('f-data').value,before);
  h.node('f-data').value='Edited,-0.5,0.25,2025,Changed group';
  assert.equal(h.adapter.read()[0].year,2025);assert.equal(h.adapter.read()[0].subgroup,'Changed group');
  h.node('f-data').value='Invalid,0x10,0.25,2020,Group';assert.throws(()=>h.adapter.read(),/number|numeric/i);
});
test('current native year edits override imported metadata; PLANTED stale year must not be restored',()=>{
  const h=harness('cumulative-subgroup'),rows=generic();
  h.context.AlmFeaturesState={revman:{records:rows}};
  h.node('f-data').value='Synthetic A,-0.5,0.25,2025,Changed group';
  const current=h.context.AlmRevman.current({entry:h.adapter.entry,revman:h.adapter});
  assert.equal(current[0].year,2025);assert.equal(current[0].studyId,'synthetic-0');
});
test('continuous export rejects hex and blank numeric tokens with a valid decimal control',()=>{
  const h=harness('effect-size-converter');
  const accuracy=source('effect-size-converter/index.html').match(/src="([^"]*accuracy[^"]*\.js)"/)[1];
  vm.runInContext(source('effect-size-converter/'+accuracy),h.context);
  const set=(token)=>{
    h.node('#alm-csv-mount textarea').value='m1,sd1,n1,m2,sd2,n2\n'+token+',1.2,40,4.5,1.4,42';
    const s=h.context.AlmEffectAccuracy.fromMeans(Number(token),1.2,40,4.5,1.4,42);
    h.node('in-type').value='SMD';h.node('in-smd-kind').value='g';h.node('in-est').value=String(s.g);h.node('in-se').value=String(s.se);
  };
  set('5.25');assert.equal(h.adapter.read()[0].m1i,5.25);
  for(const bad of ['0x10','0b10','']){set(bad);assert.throws(()=>h.adapter.read(),/number|numeric|Missing/i);}
});
test('mh-peto exports all valid native header forms; PLANTED invalid data after header refused',()=>{
  const h=harness('mh-peto');h.node('measure').value='OR';
  vm.runInContext(['splitFields','isCount','looksNumeric','parseInput'].map(n=>pageFunction('mh-peto',n)).join('\n')+'\nvar COUNT_RE=/^\\d+$/;',h.context);
  const text='Label,e1,n1,e2,n2\nSynthetic,0,40,4,42';
  h.node('src').value=text;assert.equal(h.context.parseInput(text).errors.length,0);assert.equal(h.adapter.read()[0].ai,0);
  h.node('src').value=text.replace('0,40','1.5,40');assert.throws(()=>h.adapter.read(),/whole-number|number/i);
});
test('all compatible pairwise pages load the RevMan host, reader and native adapter in order',()=>{
  function wired(text){
    const scripts=['../shared/alm-features.js','../shared/revman-reader.js','../shared/alm-revman.js','alm-revman.js'];
    const positions=scripts.map(p=>text.indexOf('<script src="'+p+'"></script>'));
    return positions.every((p,i)=>p>=0&&(i===0||p>positions[i-1]));
  }
  for(const app of ['heterogeneity','mh-peto','effect-size-converter','influence','limit-ma','gosh','pubbias-tests','cumulative-subgroup']){
    const html=source(app+'/index.html');assert.equal(wired(html),true,app);
    assert.equal(wired(html.replace('<script src="alm-revman.js"></script>','')),false,'PLANTED missing native adapter');
  }
});
test('CSV round trip keeps edited per-row subgroups rather than restoring the imported group',()=>{
  const h=harness('cumulative-subgroup'),r={...generic()[0],subgroup:'Edited subgroup'};
  const csv=h.context.AlmRevmanReader.exportCSV([r],'generic',{comparison:'Synthetic',outcome:'Effect',subgroup:'Old subgroup'}).csv;
  const review=h.context.AlmRevmanReader.parseText(csv);
  assert.equal(review.comparisons[0].outcomes[0].subgroups[0].name,'Edited subgroup');
});
