/* rve-meta/alm-straight.js — approved Straight Path rules; reads current results only. */
(function(){
  'use strict';
  var APP="rve-meta";
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
// index.html:424-452; alm-live.js:16-24: refuse cleared/stale fits; independent m_clusters and already computed robust CIs.
    var r=result('__almLastRVE');if(!r||!document.querySelector('#coef-body tr'))return c;
    c.k=r.fit.m_clusters;c.estimates=r.summary.map(function(s,i){return estimate(i===0?'Intercept':'Coefficient '+i,s.ci_lo,s.ci_hi,0);});
    return c;
  }
  (window.AlmStraightAdapters=window.AlmStraightAdapters||{})[APP]={ctx:ctx};
  function start(){
    // Keep advice outside the archived analysis landmarks, beside the feature panel.
    if(!document.getElementById('alm-features')){var mount=document.createElement('div');mount.id='alm-features';mount.setAttribute('data-app',APP);document.body.appendChild(mount);}
    ['alm-features','alm-straight'].forEach(function(name){if(!document.querySelector('link[data-straight-style="'+name+'"]')){var link=document.createElement('link');link.rel='stylesheet';link.href='../shared/'+name+'.css';link.setAttribute('data-straight-style',name);document.head.appendChild(link);}});
    var handle=window.AlmStraightUI.attach({app:APP,ctx:ctx,anchor:'#alm-features',watch:["#coef-body","#meta-row"]});
    // Refresh after input handlers update the page's stale state, including attribute-only changes.
    document.addEventListener('input',function(){setTimeout(handle.refresh,0);});
    document.addEventListener('change',function(){setTimeout(handle.refresh,0);});
  }
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
})();
