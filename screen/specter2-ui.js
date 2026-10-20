import {installPack,MODEL_SHA} from './specter2-pack.js';
const B=ScreenBridge,records=()=>B.eligible().filter(r=>!r.dup);
const signature=()=>JSON.stringify(records().map(r=>[r.id,r.title,r.abstract]));
let worker,owner,sig='',vectors,run,done=0,paused=false,busy=false,generation=0;
const button=document.createElement('button'),pause=document.createElement('button'),status=document.createElement('p');
button.id='specter2-enable';button.textContent='Improve ranking with the SPECTER2 model (110 MB download, then runs offline)';
pause.id='specter2-pause';pause.textContent='Pause';pause.hidden=true;
status.id='specter2-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
document.getElementById('ux-strip').append(button,pause,status);
function current(){return owner===B.state()&&sig===signature();}
function embedding(){
 if(!current()||!vectors||run?.packSha!==MODEL_SHA)return null;
 const rows=records();
 if(!rows.every(r=>vectors[r.id]?.length===768))return null;
 return {model:'specter2',dim:768,packSha:MODEL_SHA,pooling:'cls',maxTokens:256,prefix:'',values:Float32Array.from(rows.flatMap(r=>vectors[r.id]))};
}
function summary(){return embedding()?'Semantic model ready; hybrid applies at the next refit.':'AI ranking: text model; semantic model preparing '+(current()?done:0)+'/'+records().length;}
function stop(){if(worker)worker.terminate();worker=null;busy=false;pause.hidden=true;button.disabled=false;}
window.ScreenSpecter={embedding,summary};
pause.onclick=()=>{paused=!paused;worker?.postMessage({action:paused?'pause':'resume'});pause.textContent=paused?'Resume':'Pause';if(paused)status.textContent='Pausing after the current batch; cached vectors are retained.';};
button.onclick=async()=>{
 if(busy)return;
 busy=true;button.disabled=true;owner=B.state();sig=signature();vectors=null;run=null;done=0;paused=false;
 const token=++generation;
 try{
  status.textContent='Downloading and verifying SPECTER2...';
  await ScreenOffline.register();
  await installPack((bytes,total)=>{status.textContent='Verified SPECTER2 '+(bytes/1e6).toFixed(1)+' / '+(total/1e6).toFixed(1)+' MB';});
  if(token!==generation||!current())throw Error('Project or record text changed; start preparation again.');
  worker=new Worker('semantic-worker.mjs',{type:'module'});const owned=worker;
  pause.hidden=false;pause.textContent='Pause';status.textContent=summary();
  owned.onmessage=({data})=>{
   if(worker!==owned)return;
   if(!current()){status.textContent='Project or record text changed; embeddings discarded.';stop();return;}
   if(data.error){status.textContent=data.error;stop();return;}
   if(data.progress){done=data.progress;status.textContent=summary()+'; '+data.docsPerSecond.toFixed(2)+' docs/s; ETA '+Math.ceil(data.etaSeconds)+' s'+(paused?' (pausing)':'');}
   if(data.result){
    vectors=data.result.vectors;run={...data.result,vectors:undefined};
    B.state().rank.semanticPreparation={...run,records:records().length};
    B.save();status.textContent=summary()+' '+run.backend+(run.fallbackReason?'; WebGPU fallback: '+run.fallbackReason:'');
    stop();
   }
  };
  owned.onerror=e=>{status.textContent='SPECTER2 failed: '+e.message;stop();};
  owned.postMessage({id:1,model:'specter2',records:records().map(r=>({id:r.id,title:r.title,abstract:r.abstract}))});
 }catch(e){status.textContent=e.message;stop();}
};
window.addEventListener('screen-state',()=>{
 if(owner&&!current()){generation++;vectors=null;run=null;done=0;if(worker)stop();}
 if(!busy)status.textContent=summary();
});
status.textContent=summary();
