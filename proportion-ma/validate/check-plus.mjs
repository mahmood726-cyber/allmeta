import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import '../plus-core.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const C=globalThis.AlmPropPlusCore;
const manifest=JSON.parse(read('validate/MANIFEST-plus.json'));
let pins=0;
for(const f of manifest.files){const b=fs.readFileSync(path.join(root,f.path));assert.equal(b.includes(13),false,'LF bytes');assert.equal(b.length,f.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);pins++;}
const corpus=JSON.parse(read('validate/plus-corpus/corpus.json')),refs=JSON.parse(read('validate/plus-corpus/reference-plus.json'));
const original=JSON.parse(read('validate/corpus/corpus.json'));
assert.deepEqual(corpus,original);
let checks=0,refusals=0;
for(const ca of corpus){
 C.validateRows(ca.rows);const pair=refs[ca.id],a=C.flat(pair.metafor),b=C.flat(pair.meta);
 assert.deepEqual(C.flat(C.decode('ALMJSON:'+JSON.stringify(a))),a);
 for(const key of Object.keys(b)){assert.ok(C.close(a[key],b[key],key),ca.id+' '+key);checks++;}
 if(a.status==='refused')refusals++;
}
assert.equal(checks,2176);assert.equal(refusals,28);
let negatives=0;
for(const text of ['1.5,10','1x,10','1,0','11,10','-1,10','1,9007199254740992','1,10\nbad']){assert.throws(()=>C.parse(text));negatives++;}
for(const field of ['mu','se','tau2','estimate','ciLo','ciHi','piLo','piHi']){assert.equal(C.close(1,0,field),false);negatives++;}
for(const field of ['status','reason','k']){assert.equal(C.close('bad','ok',field),false);negatives++;}
for(const r of [{status:'bad'},{status:'refused',reason:'fallback'},{status:'ok',values:{}}]){assert.throws(()=>C.validateResult(r));negatives++;}
assert.throws(()=>C.decode('ALMJSON:{}\nALMJSON:{}'));negatives++;
const base=execFileSync('git',['show','7966530de875d22253f0557c7b447ed9d917685d:proportion-ma/index.html'],{cwd:root,encoding:'utf8'});
const current=read('index.html');
const start=current.indexOf('<!-- GLMM extras');const end=current.indexOf('</body>',start);
assert.equal((current.slice(0,start)+current.slice(end)).replaceAll('\r\n','\n'),base.replaceAll('\r\n','\n'),'Original page unchanged except added extras');
for(const p of ['validate/MANIFEST.json','validate/corpus/corpus.json','validate/corpus/reference.json']) assert.equal(read(p).replaceAll('\r\n','\n'),execFileSync('git',['show','7966530de875d22253f0557c7b447ed9d917685d:proportion-ma/'+p],{cwd:root,encoding:'utf8',maxBuffer:20e6}));
// Generate native-R input using the exact browser script for every corpus case.
if(process.argv.includes('--write-r')) {
 const target=path.join(root,'validate','runtime-plus.R');
 fs.writeFileSync(target,corpus.map(ca=>'cat("CASE:'+ca.id.replaceAll('"','\\"')+'\\n")\n'+C.buildScript(ca.rows)).join('\n'),'utf8');
}
console.log(JSON.stringify({pins,configurations:corpus.length,nativePairChecks:checks,refusals,negativeAssertions:negatives,originalPage:'unchanged except extras',originalCorpus:'byte identical'}));

const logIndex=process.argv.indexOf('--runtime-log');
if(logIndex>=0){
 const lines=fs.readFileSync(process.argv[logIndex+1],'utf8').split(/\r?\n/);let id=null;const actual=new Map();
 for(const line of lines){if(line.startsWith('CASE:'))id=line.slice(5);if(line.startsWith('ALMJSON:')){assert.ok(id && !actual.has(id));actual.set(id,C.flat(C.decode(line)));}}
 assert.equal(actual.size,corpus.length);let runtimeChecks=0;
 for(const ca of corpus)for(const backend of ['metafor','meta'])for(const [key,ref] of Object.entries(C.flat(refs[ca.id][backend]))){assert.ok(C.close(actual.get(ca.id)[key],ref,key),ca.id+' '+backend+' '+key);runtimeChecks++;}
 console.log(JSON.stringify({runtimeConfigurations:actual.size,runtimeChecks,passed:runtimeChecks}));
}

for(const f of JSON.parse(read('validate/MANIFEST.json')).files){const b=fs.readFileSync(path.join(root,f.path));assert.equal(b.length,f.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);}
console.log('Original corpus pins: 2/2 passed');
