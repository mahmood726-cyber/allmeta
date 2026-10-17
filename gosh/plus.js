(function () {
  'use strict';
  const fields = ['with_n','without_n','with_mean','without_mean','diff_mean','with_median','without_median','diff_median','with_i2','without_i2','diff_i2'];
  const labels = ['With: count','Without: count','With: mean estimate','Without: mean estimate','Difference: mean estimate','With: median estimate','Without: median estimate','Difference: median estimate','With: mean I²','Without: mean I²','Difference: mean I²'];
  const axes = {I2:'I² (%)',H2:'H²',Q:'Q',tau2:'τ²',tau:'τ'};
  let state = null, selected = 1, sort = 'study', ascending = true;
  const panel = document.getElementById('alm-plus') || document.createElement('section'); panel.id = 'alm-plus';panel.className='panel';panel.style.gridColumn='1 / -1';panel.style.minWidth='0';
  panel.innerHTML = `<style>
    #alm-plus table {border-collapse:collapse;font-size:.85rem;}
    #alm-plus th,#alm-plus td {padding:.45rem .7rem;border-bottom:1px solid var(--border);white-space:nowrap;text-align:right;}
    #alm-plus th:first-child {text-align:left;}
    #alm-plus caption {text-align:left;padding:.6rem 0;}
    #alm-plus pre {white-space:pre-wrap;overflow-wrap:anywhere;}
    #alm-plus tr[aria-selected="true"] {background:var(--accent-soft);}
    #plus-plot {max-width:840px;margin:1rem auto;}
    #plus-table button:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}
    </style><h2>Study inclusion and influence</h2>
    <p>Descriptive summaries of overlapping subsets; no p-values. Differences are with minus without.</p>
    <button type="button" id="plus-refresh">Refresh extras from current inputs</button>
    <p id="plus-status" role="status" aria-live="polite">Refresh to analyse the current inputs.</p>
    <label for="plus-study">Highlight study</label><select id="plus-study"></select>
    <label for="plus-het">Highlight plot heterogeneity</label><select id="plus-het"></select>
    <p id="plus-counts" aria-live="polite"></p>
    <svg id="plus-plot" viewBox="0 0 600 420" role="img" aria-label="Subset estimates coloured by study inclusion"></svg>
    <div style="overflow:auto"><table id="plus-table"><caption>Per-study inclusion summaries; select a study to highlight its subsets</caption><thead><tr></tr></thead><tbody></tbody></table></div>
    <h2>Validate the extras in R</h2><div id="alm-plus-validate"></div>`;
  if(!panel.isConnected)document.querySelector('main').append(panel);
  const el = id => document.getElementById(id);
  const format = x => String(Number(x.toPrecision(12)));
  function number(x) { if (typeof x !== 'number' || !Number.isFinite(x)) throw Error('Nonfinite extra refused'); return x; }
  function mean(a) { return a.reduce((s,x)=>s+x/a.length,0); }
  function median(a) { a=[...a].sort((x,y)=>x-y); const i=Math.floor(a.length/2);return a.length%2?a[i]:a[i-1]/2+a[i]/2; }
  function derive(a) {
    if (!a.summary || !['FE','DL'].includes(a.summary.model)) throw Error('Need 3 through 100 valid studies');
    const k=a.summary.k;
    const points=a.points.map(p=>{
      if (!Array.isArray(p.members)||!p.members.length||new Set(p.members).size!==p.members.length||p.members.some(i=>!Number.isInteger(i)||i<1||i>k)||p.k!==p.members.length) throw Error('Invalid subset membership');
      const tau2=a.summary.model==='DL'&&p.k>1?number(p.tau2):0;
      return {members:[...p.members],mu:number(p.mu),I2:number(p.I2),Q:number(p.Q),H2:p.k===1?1:number(p.Q/(p.k-1)),tau2,tau:Math.sqrt(tau2)};
    });
    if (!points.length || (!a.summary.sampled && points.length!==2**k-1)) throw Error('Missing subset coverage');
    const rows=Array.from({length:k},(_,j)=>{
      const study=j+1,withPoints=points.filter(p=>p.members.includes(study)),without=points.filter(p=>!p.members.includes(study));
      if (!withPoints.length||!without.length) throw Error('Study '+study+' has an empty with/without group; increase the draws');
      const row={study,with_n:withPoints.length,without_n:without.length};
      for (const [q,field,fn] of [['mean','mu',mean],['median','mu',median],['i2','I2',mean]]) {
        row['with_'+q]=number(fn(withPoints.map(p=>p[field])));row['without_'+q]=number(fn(without.map(p=>p[field])));
        row['diff_'+q]=number(row['with_'+q]-row['without_'+q]);
      }
      return row;
    });
    return {rows,points,k,model:a.summary.model,sampled:a.summary.sampled,labels:a.summary.studies.map(s=>s.label)};
  }
  function draw() {
    if (!state) return;
    const q=el('plus-het').value, svg=el('plus-plot');svg.replaceChildren();
    const xs=state.points.map(p=>p.mu),ys=state.points.map(p=>p[q]);
    const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(0,...ys),ymax=Math.max(...ys);
    function coord(v,lo,hi,offset,size) {if(lo===hi)return offset+size/2;const s=Math.max(Math.abs(lo),Math.abs(hi));return offset+size*((v/s-lo/s)/(hi/s-lo/s));}
    const ns='http://www.w3.org/2000/svg';
    state.points.forEach((p,i)=>{const c=document.createElementNS(ns,'circle');c.setAttribute('cx',coord(p.mu,xmin,xmax,60,520));c.setAttribute('cy',400-coord(p[q],ymin,ymax,30,350));c.setAttribute('r','2');c.setAttribute('fill',p.members.includes(selected)?'#0072b2':'#d55e00');c.dataset.index=i;c.dataset.includes=String(p.members.includes(selected));svg.append(c);});
    for(const [i,x,y,dx,dy] of [[0,60,370,0,5],[1,580,370,0,5],[2,60,370,-5,0],[3,60,20,-5,0]]) {const t=document.createElementNS(ns,'path');t.dataset.plusTick=i;t.setAttribute('d',`M ${x} ${y} l ${dx} ${dy}`);t.setAttribute('stroke','currentColor');svg.append(t);}
    for(const [text,x,y] of [['Pooled effect',240,415],[axes[q],5,15],[format(xmin),60,390],[format(xmax),580,390],[format(ymin),5,370],[format(ymax),5,30]]) {const t=document.createElementNS(ns,'text');t.textContent=text;t.setAttribute('x',x);t.setAttribute('y',y);t.setAttribute('font-size','12');if(x===580)t.setAttribute('text-anchor','end');t.setAttribute('fill','currentColor');svg.append(t);}
    const row=state.rows[selected-1];el('plus-counts').textContent=`Includes study ${selected}: ${row.with_n} (blue); excludes study ${selected}: ${row.without_n} (orange).`;
    for (const tr of el('plus-table').tBodies[0].rows) tr.setAttribute('aria-selected',String(Number(tr.dataset.study)===selected));
  }
  function table() {
    const head=el('plus-table').tHead.rows[0];head.replaceChildren();
    ['study',...fields].forEach((q,i)=>{const th=document.createElement('th');th.scope='col';th.setAttribute('aria-sort',sort===q?(ascending?'ascending':'descending'):'none');const b=document.createElement('button');b.type='button';b.dataset.sort=q;b.textContent=i?labels[i-1]:'Study';b.onclick=()=>{ascending=sort===q?!ascending:true;sort=q;table();draw();head.querySelector('[data-sort="'+q+'"]')?.focus();};th.append(b);head.append(th);});
    const body=el('plus-table').tBodies[0];body.replaceChildren();
    [...state.rows].sort((a,b)=>(ascending?1:-1)*(a[sort]-b[sort])||a.study-b.study).forEach(row=>{
      const tr=document.createElement('tr');tr.dataset.study=row.study;const th=document.createElement('th');th.scope='row';const b=document.createElement('button');b.type='button';b.textContent=`${row.study}: ${state.labels[row.study-1]}`;tr.onclick=()=>{selected=row.study;el('plus-study').value=selected;draw();};th.append(b);tr.append(th);
      fields.forEach(q=>{const td=document.createElement('td');td.dataset.quantity=q;td.textContent=q.endsWith('_n')?String(row[q]):format(row[q]);tr.append(td);});body.append(tr);
    });
  }
  function render(next) {
    state=next;selected=Math.min(selected,state.k);
    el('plus-study').replaceChildren(...state.rows.map(r=>new Option(`${r.study}: ${state.labels[r.study-1]}`,r.study)));
    el('plus-study').value=selected;const prior=el('plus-het').value;
    el('plus-het').replaceChildren(...Object.entries(axes).filter(([q])=>state.model==='DL'||!q.startsWith('tau')).map(([q,label])=>new Option(label,q)));
    if ([...el('plus-het').options].some(o=>o.value===prior))el('plus-het').value=prior;
    el('plus-status').textContent=state.sampled?"Summaries over the app's own draws; repeated memberships retained. R validation uses the same memberships.":'Full enumeration; R validation matches exact subset memberships to metafor::gosh.';
    table();draw();return state;
  }
  function capture(text,model,draws) {
    const input=text===undefined?el('src').value:text, lines=input.trim().split(/\n/);
    if(lines.length<3||lines.length>100||lines.some(l=>{const v=l.split(',');return v.length<2||!v[0].trim()||!v[1].trim()||!Number.isFinite(Number(v[0]))||!Number.isFinite(Number(v[1]))||Number(v[1])<=0;}))throw Error('Need 3 through 100 valid effect rows; invalid lines refused');
    if(document.querySelector('#alm-axis-mount [data-error]')?.textContent)throw Error('Correct invalid axis limits before validating');
    const snap=__almGoshValidationSnapshot();let a;
    try {alm.urlState.withoutWrites(()=>{a=__almGoshValidationRun(input,model,draws);});}
    finally {__almGoshValidationRestore(snap);}
    return derive(a);
  }
  function clear(message='Refresh to analyse the current inputs.') {
    state=null;selected=1;el('plus-status').textContent=message;
    for(const id of ['plus-plot','plus-study','plus-het'])el(id).replaceChildren();
    el('plus-table').tBodies[0].replaceChildren();el('plus-table').tHead.rows[0].replaceChildren();el('plus-counts').textContent='';
  }
  function refresh() {try {render(capture());} catch(e) {clear('Refused: '+e.message);}}

  el('plus-refresh').onclick=refresh;
  el('plus-study').onchange=()=>{selected=Number(el('plus-study').value);draw();};el('plus-het').onchange=draw;
  for(const id of ['src','model','n-sample'])el(id).addEventListener('input',()=>{el('plus-status').textContent='Inputs changed. Refresh extras before interpreting them.';});
  window.AlmGoshPlus={fields,columnLabels:['Study',...labels],axes,derive,capture,render,refresh,clear,get state(){return state;}};
})();
