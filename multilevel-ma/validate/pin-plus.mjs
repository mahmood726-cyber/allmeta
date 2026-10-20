import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const ref=JSON.parse(readFileSync(new URL('plus-corpus/reference-plus.json',import.meta.url)));
if(Object.keys(ref).length!==44||Object.values(ref).some(r=>r.status!=='ok'||!r.cr2Sigma2))throw Error('Cannot pin an incomplete or unrefined extras corpus');
const regime=JSON.parse(readFileSync(new URL('plus-corpus/regime-reference-plus.json',import.meta.url)));
if(Object.keys(regime).length!==21||Object.values(regime).some(r=>r.status!=='ok'||!r.cr2Sigma2))throw Error('Cannot pin an incomplete or unrefined regime corpus');
// No reference limit may be metafor's own upper search bound: confint.rma.mv returns
// max(10, 100*estimate) as the limit when the likelihood-ratio cutoff is not crossed inside it,
// and reports that only in ub.sign. The generators widen the bound until the limit is interior.
const limits=[...Object.entries(ref),...Object.entries(regime)].flatMap(([id,r])=>r.profiles.map((p,j)=>({id,j,upper:p.upper,bound:Math.max(10,100*p.estimate)})));
const atBound=limits.filter(l=>typeof l.upper==='number'&&Math.abs(l.upper-l.bound)<=1e-8*Math.max(1,l.bound));
if(atBound.length)throw Error('Cannot pin a reference limit that is metafor\'s own search bound: '+JSON.stringify(atBound));
console.log('profile limits interior: '+limits.length+'/'+limits.length);
const divergences=JSON.parse(readFileSync(new URL('plus-corpus/divergences-plus.json',import.meta.url)));
if(!Array.isArray(divergences)||!divergences.length)throw Error('Cannot pin without the recorded search-bound divergences');
const write=(name,text)=>writeFileSync(new URL(name,root),text.replace(/\r\n/g,'\n'));
write('validate/plus-corpus/corpus-plus.json',readFileSync(new URL('corpus/corpus.json',import.meta.url),'utf8'));
const files=['corpus-plus.json','reference-plus.json','regime-corpus-plus.json','regime-reference-plus.json','divergences-plus.json','inventory-plus.json','environment-plus.json'].map(name=>{
  const path='validate/plus-corpus/'+name,text=readFileSync(new URL(path,root),'utf8');write(path,text);
  const bytes=readFileSync(new URL(path,root));return {path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
});
const manifest={feature:'Three-level CR2 and variance profiles',base:'7966530de875d22253f0557c7b447ed9d917685d',configurations:65,metadatConfigurations:44,regimeConfigurations:21,candidates:114,checks:10749,numericalChecks:3835,files,versions:{metafor:'5.2-1',metadat:'1.6-0',clubSandwich:'0.7.0'},tolerances:{closedFormRelative:1e-9,iterativeRelative:1e-6,pAbsolute:1e-9,countsLabelsRefusals:'exact',plotGeometryCSSPixels:.05},lineEndings:'LF'};
write('validate/MANIFEST-plus.json',JSON.stringify(manifest,null,2)+'\n');
write('validate/plus-pins.js','window.AlmMultilevelPlusPins = '+JSON.stringify({checks:manifest.checks,files},null,2)+';\n');
console.log(JSON.stringify(manifest,null,2));
