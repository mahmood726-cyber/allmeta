import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
await import('./contract.js');
const base=new URL('../',import.meta.url),files=[];
for(const name of ['corpus.json','reference.json','candidates.json','divergences.json']){
 const path='validate/plus/'+name,url=new URL(path,base);
 const text=readFileSync(url,'utf8').replaceAll('\r\n','\n');writeFileSync(url,text);
 const bytes=Buffer.from(text);files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const refs=JSON.parse(readFileSync(new URL(files[1].path,base)));
const numericChecks=refs.reduce((s,r)=>s+Object.keys(AlmMetaPlusContract.flatten(r.result)).length+1,0);
const manifest={schema:'meta-regression-plus-v1',configurations:refs.length,numericChecks,checks:numericChecks+refs.length,versions:{metafor:'5.2-1',metadat:'1.6.0',jsonlite:'2.0.0'},documentedDivergences:JSON.parse(readFileSync(new URL('validate/plus/divergences.json',base))).configs.length,tolerances:{closed:1e-9,iterative:1e-6,pvalue:1e-9},control:{threshold:'1e-12 * max(1, var(yi))',stepadj:.5,maxiter:10000},files};
writeFileSync(new URL('validate/MANIFEST-plus.json',base),JSON.stringify(manifest,null,2)+'\n');
const referenceR=readFileSync(new URL('validate/reference.R',base),'utf8').replaceAll('\r\n','\n');
writeFileSync(new URL('validate/plus-pins.js',base),'window.AlmMetaPlusManifest = Object.freeze('+JSON.stringify({...manifest,referenceR})+');\n');
console.log(JSON.stringify({configurations:refs.length,numericChecks,checks:manifest.checks}));
