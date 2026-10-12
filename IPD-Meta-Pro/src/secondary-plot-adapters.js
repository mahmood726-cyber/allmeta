/* Rendering adapters only. Model fitting, KM estimation and MCMC are unchanged.
 * Ranking input is the existing engine's full simulated probability matrix,
 * never reconstructed from SUCRA/P-scores. The single-file app embeds this file.
 */
(function (root) {
  'use strict';
  let ranking = null, rankingError = '', survival = null, bayes = null, frame = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  const byId = id => document.getElementById(id);
  const dataSignature = () => JSON.stringify(APP.data || []);
  const palette = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#3b82f6','#ec4899','#14b8a6'];
  const css = (name, fallback) => getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
  function sum(values) { return values.reduce((s, x) => s + x, 0); }
  function validMatrix(result) {
    const p = result && result.probabilityMatrix;
    if (!p || !Array.isArray(p.treatments) || !Array.isArray(p.matrix)) return false;
    const n = p.treatments.length;
    if (n < 2 || new Set(p.treatments).size !== n || !p.treatments.every(t => typeof t === 'string' && t.length)) return false;
    if (p.matrix.length !== n || !p.matrix.every(row => Array.isArray(row) && row.length === n && row.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1) && Math.abs(sum(row) - 1) < 1e-7)) return false;
    return p.treatments.every((_, j) => Math.abs(sum(p.matrix.map(row => row[j])) - 1) < 1e-7);
  }
  function rankingPrerequisite(rows, treatments, outcomeType) {
    if (!['continuous','binary'].includes(outcomeType)) return 'Ranking plots require a supported continuous or binary network; survival conversions are not supplied by this model.';
    const graph = new Map(treatments.map(t => [t, new Set()])), arms = new Map();
    for (const row of rows) {
      if (!graph.has(row.treatment1) || !graph.has(row.treatment2)) return 'Network treatment labels do not match the fitted contrasts.';
      graph.get(row.treatment1).add(row.treatment2); graph.get(row.treatment2).add(row.treatment1);
      if (!arms.has(row.study)) arms.set(row.study, new Set());
      arms.get(row.study).add(row.treatment1); arms.get(row.study).add(row.treatment2);
    }
    if ([...arms.values()].some(set => set.size > 2)) return 'Ranking plots are unavailable for multi-arm designs in this IPD model: its contrast-covariance handling has not been established. Use a validated multi-arm NMA workflow.';
    const seen = new Set(), queue = [treatments[0]];
    while (queue.length) { const t = queue.pop(); if (seen.has(t)) continue; seen.add(t); for (const next of graph.get(t) || []) queue.push(next); }
    return seen.size === treatments.length ? '' : 'The network is disconnected. Rankings across disconnected components are not estimable; analyse a connected component explicitly.';
  }
  function setRanking(result, reason = '') {
    rankingError = reason || 'Run an eligible network analysis to obtain a valid rank-probability matrix. Summary scores alone cannot determine a rankogram.';
    ranking = validMatrix(result) && !reason ? { result: clone(result), signature: dataSignature() } : null;
    renderRanking();
  }
  function getRankingView() {
    if (!ranking || ranking.signature !== dataSignature()) return null;
    const lower = byId('ipdRankDirection')?.value === 'lower';
    const { treatments, matrix } = ranking.result.probabilityMatrix;
    const n = treatments.length;
    const rows = treatments.map((treatment, i) => {
      const probabilities = lower ? matrix[i].slice().reverse() : matrix[i].slice();
      let total = 0;
      const cumulative = probabilities.map(p => (total += p));
      return { treatment, probabilities, cumulative, sucra: sum(cumulative.slice(0,-1))/(n-1),
        meanRank: sum(probabilities.map((p,j) => p*(j+1))), probBest: probabilities[0], probWorst: probabilities[n-1] };
    }).sort((a,b) => b.sucra-a.sucra || a.treatment.localeCompare(b.treatment));
    return { rows, direction: lower ? 'lower' : 'higher', nSimulations: ranking.result.nSimulations || null };
  }
  function setup(canvas, n) {
    canvas.hidden = false;
    // Size from the revealed panel. Do not impose an 800px backing width on a
    // narrow phone panel and then compress text/geometry into it.
    const w = Math.max(240, canvas.parentElement.clientWidth || canvas.clientWidth || 500);
    const h = Math.max(330, 260 + n*18), ratio = Math.min(2, root.devicePixelRatio || 1);
    canvas.style.width = '100%'; canvas.style.height = h + 'px';
    canvas.width = Math.round(w*ratio); canvas.height = Math.round(h*ratio);
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.fillStyle = css('--bg-card','#fff'); ctx.fillRect(0,0,w,h);
    return {ctx,w,h,left:44,top:36,pw:w-60,ph:190};
  }
  function drawRanking(id, view) {
    const canvas = byId(id); if (!canvas) return;
    const {ctx,w,left,top,pw,ph} = setup(canvas,view.rows.length), n = view.rows.length;
    const cumulative = id === 'cumulativeRankPlot';
    ctx.fillStyle = css('--text-primary','#111827'); ctx.textAlign = 'center'; ctx.font = 'bold 12px system-ui';
    ctx.fillText(cumulative ? 'Computed cumulative rank probabilities' : 'Computed rank probabilities',w/2,18);
    ctx.strokeStyle = css('--text-muted','#667085'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left,top);ctx.lineTo(left,top+ph);ctx.lineTo(left+pw,top+ph);ctx.stroke();
    ctx.font='10px system-ui';
    for(let j=0;j<=4;j++) {
      const p=j/4,y=top+ph-p*ph;ctx.textAlign='right';ctx.fillText(p.toFixed(2),left-5,y+3);
    }
    for(let r=0;r<n;r++) {ctx.textAlign='center';ctx.fillText(String(r+1),left+(r+.5)*pw/n,top+ph+16);}
    const geometry=[];
    view.rows.forEach((row,i)=>{
      ctx.fillStyle=palette[i%palette.length];ctx.strokeStyle=palette[i%palette.length];ctx.lineWidth=2;
      if(cumulative) {
        ctx.beginPath();
        row.cumulative.forEach((p,r)=>{const x=left+(r+.5)*pw/n,y=top+ph-p*ph;(r?ctx.lineTo.bind(ctx):ctx.moveTo.bind(ctx))(x,y);geometry.push({treatment:row.treatment,rank:r+1,probability:p,x,y});});
        ctx.stroke();
      } else {
        const group=pw/n,bar=group*.84/n;
        row.probabilities.forEach((p,r)=>{const x=left+r*group+group*.08+i*bar,y=top+ph-p*ph;ctx.fillRect(x,y,Math.max(.3,bar-.5),p*ph);geometry.push({treatment:row.treatment,rank:r+1,probability:p,x,y,height:p*ph});});
      }
      const y=top+ph+48+i*18;
      ctx.fillRect(left,y-9,10,10);ctx.fillStyle=css('--text-primary','#111827');ctx.textAlign='left';
      ctx.font='11px system-ui';ctx.fillText(row.treatment,left+16,y,Math.max(20,pw-20));
    });
    ctx.fillStyle=css('--text-primary','#111827');ctx.textAlign='center';ctx.font='11px system-ui';
    ctx.fillText('Numerical rank (1 = first)',left+pw/2,top+ph+33);
    // Auditable display geometry, not an additional statistical calculation.
    canvas.__ipdRankGeometry=geometry;
    canvas.dataset.plotState='ready';
  }
  function renderRanking() {
    const status=byId('ipdRankingStatus'),table=byId('rankingTableBody');
    const view=getRankingView();
    if(!view) {
      if(status) status.textContent=ranking ? 'Input data changed. Rerun the network analysis before displaying rankings for these data.' : rankingError || 'Run an eligible network analysis to obtain a valid rank-probability matrix.';
      if(table) table.replaceChildren();
      for(const id of ['rankogramPlot','cumulativeRankPlot']) {const c=byId(id);if(c){c.hidden=true;c.dataset.plotState='unavailable';c.__ipdRankGeometry=[];}}
      if(byId('ipdRankFirst')) byId('ipdRankFirst').textContent='—';
      if(byId('ipdRankSucra')) byId('ipdRankSucra').textContent='—';
      return;
    }
    if(status) status.textContent=`${view.nSimulations || 'Computed'} simulated rankings from the existing fitted network model. ${view.direction==='lower'?'Smaller':'Larger'} fitted effect ranks first. Binary contrasts in this engine use minus log odds ratios. Numerical ranking is not proof of clinical benefit; assess model assumptions and outcome direction.`;
    if(byId('ipdRankFirst')) byId('ipdRankFirst').textContent=view.rows[0].treatment;
    if(byId('ipdRankSucra')) byId('ipdRankSucra').textContent=(100*view.rows[0].sucra).toFixed(1)+'%';
    if(table) {
      table.replaceChildren();
      for(const row of view.rows) {
        const tr=document.createElement('tr');
        for(const value of [row.treatment,(100*row.sucra).toFixed(1)+'%',row.meanRank.toFixed(1),(100*row.probBest).toFixed(1)+'%',(100*row.probWorst).toFixed(1)+'%']) {const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}
        table.appendChild(tr);
      }
    }
    for(const id of ['rankogramPlot','cumulativeRankPlot']) drawRanking(id,view);
  }
  function survivalAvailable() {return survival && survival.owner===APP.results && survival.signature===dataSignature();}
  function drawZoom() {
    const canvas=byId('survivalPlotLarge');if(!canvas || !survivalAvailable()) return;
    Plots.drawSurvival(canvas,clone(survival.curves),clone(survival.options));
  }
  function closeZoom() {const dialog=byId('ipdSurvivalZoom');if(dialog){dialog.remove();byId('survivalPlot')?.focus();}}
  function openZoom() {
    if(!survivalAvailable()) {showNotification('Run a survival analysis for the current data before opening this plot.','warning');return;}
    if(byId('ipdSurvivalZoom')) {drawZoom();return;}
    const overlay=document.createElement('div');overlay.id='ipdSurvivalZoom';overlay.className='modal-overlay active';
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','ipdSurvivalZoomTitle');
    overlay.innerHTML='<div class="modal" style="width:92vw;max-width:1200px;max-height:92vh;overflow:auto"><div class="modal-header"><h3 id="ipdSurvivalZoomTitle">Survival curves — enlarged</h3></div><div class="modal-body"><canvas id="survivalPlotLarge" style="width:100%;height:60vh" role="img" aria-label="Enlarged survival curves from the current analysis"></canvas></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-download>Download PNG</button><button type="button" class="btn btn-secondary" data-close>Close</button></div></div>';
    overlay.querySelector('[data-close]').addEventListener('click',closeZoom);
    overlay.querySelector('[data-download]').addEventListener('click',()=>downloadSurvivalPlot('png'));
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeZoom();}if(e.key==='Tab'){const buttons=[...overlay.querySelectorAll('button')];if(e.shiftKey && document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus();}else if(!e.shiftKey && document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus();}}});
    document.body.appendChild(overlay);overlay.querySelector('[data-close]').focus();requestAnimationFrame(drawZoom);
  }
  function bindSurvivalZoom() {
    const canvas=byId('survivalPlot');if(!canvas || canvas.dataset.ipdZoomBound) return;
    canvas.dataset.ipdZoomBound='true';canvas.style.cursor='zoom-in';canvas.tabIndex=0;
    canvas.title='Click or press Enter to enlarge the current survival curves';
    canvas.addEventListener('click',openZoom);
    canvas.addEventListener('keydown',e=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();openZoom();}});
  }
  function setBayesianAvailability(available, message = '') {
    let status = byId('ipdBayesianPlotStatus');
    if (!status && byId('tracePlot')) {
      status = document.createElement('p'); status.id = 'ipdBayesianPlotStatus'; status.setAttribute('role','status');
      byId('tracePlot').parentElement.insertBefore(status, byId('tracePlot'));
    }
    if (status) { status.textContent = message; status.hidden = available; }
    for (const id of ['tracePlot','posteriorPlot']) if (byId(id)) byId(id).hidden = !available;
  }
  function renderBayesian() {
    const valid = bayes && bayes.owner === APP.bayesianResults && bayes.signature === dataSignature()
      && APP.bayesianResults?.chains?.length;
    setBayesianAvailability(!!valid, bayes
      ? 'The input data or Bayesian fit changed. Rerun MCMC before displaying these diagnostics.'
      : 'Run Bayesian analysis for the current input data to display trace and posterior plots.');
    if (!valid) return;
    const chains=APP.bayesianResults.chains.map(c=>c.muSamples);
    Plots.drawTrace(byId('tracePlot'),chains);Plots.drawDensity(byId('posteriorPlot'),chains);
  }
  function schedule() {
    if(frame!==null) cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      frame=null;const active=document.querySelector('.panel.active');
      if(active?.id==='panel-ranking') renderRanking();
      if(active?.id==='panel-bayesian') renderBayesian();
      if(byId('ipdSurvivalZoom')) {if(survivalAvailable())drawZoom();else closeZoom();}
    });
  }
  function install() {
    bindSurvivalZoom();
    const draw=Plots.drawSurvival;
    Plots.drawSurvival=function(canvas,curves,options={}) {
      if(canvas?.id==='survivalPlot' && Array.isArray(curves) && curves.length) {
        survival={curves:clone(curves),options:clone(options),owner:APP.results,signature:dataSignature()};
      }
      return draw.call(this,canvas,curves,options);
    };
    const trace=Plots.drawTrace;
    Plots.drawTrace=function(canvas,...args) {
      if(canvas?.id==='tracePlot' && APP.bayesianResults) {
        bayes={owner:APP.bayesianResults,signature:dataSignature()};
        setBayesianAvailability(true);
      }
      return trace.call(this,canvas,...args);
    };
    byId('ipdRankDirection')?.addEventListener('change',renderRanking);
    root.addEventListener('resize',schedule);
    const observer=new MutationObserver(schedule);
    document.querySelectorAll('.panel').forEach(panel=>observer.observe(panel,{attributes:true,attributeFilter:['class']}));
    renderRanking();
  }
  root.IPDSecondaryPlots={setRanking,getRankingView,renderRanking,rankingPrerequisite,bindSurvivalZoom,schedule};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);
