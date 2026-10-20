import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
const root=new URL('../',import.meta.url);
for(const p of ['plus-bivariate.js','plus.js','validate/plus-core.js'])vm.runInThisContext(fs.readFileSync(new URL(p,root),'utf8'));
const bytes=fs.readFileSync(new URL('validate/corpus/plus-reference.json',root));const m=JSON.parse(fs.readFileSync(new URL('validate/MANIFEST-plus.json',root)));
if(bytes.includes(13)||crypto.createHash('sha256').update(bytes).digest('hex')!==m.files[0].sha256)throw Error('LF corpus SHA-256 mismatch');
vm.runInThisContext(fs.readFileSync(new URL('validate/plus-pins.js',root),'utf8'));
if(JSON.stringify(AlmDTAPlusPins)!==JSON.stringify(m))throw Error('Manifest and browser pins differ');
const r=AlmDTAPlusCore.replay(JSON.parse(bytes));console.log(JSON.stringify(r,null,2));if(r.failures.length)process.exitCode=1;
