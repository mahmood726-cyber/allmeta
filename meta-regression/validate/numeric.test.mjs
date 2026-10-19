import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base=new URL('../',import.meta.url);
await import(new URL('plus-engine.js',base));await import(new URL('validate/contract.js',base));
const read=p=>JSON.parse(readFileSync(new URL(p,base),'utf8'));
const corpus=read('validate/plus/corpus.json'),refs=read('validate/plus/reference.json'),manifest=read('validate/MANIFEST-plus.json');
const evidence={positiveNumeric:0,negativeNumeric:0,positiveDOM:0,negativeDOM:0,positivePlotValues:0,negativePlotValues:0};
test('pinned LF bytes, coverage and all R numerical comparisons',()=>{
 for(const f of manifest.files){const b=readFileSync(new URL(f.path,base));assert.equal(b.length,f.bytes);assert.equal(b.includes(13),false);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);const bad=Buffer.from(b);bad[20]^=1;assert.notEqual(createHash('sha256').update(bad).digest('hex'),f.sha256);}
 assert.equal(corpus.length,manifest.configurations);assert.equal(new Set(corpus.map(c=>c.id)).size,corpus.length);
 for(let i=0;i<corpus.length;i++){
  assert.equal(refs[i].id,corpus[i].id);const r=AlmMetaPlus.compute(corpus[i]),rows=AlmMetaPlusContract.audit(r,refs[i].result);
  for(const row of rows){assert.equal(row.pass,true,corpus[i].id+' '+JSON.stringify(row));evidence.positiveNumeric++;}
 }
 assert.equal(evidence.positiveNumeric,manifest.numericChecks);
 const candidates=read('validate/plus/candidates.json');assert.equal(new Set(candidates.map(c=>c.dataset)).size,114);
 assert.ok(candidates.every(c=>c.reason||c.configurations?.length));
});
test('every numerical/schema/count/label/refusal comparison rejects a changed value',()=>{
 for(const ref of refs){
  const flat=AlmMetaPlusContract.flatten(ref.result);
  for(const [key,value]of Object.entries(flat)){
   const bad=typeof value==='number'?value+Math.max(1,Math.abs(value))*.01:'corrupted '+value;
   assert.equal(AlmMetaPlusContract.compare(bad,value,key).pass,false,key);evidence.negativeNumeric++;
   assert.equal(AlmMetaPlusContract.compare(undefined,value,key).pass,false,key+' missing');evidence.negativeNumeric++;
  }
  const bad={...ref.result,unexpected:1};assert.equal(AlmMetaPlusContract.audit(bad,ref.result)[0].pass,false);evidence.negativeNumeric++;
 }
});
test('invalid inputs, insufficient studies and singular designs refuse explicitly',()=>{
 const good=structuredClone(corpus.find((c,i)=>refs[i].result.status==='ok'));
 for(const change of [c=>c.vi[0]=0,c=>c.vi[0]=-1,c=>c.yi[0]=NaN,c=>c.mods[0][0]=Infinity,c=>c.mods[0].pop(),c=>c.names[1]=c.names[0],c=>c.names[0]='<script>',c=>c.interaction='yes']){const c=structuredClone(good);change(c);assert.equal(AlmMetaPlus.compute(c).status,'refused');}
 const small=structuredClone(good);for(const k of ['yi','vi','mods'])small[k]=small[k].slice(0,3);assert.equal(AlmMetaPlus.compute(small).reason,'Need more studies than coefficients');
 const singular=structuredClone(good);singular.mods.forEach(r=>r[1]=r[0]);assert.equal(AlmMetaPlus.compute(singular).reason,'Moderator design is rank deficient');
});
test('DOM output and JSON export on every R configuration; numeric/label/refusal mutations fail',async()=>{
 const {loadDOM}=await import(new URL('validate/dom-harness.mjs',base));const {window:w,document:d}=await loadDOM();
 const seen=new Set();
 for(let i=0;i<corpus.length;i++){
  const c=corpus[i],r=w.AlmMetaPlus.compute(c);w.AlmMetaPlusUI.render(r,c);
  assert.deepEqual(Array.from(w.AlmMetaPlusDisplay.displayed(r,c)),[],c.id);evidence.positiveDOM++;
  if(r.status==='ok'){
   assert.equal(JSON.stringify(w.AlmMetaPlusUI.exportPayload().result),JSON.stringify(r));evidence.positiveDOM++;
   const svg=d.querySelector('#plus-plot svg');assert.deepEqual(Array.from(w.AlmMetaPlusContract.plotValues(svg,refs[i].result,c)),[],c.id+' plot quantities');evidence.positivePlotValues++;
   for(const n of d.querySelectorAll('#plus-results [data-plus-number]')){
    const key=n.dataset.plusNumber;if(seen.has(key))continue;seen.add(key);
    const old=n.textContent;n.textContent='999';assert.ok(w.AlmMetaPlusDisplay.displayed(r,c).length,key);evidence.negativeDOM++;n.textContent=old;
    const clone=n.cloneNode(true);n.parentElement.append(clone);assert.ok(w.AlmMetaPlusDisplay.displayed(r,c).length,key+' duplicate');evidence.negativeDOM++;clone.remove();
    const parent=n.parentElement,next=n.nextSibling;n.remove();assert.ok(w.AlmMetaPlusDisplay.displayed(r,c).length,key+' missing');evidence.negativeDOM++;parent.insertBefore(n,next);
   }
  }else{
   d.getElementById('plus-status').textContent='Refused: wrong reason';assert.ok(w.AlmMetaPlusDisplay.displayed(r,c).length);evidence.negativeDOM++;
  }
 }
 for(const selector of ['[data-role="bubble"]','[data-role="fit"]','[data-role="band"]']){
  const i=refs.findIndex(r=>r.result.status==='ok'),c=corpus[i],r=w.AlmMetaPlus.compute(c);w.AlmMetaPlusUI.render(r,c);
  const svg=d.querySelector('#plus-plot svg'),n=svg.querySelector(selector);
  if(n.localName==='circle')n.setAttribute('cy',String(Number(n.getAttribute('cy'))+15));else{const ps=n.getAttribute('points').split(' ');const xy=ps[10].split(',').map(Number);xy[1]+=15;ps[10]=xy.join(',');n.setAttribute('points',ps.join(' '));}
  assert.ok(w.AlmMetaPlusContract.plotValues(svg,r,c).length,selector);evidence.negativePlotValues++;
 }
 {
  const i=refs.findIndex(r=>r.result.status==='ok'),c=corpus[i],r=w.AlmMetaPlus.compute(c);w.AlmMetaPlusUI.render(r,c);const svg=d.querySelector('#plus-plot svg');svg.querySelector('circle').setAttribute('r','0');assert.ok(w.AlmMetaPlusContract.plotValues(svg,r,c).length);evidence.negativePlotValues++;
 }
 const i=refs.findIndex(r=>r.result.status==='ok'),r=w.AlmMetaPlus.compute(corpus[i]);
 for(const selector of ['[data-term]','[data-model-heading]','thead th','[data-summary] dt','[data-held-label]','[data-comparison-label]']){
  w.AlmMetaPlusUI.render(r,corpus[i]);d.querySelector('#plus-results '+selector).textContent='wrong';assert.ok(w.AlmMetaPlusDisplay.displayed(r,corpus[i]).length,selector);evidence.negativeDOM++;
 }
 assert.throws(()=>w.AlmMetaPlusUI.parse('yi,vi,a,b\n1,1,2,\n2,1,3,4',false),/finite numbers/);
 writeFileSync(new URL('validate/plus/test-evidence.json',base),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
});
