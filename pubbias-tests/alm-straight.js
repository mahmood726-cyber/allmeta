/* pubbias-tests/alm-straight.js — approved Straight Path rules; reads current results only. */
(function(){
  'use strict';
  var APP="pubbias-tests";
  function result(name){return typeof window[name]==='function'?window[name]():null;}
  function numbers(s){return (String(s||'').replace(/−/g,'-').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)||[]).map(Number);}
  function bounds(s){var m=String(s||'').match(/\[([^\]]+)\]/);return m?numbers(m[1]):[];}
  function estimate(label,lo,hi,nullValue,piLo,piHi){return {label:label,lo:lo,hi:hi,nullValue:nullValue,piLo:piLo,piHi:piHi};}
  function tableEstimates(selector,col,nul){return Array.from(document.querySelectorAll(selector)).map(function(tr){var b=bounds(tr.cells[col].textContent);return estimate(tr.cells[0].textContent,b[0],b[1],nul);});}
  var observedPlus,plusMain,invalidPlus;
  function plusSnapshot(){return window.AlmPubbiasPlusUI && window.AlmPubbiasPlusUI.snapshot();}
  // plus-ui retains its snapshot when input changes or the main table runs alone.
  // Capture invalidation before the page handlers; an optional run creates a NEW snapshot.
  function invalidatePlus(){invalidPlus=plusSnapshot();}
  function ctx(){
    var c={app:APP,analysisType:'pairwise'};
    // Existing page lifecycle marks retained results stale until the next successful analysis.
    var stale=document.getElementById('analysis-stale')||document.getElementById('stale-note');
    if(stale&&!stale.hidden)return c;
    // index.html:718-725,768-788,864: the main cache is null below five studies.
    var r=result('_almLastPubbias');
    if(r){c.k=r.k;c.smallStudyTest={name:'Egger',shown:Number.isFinite(r.egger_p),p:r.egger_p};}
    else {
      var body=document.getElementById('body');
      var count=body && body.textContent.match(/Current k = (\d+)\./);
      if(count)c.k=Number(count[1]);
    }
    // plus-ui.js:44-65,143-160,190: optional results have their own count and CI,
    // even when the main table is suppressed. Egger is displayed in the LOO full row.
    var p=plusSnapshot();
    if(p!==observedPlus){observedPlus=p;plusMain=r;}
    if(p && p!==invalidPlus && plusMain===r){
      c.k=p.result.k===undefined?c.k:p.result.k;
      var v=p.result.full.conditional;
      if(v && v.status==='ok')c.estimates=[estimate('Conditional PET-PEESE',v.values.ciLo,v.values.ciHi,0)];
      var loo=p.result.loo;
      var fullRow=loo && loo.status==='ok' && loo.values.rows.find(function(row){return row.omit===null;});
      var egger=fullRow && fullRow.egger;
      if(p.result.loo && p.result.loo.status==='ok' && egger && egger.status==='ok' && Number.isFinite(egger.values.p))
        c.smallStudyTest={name:'Egger',shown:true,p:egger.values.p};
    }
    return c;
  }
  (window.AlmStraightAdapters=window.AlmStraightAdapters||{})[APP]={ctx:ctx};
  function start(){
    ['input','change'].forEach(function(type){document.addEventListener(type,function(e){if(e.target && (e.target.id==='src'||e.target.id==='format'))invalidatePlus();},true);});
    document.addEventListener('click',function(e){if(e.target && e.target.id==='btn-run')invalidatePlus();},true);
    // Keep advice outside the archived analysis landmarks, beside the feature panel.
    if(!document.getElementById('alm-features')){var mount=document.createElement('div');mount.id='alm-features';mount.setAttribute('data-app',APP);document.body.appendChild(mount);}
    ['alm-features','alm-straight'].forEach(function(name){if(!document.querySelector('link[data-straight-style="'+name+'"]')){var link=document.createElement('link');link.rel='stylesheet';link.href='../shared/'+name+'.css';link.setAttribute('data-straight-style',name);document.head.appendChild(link);}});
    var handle=window.AlmStraightUI.attach({app:APP,ctx:ctx,anchor:'#alm-features',watch:["#body","#plus-pp-body"]});
    // Refresh after input handlers update the page's stale state, including attribute-only changes.
    document.addEventListener('input',function(){setTimeout(handle.refresh,0);});
    document.addEventListener('change',function(){setTimeout(handle.refresh,0);});
  }
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
})();
