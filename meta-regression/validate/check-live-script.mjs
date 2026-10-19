import {readFileSync,writeFileSync} from 'node:fs';
import {loadDOM} from './dom-harness.mjs';
const {window:w}=await loadDOM();
const corpus=JSON.parse(readFileSync(new URL('./plus/corpus.json',import.meta.url))),refs=JSON.parse(readFileSync(new URL('./plus/reference.json',import.meta.url)));
const indices=[];for(const n of [2,3])for(const interaction of [false,true])indices.push(corpus.findIndex((c,i)=>c.names.length===n&&c.interaction===interaction&&refs[i].result.status==='ok'));
indices.push(refs.findIndex(r=>r.result.status==='refused'));
if(process.argv[2]==='build'){
 let script='';
 for(const i of indices)script+=w.AlmMetaPlusValidationAdapter.live.buildScript({input:corpus[i]})+'\n';
 writeFileSync(new URL('./plus/live-protocol.R',import.meta.url),script);
}else{
 const text=readFileSync(new URL('./plus/live-protocol.log',import.meta.url),'utf8'),lines=text.split(/\r?\n/).filter(s=>s.startsWith('ALMJSON:'));
 if(lines.length!==indices.length)throw Error('Expected '+indices.length+' live-protocol records, got '+lines.length);
 let checks=0;for(const [j,i]of indices.entries()){
  const actual=w.AlmMetaPlusContract.flatten(w.AlmMetaPlus.compute(corpus[i])),ref=JSON.parse(lines[j].slice(8));
  if(Object.keys(actual).sort().join('|')!==Object.keys(ref).sort().join('|'))throw Error('Live schema mismatch');
  for(const [key,value]of Object.entries(ref)){if(!w.AlmMetaPlusContract.compare(actual[key],value,key).pass)throw Error('Live mismatch: '+key);checks++;}
 }
 console.log(checks+'/'+checks+' desktop checks of the live R script protocol (not a webR run)');
}
