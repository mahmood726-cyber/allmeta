import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
globalThis.window=globalThis;
vm.runInThisContext(fs.readFileSync(new URL('../shared/dta-bivariate.js',root),'utf8'));
vm.runInThisContext(fs.readFileSync(new URL('validate/adapter.js',root),'utf8'));
const m=JSON.parse(fs.readFileSync(new URL('validate/MANIFEST.json',root),'utf8'));
const files={};
for(const f of m.files){const b=fs.readFileSync(new URL(f.path,root));if(crypto.createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('Hash mismatch: '+f.path);files[f.path]=JSON.parse(b);}
const r=await AlmDTAValidateAdapter.corpus.run(files);
console.log(JSON.stringify(r,null,2));
if(r.checks!==855||r.passed!==855||r.failed.length)process.exitCode=1;