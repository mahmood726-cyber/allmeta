/* Offline Screen benchmark; calls the page's own shipped simulator.
 * Published rounded references use exact decimal rounding, not a fabricated R oracle. */
(function () {
'use strict';
const base = new URL('.', document.currentScript.src);
const repo = 'https://github.com/mahmood726-cyber/screen-reproducible';
const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
const pause = () => new Promise(r=>setTimeout(r,0));
const script = path => new Promise((resolve,reject)=>{
 const el=document.createElement('script'); el.src=new URL(path,base).href;
 el.onload=resolve; el.onerror=()=>reject(Error('Cannot load local asset: '+path)); document.head.appendChild(el);
});
let busy=false, selector, bar, status;
const adapter=window.ScreenValidationAdapter={
 app:'screen',
 paper:{title:'Screen: title-abstract screening benchmark',doi:'10.5281/zenodo.23132680',checks:29,
 repoUrl:repo,runUrl:repo+'/actions/workflows/reproduce.yml',
 codespacesUrl:'https://codespaces.new/mahmood726-cyber/screen-reproducible?quickstart=1'},
 live:null,
 corpus:{files:[],mode:'full',run,loadFiles}
};
async function loadFiles(){
 await adapter.ready;
 if(location.protocol==='file:'){
  if(!window.ScreenValidationFiles) await script('corpus/offline.js');
  return window.ScreenValidationFiles;
 }
 const files={};
 for(const f of adapter.corpus.files){
  const r=await fetch(new URL('../'+f.path,base));
  if(!r.ok)throw Error('Cannot load '+f.path+': HTTP '+r.status);
  files[f.path]=await r.text();
 }
 return files;
}
async function verified(files,f){
 let raw=files instanceof Map?files.get(f.path):files[f.path];
 if(raw===undefined)throw Error('Missing corpus file: '+f.path);
 if(raw&&typeof raw==='object'&&!(raw instanceof ArrayBuffer)&&!ArrayBuffer.isView(raw))raw=JSON.stringify(raw);
 const bytes=typeof raw==='string'?new TextEncoder().encode(raw):new Uint8Array(raw);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==f.sha256)throw Error('SHA-256 mismatch: '+f.path+'; validation refused');
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
async function unpack(data){
 if(data.encoding!=='gzip-base64-json')throw Error('Unsupported corpus encoding');
 const packed=Uint8Array.from(atob(data.records),c=>c.charCodeAt(0));
 const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
 const rows=JSON.parse(await new Response(stream).text());
 if(rows.length!==data.metadata.n||rows.reduce((n,r)=>n+r[2],0)!==data.metadata.relevant||
 rows.some(r=>r.length!==3||typeof r[0]!=='string'||typeof r[1]!=='string'||![0,1].includes(r[2])))
 throw Error('Corpus schema/count mismatch: '+data.metadata.id);
 return rows.map((r,i)=>({id:'r'+i,title:r[0],abstract:r[1],keywords:[],gold:r[2]}));
}
async function run(files,onProgress){
 if(busy)throw Error('A Screen validation is already running');
 busy=true;
 try{
  await adapter.ready;
  const mode=adapter.corpus.mode;
  if(!['quick','full'].includes(mode))throw Error('Unknown validation mode');
  if(!window.__almScreenpro||typeof window.__almScreenpro.simulateActiveLearning!=='function')throw Error('Shipped simulator unavailable');
  files=files||await loadFiles();
  const checked={};
  for(const f of adapter.corpus.files)checked[f.path]=await verified(files,f);
  const ref=checked['validate/corpus/reference.json'];
  const ids=mode==='quick'?ref.quickDatasets:ref.datasets.map(d=>d.id);
  const seeds=mode==='quick'?[ref.seeds[0]]:ref.seeds;
  const expected=(mode==='quick'?ref.quick:ref.paper).values;
  const rows=[],runs=[],means={},start=performance.now(),total=ids.length*seeds.length;
  let done=0;
  if(selector)selector.disabled=true;
  function update(message){
   const elapsed=(performance.now()-start)/1000,eta=done?Math.round(elapsed/done*(total-done)):null;
   const label=message+': '+done+'/'+total+' simulations; '+(eta===null?'estimating after first seed':'estimated remaining '+eta+' s');
   if(bar){bar.max=total;bar.value=done;}if(status)status.textContent=label;
   if(onProgress)onProgress({done,total,completed:done,message:label,elapsed,etaSeconds:eta});
  }
  function compare(key,value){
   const oracle=expected[key];
   if(!oracle||!Number.isFinite(value))throw Error('Missing/nonfinite comparison: '+key);
   rows.push({id:key,quantity:key,app:value,ref:oracle.value,diff:Math.abs(value-oracle.value),
    tol:0.5*10**-oracle.decimals,pass:Number(value.toFixed(oracle.decimals))===oracle.value,
    rule:'Must round to published value at '+oracle.decimals+' decimals'});
  }
  update('Running '+mode);await pause();
  for(const id of ids){
   const records=await unpack(checked['validate/corpus/'+id+'.json']),values=[];
   for(const rngSeed of seeds){
    const out=window.__almScreenpro.simulateActiveLearning({records,batch:1,rngSeed,buscar:true});
    if(!out||!out.ok||!Number.isFinite(out.wss95))throw Error('Simulation refused: '+id+' seed '+rngSeed);
    values.push(out.wss95);
    runs.push({dataset:id,seed:rngSeed,wss95:out.wss95,screenedAt95:out.screenedAt95,N:out.N,recallAt10pct:out.recallAt10pct,recallAt20pct:out.recallAt20pct,recallAt50pct:out.recallAt50pct,buscarStopAt:out.buscarStopAt});
    done++;update(id+', seed '+rngSeed);await pause();
   }
   means[id]=mean(values);compare('screen_wss95['+id+']',means[id]);
  }
  if(mode==='full'){
   const all=Object.values(means),sorted=all.slice().sort((a,b)=>a-b);
   compare('screen_mean_all',mean(all));compare('screen_median_all',sorted[Math.floor(sorted.length/2)]);
   compare('screen_min',Math.min(...all));compare('screen_max',Math.max(...all));
   compare('screen_mean_cohen',mean(ids.filter(id=>id.startsWith('cohen_')).map(id=>means[id])));
   compare('screen_mean_synergy',mean(ids.filter(id=>!id.startsWith('cohen_')).map(id=>means[id])));
   for(const pct of [10,20,50])compare('recall_at_'+pct+'pct_pct',100*mean(ids.map(id=>mean(runs.filter(r=>r.dataset===id).map(r=>r['recallAt'+pct+'pct'])))));
   compare('buscar_never_fired',ids.filter(id=>runs.filter(r=>r.dataset===id).every(r=>r.buscarStopAt===r.N)).length);
  }
  const failed=rows.filter(r=>!r.pass),passed=rows.length-failed.length;
  const line='SCREEN '+mode.toUpperCase()+': '+ids.length+' datasets x '+seeds.length+' seeds = '+done+' simulations; '+rows.length+' checks; '+passed+' passed; '+failed.length+' failed';
  const summaryLines=[line,'Reference: expected/'+(mode==='full'?'paper_values.json':'quick_values.json')+'; exact published rounding required.',
   'Scope: Screen active learning (WSS@95, recall and Buscar stopping). ASReview and de-duplication claims are not validated here.',
   'results/full/ is absent in the supplied checkout; no per-seed oracle is available. Simulation count is not a comparison count.',
   'R check available via the reproducible repo'];
  if(mode==='full')summaryLines.push('Mean WSS@95: app '+mean(Object.values(means))+'; paper '+expected.screen_mean_all.value);
  rows.forEach(r=>summaryLines.push((r.pass?'PASS ':'FAIL ')+r.quantity+': app '+r.app+'; expected '+r.ref+'; '+r.rule));
  const result={checks:rows.length,passed,failed,maxima:{wss95:Math.max(...rows.filter(r=>r.id.startsWith('screen_')).map(r=>r.diff))},
   refusals:{},summaryLines,rows,simulations:done,datasets:ids.length,seeds,mode,
   expectedChecks:mode==='full'?29:4,runs,elapsedSeconds:(performance.now()-start)/1000};
  if(status)status.textContent=line+'; '+result.elapsedSeconds.toFixed(1)+' s';
  return result;
 }catch(error){if(status)status.textContent='Validation refused: '+error.message;throw error;}finally{busy=false;if(selector)selector.disabled=false;}
}
adapter.ready=script('pins.js').then(()=>{
 adapter.corpus.files=window.ScreenValidationManifest.files;
 const mount=document.getElementById('alm-validate');
 if(window.AlmValidate)window.AlmValidate.mount(mount,adapter);
 else{
  const p=document.createElement('p');p.textContent='Validation widget unavailable: shared/alm-validate.js must be integrated.';mount.appendChild(p);
  const a=document.createElement('a');a.href=repo;a.textContent='R check available via the reproducible repo';mount.appendChild(a);
 }
 const controls=document.createElement('div'),label=document.createElement('label');
 label.textContent='Screen benchmark scope: ';selector=document.createElement('select');selector.id='screen-validation-mode';
 for(const [value,text] of [['full','Full: 19 datasets, 10 seeds (190 simulations, 29 comparisons)'],
 ['quick','Quick: antihistamines, estrogens, NSAIDs, urinary incontinence; seed 101 (4 comparisons)']]){
  const option=document.createElement('option');option.value=value;option.textContent=text;selector.appendChild(option);
 }
 selector.addEventListener('change',()=>{adapter.corpus.mode=selector.value;});label.appendChild(selector);controls.appendChild(label);
 bar=document.createElement('progress');bar.setAttribute('aria-label','Screen benchmark progress');bar.value=0;bar.max=190;controls.appendChild(bar);
 status=document.createElement('p');status.setAttribute('role','status');
 status.textContent='Full replay may take several minutes. Remaining time is estimated after the first seed. References are published rounded values, not R output.';
 controls.appendChild(status);mount.prepend(controls);return adapter;
});
adapter.ready.catch(e=>{document.getElementById('alm-validate').textContent='Validation refused: '+e.message;});
})();
