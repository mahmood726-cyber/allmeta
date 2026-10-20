// Host: node screen/tests/specter2_parity.mjs data.csv --ref review.f32
// --transformers may name a local Transformers.js Node module URL/path.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {args,records,floats} from './parity-input.mjs';
const a=args();if(!a.ref)throw Error('Required: --ref review.f32 (first 64 CSV rows, row-major float32)');
const rows=records(a.csv).slice(0,64);if(rows.length!==64)throw Error('Parity requires at least 64 records (two full batches of 32, as in the benchmark)');
const reference=floats(a.ref,64),pack=fileURLToPath(new URL('../vendor/semantic/models/specter2/',import.meta.url));
const manifest=JSON.parse(await fs.readFile(path.join(pack,'parts.json'),'utf8'));
const digest=b=>createHash('sha256').update(b).digest('hex');
const blocks=[];
for(const p of manifest.parts){const b=await fs.readFile(path.join(pack,p.name));if(b.length!==p.bytes||digest(b)!==p.sha256)throw Error('Part hash mismatch: '+p.name);blocks.push(b);}
const model=Buffer.concat(blocks);
if(model.length!==manifest.bytes||digest(model)!==manifest.sha256||manifest.sha256!=='2b1dc054c82e7ad6cf20456b11bee978416468c1af399383dbbd66b307d5748a')throw Error('Model hash mismatch');
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'specter2-parity-'));
try{
 const dest=path.join(tmp,'specter2');await fs.mkdir(path.join(dest,'onnx'),{recursive:true});
 for(const name of ['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt'])await fs.copyFile(path.join(pack,name),path.join(dest,name));
 await fs.writeFile(path.join(dest,'onnx/model_quantized.onnx'),model);
 const module=a.transformers?(a.transformers.startsWith('file:')?a.transformers:pathToFileURL(path.resolve(a.transformers)).href):'@huggingface/transformers';
 const {pipeline,env}=await import(module);
 env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=tmp+path.sep;env.useFSCache=false;env.useBrowserCache=false;
 const extractor=await pipeline('feature-extraction','specter2',{device:'cpu',dtype:'q8',local_files_only:true});
 extractor.tokenizer.model_max_length=256; // same truncation as the benchmark (embed.mjs) and the browser worker
 let maxAbsDiff=0,minCosine=1;const start=performance.now();
 try{
  for(let offset=0;offset<64;offset+=32){
   const result=await extractor(rows.slice(offset,offset+32).map(r=>r.title+'. '+r.abstract),{pooling:'cls',normalize:true,truncation:true,max_length:256});
   if(result.data.length!==Math.min(32,64-offset)*768)throw Error('Unexpected embedding dimensions');
   for(let i=0;i<result.data.length/768;i++){
    let dot=0,aa=0,bb=0;
    for(let j=0;j<768;j++){const x=result.data[i*768+j],y=reference[(offset+i)*768+j];if(!Number.isFinite(x))throw Error('Nonfinite output');maxAbsDiff=Math.max(maxAbsDiff,Math.abs(x-y));dot+=x*y;aa+=x*x;bb+=y*y;}
    const cosine=dot/Math.sqrt(aa*bb);if(!Number.isFinite(cosine))throw Error('Invalid cosine');minCosine=Math.min(minCosine,cosine);
   }
  }
 }finally{await extractor.dispose();}
 console.log(JSON.stringify({records:64,maxAbsDiff,minCosine,docsPerSecond:64000/(performance.now()-start)},null,2));
 if(minCosine<0.9999)process.exitCode=1;
}finally{await fs.rm(tmp,{recursive:true,force:true});}
