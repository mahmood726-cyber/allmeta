import {pipeline,env} from './vendor/semantic/transformers.min.js';
import {installPack,MODEL_SHA,REVISION} from './specter2-pack.js';
const base=new URL('./vendor/semantic/',import.meta.url);
env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=new URL('models/',base).href;
env.backends.onnx.wasm.wasmPaths=base.href;env.backends.onnx.wasm.numThreads=1;
env.useBrowserCache=true;
const originalFetch=self.fetch.bind(self);
self.fetch=(input,options)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,import.meta.url);if(u.origin!==self.location.origin)throw Error('Semantic inference permits same-origin model assets only.');return originalFetch(input,options);};
let extractor,backend,initError='',dbPromise,loadedModel,paused=false,resume;
function db(){return dbPromise||(dbPromise=new Promise((resolve,reject)=>{const q=indexedDB.open('screen-semantic-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('vectors');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);}));}
async function cached(key,value){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('vectors',value?'readwrite':'readonly'),store=tx.objectStore('vectors');const q=value?store.put(value,key):store.get(key);let result;q.onsuccess=()=>{result=q.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function hash(text,specter){const pin=specter?MODEL_SHA+'|cls|norm|256|prefix=|':'751bff37182d3f1213fa05d7196b954e230abad9|mean|norm|256|';const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pin+text));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
// Truncation: the pipeline truncates at tokenizer.model_max_length (SPECTER2 ships 1e30), as in the benchmark's embed.mjs.
async function init(force,model){if(extractor&&loadedModel===model)return;extractor=null;loadedModel=model;initError='';
 let adapter=null;if(force!=='wasm'&&navigator.gpu){try{adapter=await navigator.gpu.requestAdapter();}catch(e){initError=e.message;}if(!adapter&&!initError)initError='No WebGPU adapter; using WASM.';}
 if(adapter){try{extractor=await pipeline('feature-extraction',model,{device:'webgpu',dtype:'q8'});extractor.tokenizer.model_max_length=256;backend='webgpu';return;}catch(e){initError=e.message;}}
 extractor=await pipeline('feature-extraction',model,{device:'wasm',dtype:'q8'});extractor.tokenizer.model_max_length=256;backend='wasm';
}
let queue=Promise.resolve();
self.onmessage=({data})=>{
 if(data.action==='pause'){paused=true;return;}
 if(data.action==='resume'){paused=false;if(resume)resume();return;}
 queue=queue.then(async()=>{try{
 const specter=data.model==='specter2',model=specter?'specter2':'minilm',dim=specter?768:384;
 if(specter)await installPack((bytes,totalBytes)=>postMessage({id:data.id,phase:'download',bytes,totalBytes}));
 await init(data.backend,model);
 const vectors=Object.create(null),warnings=[],started=performance.now();let hits=0,activeMs=0;
 for(let start=0;start<data.records.length;start+=32){
  if(paused)await new Promise(resolve=>{resume=resolve;});
  const batchStarted=performance.now(),batch=data.records.slice(start,start+32),pending=[];
  const batchContext=specter?JSON.stringify(batch.map(r=>[r.title||'',r.abstract||''])):'';
  for(const r of batch){
   const text=specter?(r.title||'')+'. '+(r.abstract||''):[r.title||'',r.abstract||''].join(' '),key=await hash(batchContext+text,specter);
   let v;try{v=await cached(key);}catch(e){warnings.push('Vector cache unavailable: '+e.message);}
   if(v){vectors[String(r.id)]=v;hits++;}else pending.push({r,text,key});
  }
  if(pending.length){
   let result;
   const options={pooling:specter?'cls':'mean',normalize:true,truncation:true,max_length:256};
   try{result=await extractor(batch.map(r=>specter?(r.title||'')+'. '+(r.abstract||''):[r.title||'',r.abstract||''].join(' ')),options);}
   catch(e){if(backend!=='webgpu')throw e;extractor=null;await init('wasm',model);initError=e.message;result=await extractor(batch.map(r=>specter?(r.title||'')+'. '+(r.abstract||''):[r.title||'',r.abstract||''].join(' ')),options);}
   for(let j=0;j<pending.length;j++){
    const p=pending[j],index=batch.indexOf(p.r),v=Array.from(result.data.slice(index*dim,(index+1)*dim));
    vectors[String(p.r.id)]=v;try{await cached(p.key,v);}catch(e){warnings.push('Vector not cached: '+e.message);}
   }
  }
  for(const r of batch){const v=vectors[String(r.id)];if(v.length!==dim||v.some(x=>!Number.isFinite(x)))throw Error('Invalid '+model+' embedding.');}
  activeMs+=performance.now()-batchStarted;
  const progress=start+batch.length,docsPerSecond=progress/(activeMs/1000);
  postMessage({id:data.id,progress,total:data.records.length,docsPerSecond,etaSeconds:(data.records.length-progress)/docsPerSecond});
 }
 postMessage({id:data.id,result:{vectors,backend,model:specter?'specter2':'Xenova/all-MiniLM-L6-v2',revision:specter?REVISION:'751bff37182d3f1213fa05d7196b954e230abad9',packSha:specter?MODEL_SHA:null,pooling:specter?'cls':'mean',prefix:'',dtype:'q8',maxTokens:256,batchSize:32,cacheHits:hits,warnings:[...new Set(warnings)],fallbackReason:initError,elapsed:performance.now()-started}});
 }catch(e){postMessage({id:data.id,error:e.message});}});
};
