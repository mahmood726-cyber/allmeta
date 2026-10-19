/* Deterministic, descriptive k-means plots. No causal or predictive claims. */
(function(root){
 'use strict';
 function fit(data,k,options={}){
  if(!Array.isArray(data)||!data.length||!Array.isArray(data[0])||!data[0].length)throw new Error('A nonempty numeric matrix is required.');
  const n=data.length,dim=data[0].length,restarts=options.restarts??10,maxIterations=options.maxIterations??100;
  if(!Number.isInteger(k)||k<1||k>n)throw new Error('Cluster count must be an integer between 1 and the number of rows.');
  if(!Number.isInteger(restarts)||restarts<1||restarts>100||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>1000)throw new Error('Invalid restart or iteration limit.');
  if(data.some(p=>!Array.isArray(p)||p.length!==dim||p.some(x=>!Number.isFinite(x))))throw new Error('Clustering requires finite, equally sized numeric rows.');
  if(new Set(data.map(p=>JSON.stringify(p))).size<k)throw new Error('Fewer distinct data points than requested clusters.');
  let seed=(options.seed??51)>>>0;
  function random(){seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
  const distance=(a,b)=>a.reduce((sum,x,j)=>sum+(x-b[j])**2,0);
  let best=null;
  for(let restart=0;restart<restarts;restart++){
   let centers=[data[Math.floor(random()*n)].slice()];
   while(centers.length<k){const distances=data.map(p=>Math.min(...centers.map(c=>distance(p,c))));const total=distances.reduce((a,b)=>a+b,0);let target=random()*total,index=distances.findIndex(d=>d>0);for(let i=0;i<n;i++){target-=distances[i];if(target<=0&&distances[i]>0){index=i;break;}}centers.push(data[index].slice());}
   let labels=new Array(n).fill(-1),iterations=0;
   for(;iterations<maxIterations;iterations++){
    const next=data.map(p=>{let winner=0,smallest=Infinity;centers.forEach((c,i)=>{const d=distance(p,c);if(d<smallest){winner=i;smallest=d;}});return winner;});
    const counts=new Array(k).fill(0);next.forEach(i=>counts[i]++);
    // Repair an empty cluster with the most poorly represented eligible point,
    // never by returning NaN centers or deleting an observation.
    for(let c=0;c<k;c++)if(!counts[c]){let index=-1,farthest=-1;data.forEach((p,i)=>{const d=distance(p,centers[next[i]]);if(counts[next[i]]>1&&d>farthest){index=i;farthest=d;}});if(index<0)throw new Error('A nonempty cluster partition could not be formed.');counts[next[index]]--;next[index]=c;counts[c]++;}
    const sums=Array.from({length:k},()=>new Array(dim).fill(0));data.forEach((p,i)=>p.forEach((x,j)=>sums[next[i]][j]+=x));
    centers=sums.map((sum,c)=>sum.map(x=>x/counts[c]));
    const unchanged=next.every((value,i)=>value===labels[i]);labels=next;if(unchanged){iterations++;break;}
   }
   const inertia=data.reduce((sum,p,i)=>sum+distance(p,centers[labels[i]]),0);
   if(!best||inertia<best.inertia)best={labels:labels.slice(),centroids:centers.map(c=>c.slice()),inertia,iterations};
  }
  return {...best,restartsCompleted:restarts,seed:(options.seed??51)>>>0};
 }
 root.IPDClustering=Object.freeze({fit,version:'2026-10-12.1'});
 root.kMeans=(data,k,nRestarts)=>fit(data,k,{restarts:nRestarts??10}).labels;
 if(typeof document==='undefined')return;
 let current=null,resizeFrame=null;
 function close(){document.getElementById('ipdClusterModal')?.remove();current=null;}
 function draw(){
  const canvas=document.getElementById('clusterPlot');if(!canvas||!current)return;
  if(JSON.stringify(APP.data)!==current.fingerprint){document.getElementById('ipdClusterStatus').textContent='The dataset changed. Close this window and rerun clustering for the current data.';canvas.hidden=true;return;}
  const width=canvas.parentElement.clientWidth,height=360,dpr=Math.min(devicePixelRatio||1,2);if(width<=0)return;
  canvas.width=Math.round(width*dpr);canvas.height=height*dpr;canvas.style.cssText='display:block;width:100%;height:360px';
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  const css=getComputedStyle(document.body),text=css.getPropertyValue('--text-primary').trim()||'#111827';
  ctx.fillStyle=css.getPropertyValue('--bg-card').trim()||'#ffffff';ctx.fillRect(0,0,width,height);ctx.font='12px system-ui';
  const rows=current.rows,xs=rows.map(r=>r[0]),ys=rows.map(r=>r[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const xspan=Math.max(xmax-xmin,1e-9),yspan=Math.max(ymax-ymin,1e-9),left=65,right=25,top=30,bottom=65;
  const x=v=>left+(v-xmin+.05*xspan)/(1.1*xspan)*(width-left-right),y=v=>height-bottom-(v-ymin+.05*yspan)/(1.1*yspan)*(height-top-bottom);
  const colors=['#6366f1','#10b981','#f59e0b','#ef4444','#06b6d4'];
  rows.forEach((r,i)=>{ctx.fillStyle=colors[current.fit.labels[i]%colors.length];ctx.beginPath();ctx.arc(x(r[0]),y(r[1]),3.5,0,2*Math.PI);ctx.fill();});
  ctx.strokeStyle=text;ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,height-bottom);ctx.lineTo(width-right,height-bottom);ctx.stroke();ctx.fillStyle=text;
  for(let i=0;i<=4;i++){const vx=xmin+xspan*i/4,vy=ymin+yspan*i/4;ctx.textAlign='center';ctx.fillText(vx.toFixed(1),x(vx),height-bottom+20);ctx.textAlign='right';ctx.fillText(vy.toFixed(1),left-7,y(vy)+4);}
  ctx.textAlign='center';ctx.fillText(current.variables[0],width/2,height-10);ctx.save();ctx.translate(15,height/2);ctx.rotate(-Math.PI/2);ctx.fillText(current.variables[1],0,0);ctx.restore();
  canvas.dataset.plotState='ready';canvas.dataset.rows=String(rows.length);
 }
 root.runPatientClustering=function(){
  try{
   if(!Array.isArray(APP.data)||APP.data.length<3)throw new Error('Load at least three complete patient records before clustering.');
   const excluded=new Set(['study','study_id','patient_id','treatment','treatment_name','time','event','time_months',APP.config.studyVar,APP.config.treatmentVar,APP.config.eventVar,APP.config.timeVar,document.getElementById('varEvent')?.value,document.getElementById('varTime')?.value]);
   const variables=Object.keys(APP.data[0]).filter(k=>!excluded.has(k)&&APP.data.every(r=>typeof r[k]==='number'&&Number.isFinite(r[k]))).slice(0,5);
   if(variables.length<2)throw new Error('At least two complete numeric non-outcome covariates are needed. Outcome, time and identifier columns are excluded.');
   const rows=APP.data.map(r=>variables.map(k=>r[k]));
   const means=variables.map((_,j)=>rows.reduce((s,r)=>s+r[j],0)/rows.length);
   const sd=variables.map((_,j)=>Math.sqrt(rows.reduce((s,r)=>s+(r[j]-means[j])**2,0)/Math.max(1,rows.length-1))||1);
   const standardized=rows.map(r=>r.map((x,j)=>(x-means[j])/sd[j]));const fitted=fit(standardized,3);
   close();current={rows,variables,fit:fitted,fingerprint:JSON.stringify(APP.data)};
   const modal=document.createElement('div');modal.id='ipdClusterModal';modal.className='modal-overlay active';
   modal.innerHTML='<div class="modal" style="width:min(900px,95vw);max-height:90vh;overflow:auto"><div class="modal-header"><h3>Descriptive patient clustering</h3><button type="button" class="modal-close" aria-label="Close clustering">×</button></div><div class="modal-body"><p id="ipdClusterStatus"></p><canvas id="clusterPlot" aria-label="Actual patient clusters in two selected covariates"></canvas><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Cluster</th><th>Patients</th><th>Mean covariate values</th></tr></thead><tbody id="ipdClusterRows"></tbody></table></div></div></div>';
   modal.querySelector('button').addEventListener('click',close);document.body.appendChild(modal);
   document.getElementById('ipdClusterStatus').textContent='K-means on standardized '+variables.join(', ')+'. The graph shows the first two covariates in original units. Descriptive groups only—not validated phenotypes, treatment-effect estimates, or causal findings. Seed 51; '+fitted.restartsCompleted+' restarts.';
   const body=document.getElementById('ipdClusterRows');
   for(let c=0;c<3;c++){const subset=rows.filter((_,i)=>fitted.labels[i]===c);const tr=document.createElement('tr');for(const value of [String(c+1),String(subset.length),variables.map((name,j)=>name+': '+(subset.reduce((s,r)=>s+r[j],0)/subset.length).toFixed(2)).join('; ')]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}body.appendChild(tr);}
   requestAnimationFrame(draw);
  }catch(e){if(typeof hideLoadingOverlay==='function')hideLoadingOverlay();if(typeof showNotification==='function')showNotification(e.message,'warning');else alert(e.message);}
 };
 window.addEventListener('resize',()=>{if(resizeFrame)cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(draw);});
})(globalThis);
