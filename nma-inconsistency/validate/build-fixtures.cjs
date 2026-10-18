// Usage: NODE_PATH=<linkedom modules> node build-fixtures.cjs <extracted P16-validation>
// Deliberate fixture maintenance only: never regenerate references during a test.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {harness,root}=require('../../hub/shared/tests/nma-inconsistency-dom.cjs');
const source=process.argv[2]; if(!source)throw Error('Pass the extracted P16-validation directory');
const read=name=>JSON.parse(fs.readFileSync(path.join(source,name),'utf8'));
const all=read('corpus.json'),refs=fs.readdirSync(path.join(source,'reference')).filter(f=>f.endsWith('.json')).sort().map(f=>read('reference/'+f));
const rmap=new Map(refs.map(r=>[r.key,r])),seen=new Set(),corpus=[],numeric=new Map();
const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
for(const c of all) {
  const r=rmap.get(c.key);
  const bucket=[c.model,c.measure,r.status,r.reason||'',r.dbt?.df>0,r.tau2>0,r.dbt?.p!=null&&r.dbt.p<.05].join('|');
  if(seen.has(bucket))continue;seen.add(bucket);
  corpus.push({key:c.key,model:c.model,text:c.rows.map(r=>[r.A,r.B,r.te,r.se,r.study].map(quote).join(',')).join('\n'),source:'P16 corpus'});
  numeric.set(c.key,r);
}
const reasons={repeated:'Repeated study IDs are unsupported: enter one independent contrast per study.',singular:'Network fit is singular or numerically invalid.',empty:'Shared network bus is empty.',unsupported:'The shared network has no supported contrasts.',multi:'Multi-arm studies are unsupported: correlated contrasts require study covariance.'};
for(const model of ['FE','DL','PM']) {
  for(const [kind,text] of [['repeated','A,B,.2,.1,s1\nA,B,.3,.2,s1\nA,C,.5,.15,s2'],['singular','A,B,.2,1e200\nB,C,.3,1e200\nA,C,.5,1e200']])corpus.push({key:`policy::${kind}::${model}`,model,text,reason:reasons[kind],source:'P16 focused policy; singular is an added defensive fixture'});
  corpus.push({key:`bus::empty::${model}`,model,bus:{empty:true},reason:reasons.empty});
  for(const measure of ['HR','RD'])corpus.push({key:`bus::${measure}::${model}`,model,bus:{measure,studies:[{id:'s1',arms:[{treatment:'A',events:1,n:10},{treatment:'B',events:2,n:10}]}]},reason:reasons.unsupported});
  for(const b of read('bus-reference.json'))corpus.push({key:`bus::${b.key}::${model}`,model,bus:{measure:b.measure,studies:b.studies},inputReference:b.rows,source:'P16 focused metafor escalc input reference'});
  for(const measure of ['OR','RR','MD','SMD'])corpus.push({key:`bus::multiarm::${measure}::${model}`,model,bus:{measure,studies:[{id:'s1',arms:['A','B','C'].map(t=>({treatment:t,events:2,n:10,mean:2,sd:1}))}]},reason:reasons.multi});
}
const archivedCount=numeric.size;
for(const model of ['FE','DL','PM']) {
 const original=all.find(c=>c.model===model && rmap.get(c.key).status==='ok'),key=`four-column::${original.key}`;
 corpus.push({key,model,text:original.rows.map(r=>[r.A,r.B,r.te,r.se].map(quote).join(',')).join('\n'),source:'First accepted archived configuration per model, optional study-ID column omitted'});
 numeric.set(key,{...rmap.get(original.key),key});
}
const {c}=harness(),a=c.AlmIncoValidationAdapter;
const reference={pageText:a.pageText(),cases:[]};
for(const conf of corpus) {
  const state=a.execute(conf),r=numeric.get(conf.key);
  if(conf.reason && (state.status!=='refused'||state.reason!==conf.reason))throw Error(conf.key+' refusal mismatch');
  const parsed=c.parse(c.document.getElementById('src').value);
  if(conf.inputReference) {
    if(parsed.length!==conf.inputReference.length)throw Error('Bus cardinality');
    for(let i=0;i<parsed.length;i++)for(const k of ['A','B','te','se']) {
      const v=conf.inputReference[i][k];
      if(typeof v==='number'?Math.abs(parsed[i][k]-v)>1e-9*Math.max(1,Math.abs(v)):parsed[i][k]!==v)throw Error('Bus input R mismatch '+conf.key+' '+k);
    }
  }
  if(JSON.stringify(reference.pageText)!==JSON.stringify(a.pageText()))throw Error('Template changed with state');
  reference.cases.push({key:conf.key,numeric:r||null,reason:conf.reason||r?.reason||null,text:c.document.getElementById('src').value,parsed,display:a.display()});
}
const dir=__dirname;fs.mkdirSync(path.join(dir,'corpus'),{recursive:true});
function write(file,value){fs.writeFileSync(path.join(dir,file),JSON.stringify(value)+'\n');}
write('corpus/corpus.json',corpus);write('corpus/reference.json',reference);
const files=['corpus','reference'].map(name=>{const p=`validate/corpus/${name}.json`,b=fs.readFileSync(path.join(dir,'corpus',name+'.json'));return {path:p,sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length};});
const contract={files,checks:0,archived_checks:76601,configurations:corpus.length,archived_configurations:archivedCount,supplementary_configurations:corpus.length-archivedCount,
 rule:'First archived configuration in corpus order for each (model, measure, acceptance/reason, closed-loop availability, positive tau², global p<0.05) tuple; plus FE/DL/PM repeated-ID, singular-fit, empty/unsupported/multi-arm bus, eight R-checked bus transformations and a four-column variant of the first accepted configuration per model.',
 referenceVersions:{R:'4.6.0',netmeta:'3.7-0',metafor:'5.2-1',meta:'8.5-0',metadat:'1.6-0'},pageText:reference.pageText};
function contractWrite(){write('MANIFEST.json',contract);const f=path.join(dir,'adapter.js');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/^const CONTRACT = .*; \/\/ generated by build-fixtures.cjs$/m,'const CONTRACT = '+JSON.stringify(contract)+'; // generated by build-fixtures.cjs'));}
contractWrite();
(async()=>{
 const h=harness(),loaded=Object.fromEntries(files.map(f=>[f.path,fs.readFileSync(path.join(root,'nma-inconsistency',f.path))]));
 const result=await h.c.AlmIncoValidationAdapter.corpus.run(loaded);
 if(result.failed.length){console.error(JSON.stringify(result.failed.slice(0,5),null,2));throw Error(result.failed.length+' fixture checks failed');}
 contract.checks=result.checks;contractWrite();console.log(JSON.stringify({configurations:corpus.length,archived:archivedCount,checks:result.checks,refusals:result.refusals}));
})().catch(e=>{console.error(e);process.exitCode=1;});
