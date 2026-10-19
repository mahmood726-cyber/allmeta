// Raw-scale covariate gate (REVIEW_133 P1-3). Corpus: corpus/plus-raw-scale.json from generate-plus-raw.R.
// Each configuration is compared, at the existing tolerances, with mada on the SAME supplied input ("raw") and with
// mada on the standardised covariate back-transformed to the supplied scale ("std", the same model).
// Requirements (the gate fails otherwise):
//   1. every configuration with mean/SD <= AlmDTAPlus.RAW_SCALE_LIMIT agrees with both references (N/N);
//   2. every configuration that differs from mada on the same input beyond tolerance is one where the UI shows
//      the raw-scale note (mean/SD > RAW_SCALE_LIMIT): no silent difference;
//   3. refusals equal mada's exactly;
//   4. the set of out-of-tolerance configurations equals the one pinned in MANIFEST-plus-raw.json (any change is visible).
// node check-plus-raw.mjs --pin rewrites the manifest (SHA-256 and the divergence set) after a deliberate regeneration.
import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
const root=new URL('../',import.meta.url);
for(const p of ['plus-bivariate.js','plus.js'])vm.runInThisContext(fs.readFileSync(new URL(p,root),'utf8'));
const file=new URL('validate/corpus/plus-raw-scale.json',root),manifestFile=new URL('validate/MANIFEST-plus-raw.json',root);
const pin=process.argv.includes('--pin');
let bytes=fs.readFileSync(file);
if(pin){bytes=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));fs.writeFileSync(file,bytes);}
const sha=crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=pin?null:JSON.parse(fs.readFileSync(manifestFile,'utf8'));
if(!pin&&(bytes.includes(13)||sha!==manifest.sha256))throw Error('Raw-scale corpus SHA-256 mismatch');
const corpus=JSON.parse(bytes);
function compare(r,ref){
 let checks=0;const failures=[];
 const check=(id,a,b,tol=0,abs=false)=>{checks++;const ok=typeof b==='number'?Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tol*(abs?1:Math.max(1,Math.abs(b))):a===b;if(!ok)failures.push({id,app:a,ref:b});};
 const arr=(id,a,b,tol,abs)=>{if(Array.isArray(b)){check(id+'/length',a?.length,b.length);b.forEach((v,i)=>arr(id+'/'+i,a?.[i],v,tol,abs));}else check(id,a,b,tol,abs);};
 let f,error;try{f=AlmDTAPlus.fit(r.rows,r.method,r.correction);}catch(e){error=e.message;}
 check('ok',!!f,ref.ok);
 if(!ref.ok){check('refusal',error,ref.refusal);return {checks,failures};}
 if(!f)return {checks,failures};
 const t=r.method==='fixed'?1e-9:1e-6;
 for(const k of ['coef','vcov','Psi'])arr(k,f[k],ref[k],t);
 for(const k of ['p','z','se','lo','hi'])arr(k,f.coefTable.map(v=>k==='lo'?v.ci[0]:k==='hi'?v.ci[1]:v[k]),ref[k],t,k==='p');
 for(const q of ref.predictions)for(const p of q.post){const a=AlmDTAPlus.predict(f,q.at,p.prevalence);
  for(const k of ['sens','spec','mu','C'])arr(q.at+'/'+k,a[k],q[k],t);
  for(const k of ['positive','negative'])check(q.at+'/'+p.prevalence+'/'+k,a[k],p[k],t);
  if(q.regions)for(const k of ['confidence','prediction'])arr(q.at+'/'+k,a.regions[k],q.regions[k],t);}
 return {checks,failures};
}
const limit=AlmDTAPlus.RAW_SCALE_LIMIT,summary={};const violations=[];const divergent={raw:[],std:[]};let maxRel=0;
for(const r of corpus.cases){
 const ratio=AlmDTAPlus.meanOverSD(r.rows),warned=ratio>limit;
 if(Math.abs(ratio-r.meanOverSD)>1e-9*Math.max(1,r.meanOverSD))violations.push(r.id+': mean/SD differs from the generator');
 for(const which of ['raw','std']){
  const res=compare(r,r[which]),key=r.set+' / mada-'+which+' / '+(warned?'note shown':'no note');
  const s=summary[key]??={configurations:0,agreeing:0,checks:0,passed:0};
  s.configurations++;s.checks+=res.checks;s.passed+=res.checks-res.failures.length;
  if(!res.failures.length){s.agreeing++;continue;}
  divergent[which].push(r.id);
  for(const x of res.failures)if(typeof x.ref==='number'&&Number.isFinite(x.app))maxRel=Math.max(maxRel,Math.abs(x.app-x.ref)/Math.max(1,Math.abs(x.ref)));
  if(!warned)violations.push(`${r.id} (mean/SD ${ratio.toPrecision(3)}, no note) differs from mada-${which}: ${res.failures.slice(0,3).map(x=>x.id+' '+x.app+' vs '+x.ref).join('; ')}`);
  if(res.failures.some(x=>x.id==='ok'||x.id==='refusal'))violations.push(`${r.id}: refusal differs from mada-${which}`);
 }
}
console.log(`Raw-scale corpus: ${corpus.cases.length} configurations; R ${corpus.R}, mada ${corpus.mada}, mvmeta ${corpus.mvmeta}; note above mean/SD ${limit}`);
for(const [k,s] of Object.entries(summary).sort())console.log(`  ${k}: ${s.agreeing}/${s.configurations} configurations within tolerance (${s.passed}/${s.checks} checks)`);
console.log(`  out-of-tolerance configurations: vs mada on the same input ${divergent.raw.length}, vs mada standardised ${divergent.std.length}; all with the note shown: ${violations.length===0}; largest relative difference ${maxRel.toExponential(2)}`);
if(pin){fs.writeFileSync(manifestFile,JSON.stringify({path:'validate/corpus/plus-raw-scale.json',sha256:sha,bytes:bytes.length,configurations:corpus.cases.length,rawScaleLimit:limit,divergent},null,2)+'\n');console.log('Pinned',sha);}
else{
 for(const which of ['raw','std'])if(JSON.stringify(divergent[which])!==JSON.stringify(manifest.divergent[which]))violations.push(`out-of-tolerance set vs mada-${which} differs from the pinned set (${divergent[which].length} now, ${manifest.divergent[which].length} pinned)`);
 if(manifest.rawScaleLimit!==limit)violations.push('RAW_SCALE_LIMIT differs from the pinned value');
}
if(violations.length){console.log('FAIL:\n '+violations.slice(0,20).join('\n '));process.exitCode=1;}else console.log('PASS: raw-scale gate');
