// Function-level diagnostic for independent legacy engines. This does not
// assert that these helpers are the active estimator in every app workflow.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const pairwiseFile='Pairwiseai/app.js',ipdFile='IPD-Meta-Pro/ipd-meta-pro.html';
const pairwise=fs.readFileSync(path.join(root,pairwiseFile),'utf8'),ipd=fs.readFileSync(path.join(root,ipdFile),'utf8');
function extract(text,name) {
  const start=text.indexOf('function '+name+'(');
  const end=text.indexOf('\nfunction ',start+20);
  if(start<0||end<0)throw Error('Function boundaries not found: '+name);
  return text.slice(start,end);
}
const context={};vm.createContext(context);
vm.runInContext('function sum(a){return a.reduce((a,b)=>a+b,0);}const CONFIG={REML_DAMPING:.7};'+
  ['estimateTau2_DL','estimateTau2_REML','estimateTau2_ProfileLikelihood'].map(n=>extract(pairwise,n)).join('\n')+
  extract(ipd,'estimateREML'),context);
const real=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/reml_nonconvergence.json'))).reviews;
const modes=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/reml_global_modes.json'))).cases;
const record={scope:'Function-level probes of unchanged independent legacy engines; browser routing and full-app behaviour are not established by this probe.',
  source_sha256:Object.fromEntries([pairwiseFile,ipdFile].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),
  cases:real.concat(modes).map(c=>({id:c.id||c.review_id,expected_global_tau2:c.expected_tau2,
    pairwisePro:context.estimateTau2_REML(c.yi,c.vi),ipdHelper:context.estimateREML(c.yi,c.vi)}))};
const output=process.argv[2];
if(output)fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));
