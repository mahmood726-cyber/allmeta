import fs from 'node:fs';import vm from 'node:vm';
for(const f of ['../plus-bivariate.js','../plus.js'])vm.runInThisContext(fs.readFileSync(new URL(f,import.meta.url),'utf8'));
globalThis.AlmDTAPlusUI={model:s=>AlmDTAPlus.predict(AlmDTAPlus.fit(s.rows,s.method,s.correction),s.at,s.prevalence)};
globalThis.document={getElementById:()=>({})};globalThis.AlmDTAPlusPins={files:[{path:'unused'}]};globalThis.fetch=async()=>{throw Error('Node script generation only');};
vm.runInThisContext(fs.readFileSync(new URL('plus-adapter.js',import.meta.url),'utf8'));
const c=JSON.parse(fs.readFileSync(new URL('corpus/plus-reference.json',import.meta.url)));
console.log("source('allmeta/dta-sroc/validate/preflight-plus.R')");
for(const r of c.cases.filter(r=>r.ok)){console.log('cat('+JSON.stringify('CASE:'+r.id+'\n')+')');console.log(AlmDTAPlusValidate.script({rows:r.rows,method:r.method,correction:r.correction,at:r.predictions[0].at,prevalence:.1}));}
