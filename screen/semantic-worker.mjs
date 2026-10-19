import {pipeline,env} from './vendor/semantic/transformers.min.js';
const base=new URL('./vendor/semantic/',import.meta.url),revision='751bff37182d3f1213fa05d7196b954e230abad9';
env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=new URL('models/',base).href;
env.backends.onnx.wasm.wasmPaths=base.href;env.backends.onnx.wasm.numThreads=1;
env.useBrowserCache=true;
const originalFetch=self.fetch.bind(self);
self.fetch=(input,options)=>{const u=new URL(typeof input==='string'?input:input.url,import.meta.url);if(u.origin!==self.location.origin)throw Error('Semantic inference permits same-origin model assets only.');return originalFetch(input,options);};
let extractor,backend,initError='',dbPromise;
function db(){return dbPromise||(dbPromise=new Promise((resolve,reject)=>{const q=indexedDB.open('screen-semantic-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('vectors');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);}));}
async function cached(key,value){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('vectors',value?'readwrite':'readonly'),store=tx.objectStore('vectors');const q=value?store.put(value,key):store.get(key);let result;q.onsuccess=()=>{result=q.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function hash(text){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(revision+'|mean|norm|256|'+text));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
async function init(force){if(extractor)return;if(force!=='wasm'&&navigator.gpu){try{extractor=await pipeline('feature-extraction','minilm',{device:'webgpu',dtype:'q8'});backend='webgpu';return;}catch(e){initError=e.message;extractor=null;}}
 extractor=await pipeline('feature-extraction','minilm',{device:'wasm',dtype:'q8'});backend='wasm';}
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(async()=>{const started=performance.now();try{await init(data.backend);const vectors=Object.create(null),warnings=[];let hits=0;
 for(let i=0;i<data.records.length;i++){const r=data.records[i],text=[r.title||'',r.abstract||''].join(' '),key=await hash(text);let v;
  try{v=await cached(key);}catch(e){warnings.push('Vector cache unavailable: '+e.message);}
  if(v)hits++;else{const result=await extractor(text,{pooling:'mean',normalize:true,truncation:true,max_length:256});v=Array.from(result.data);try{await cached(key,v);}catch(e){warnings.push('Vector not cached: '+e.message);}}
  if(v.length!==384||v.some(x=>!Number.isFinite(x)))throw Error('Invalid MiniLM embedding.');vectors[String(r.id)]=v;
  postMessage({id:data.id,progress:i+1,total:data.records.length});
 }
 postMessage({id:data.id,result:{vectors,backend,model:'Xenova/all-MiniLM-L6-v2',revision,dtype:'q8',maxTokens:256,cacheHits:hits,warnings:[...new Set(warnings)],fallbackReason:initError,elapsed:performance.now()-started}});
 }catch(e){postMessage({id:data.id,error:e.message});}});};
