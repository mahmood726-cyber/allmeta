/* limit-ma/alm-straight.js — approved Straight Path rules; reads current results only. */
(function(){
  'use strict';
  var APP="limit-ma";
  function result(name){return typeof window[name]==='function'?window[name]():null;}
  function numbers(s){return (String(s||'').replace(/−/g,'-').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)||[]).map(Number);}
  function bounds(s){var m=String(s||'').match(/\[([^\]]+)\]/);return m?numbers(m[1]):[];}
  function estimate(label,lo,hi,nullValue,piLo,piHi){return {label:label,lo:lo,hi:hi,nullValue:nullValue,piLo:piLo,piHi:piHi};}
  function tableEstimates(selector,col,nul){return Array.from(document.querySelectorAll(selector)).map(function(tr){var b=bounds(tr.cells[col].textContent);return estimate(tr.cells[0].textContent,b[0],b[1],nul);});}
  var observedPlus,plusMain;
  function ctx(){
    var c={app:APP,analysisType:'pairwise'};
    // Existing page lifecycle marks retained results stale until the next successful analysis.
    var stale=document.getElementById('analysis-stale')||document.getElementById('stale-note');
    if(stale&&!stale.hidden)return c;
// index.html:370-400,424-426,677: DL comparison and primary Rücker limit estimate, both normal CIs.
    var r=result('_almLastLimit');if(!r)return c;
    c.k=r.k;c.randomEffects=true;c.estimator='DL';c.hksj=false;
    c.estimates=[estimate('Limit (Rücker)',r.limit_ci_lo,r.limit_ci_hi,0),estimate('Random effects (DL)',r.re_ci_lo,r.re_ci_hi,0)];
    // plus-ui.js:10-32,91-99: Egger is shown only after comparisons; ignore a previous input's result.
    var p=window.AlmLimitPlusUI && window.AlmLimitPlusUI.snapshot();
    var e=p && p.limit===r && p.results.Egger;
    c.smallStudyTest={name:'Egger',shown:!!(e && e.status==='ok'),p:e && e.values && e.values.p};
    return c;
  }
  (window.AlmStraightAdapters=window.AlmStraightAdapters||{})[APP]={ctx:ctx};
  function start(){
    // Keep advice outside the archived analysis landmarks, beside the feature panel.
    if(!document.getElementById('alm-features')){var mount=document.createElement('div');mount.id='alm-features';mount.setAttribute('data-app',APP);document.body.appendChild(mount);}
    ['alm-features','alm-straight'].forEach(function(name){if(!document.querySelector('link[data-straight-style="'+name+'"]')){var link=document.createElement('link');link.rel='stylesheet';link.href='../shared/'+name+'.css';link.setAttribute('data-straight-style',name);document.head.appendChild(link);}});
    var handle=window.AlmStraightUI.attach({app:APP,ctx:ctx,anchor:'#alm-features',watch:["#body","#plus-details"]});
    // Refresh after input handlers update the page's stale state, including attribute-only changes.
    document.addEventListener('input',function(){setTimeout(handle.refresh,0);});
    document.addEventListener('change',function(){setTimeout(handle.refresh,0);});
  }
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
})();
