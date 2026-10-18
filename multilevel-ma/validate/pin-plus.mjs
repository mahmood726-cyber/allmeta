import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const ref=JSON.parse(readFileSync(new URL('plus-corpus/reference-plus.json',import.meta.url)));
if(Object.keys(ref).length!==44||Object.values(ref).some(r=>r.status!=='ok'||!r.cr2Sigma2))throw Error('Cannot pin an incomplete or unrefined extras corpus');
const write=(name,text)=>writeFileSync(new URL(name,root),text.replace(/\r\n/g,'\n'));
write('validate/plus-corpus/corpus-plus.json',readFileSync(new URL('corpus/corpus.json',import.meta.url),'utf8'));
const files=['corpus-plus.json','reference-plus.json','inventory-plus.json','environment-plus.json'].map(name=>{
  const path='validate/plus-corpus/'+name,text=readFileSync(new URL(path,root),'utf8');write(path,text);
  const bytes=readFileSync(new URL(path,root));return {path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
});
const manifest={feature:'Three-level CR2 and variance profiles',base:'7966530de875d22253f0557c7b447ed9d917685d',configurations:44,candidates:114,checks:7272,numericalChecks:2596,files,versions:{metafor:'5.2-1',metadat:'1.6-0',clubSandwich:'0.7.0'},tolerances:{closedFormRelative:1e-9,iterativeRelative:1e-6,pAbsolute:1e-9,countsLabelsRefusals:'exact',plotGeometryCSSPixels:.05},lineEndings:'LF'};
write('validate/MANIFEST-plus.json',JSON.stringify(manifest,null,2)+'\n');
write('validate/plus-pins.js','window.AlmMultilevelPlusPins = '+JSON.stringify({checks:manifest.checks,files},null,2)+';\n');
console.log(JSON.stringify(manifest,null,2));
