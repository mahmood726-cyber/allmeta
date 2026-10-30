/* nma/alm-straight.js — approved Straight Path rules; reads current results only. */
(function(){
  'use strict';
  var APP="nma";
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
// index.html:580-620: read the rendered selected-model reference CIs and between-designs test, never call __almNmaCompute.
    c.analysisType='network';if(!document.querySelector('#ref-host tbody tr'))return c;
    var scale=document.getElementById('f-scale');var nul=scale&&scale.value==='exp'?1:0;
    c.estimates=[];document.querySelectorAll('#ref-host tbody tr').forEach(function(tr){var v=numbers(tr.cells[1].textContent);c.estimates.push(estimate(tr.cells[0].textContent,v[1],v[2],nul));});
    c.inconsistencyTests=[];document.querySelectorAll('#het-host tr').forEach(function(tr){
      if(tr.textContent.indexOf('Between designs')!==-1){var m=tr.textContent.match(/p\s*([=<])\s*([.\d]+)/);if(m)c.inconsistencyTests.push({label:'Between designs',p:Number(m[2])});}
    });
    // index.html:278-316: input is five-column CSV; count distinct study IDs per unordered comparison (multi-arm safe).
    var input=document.getElementById('f-data'),per={};
    if(input)input.value.split(/\r?\n/).forEach(function(line){
      if(!line.trim()||/^\s*#/.test(line))return;
      var cells=[],cell='',quoted=false;
      for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){cells.push(cell.trim());cell='';}else cell+=ch;}cells.push(cell.trim());
      if(quoted||cells.length!==5||!cells[3]||!Number.isFinite(Number(cells[3]))||!(Number(cells[4])>0))return;
      var key=JSON.stringify(cells.slice(1,3).sort());(per[key]||(per[key]=new Set())).add(cells[0]);
    });
    var counts=Object.keys(per).map(function(key){return per[key].size;});if(counts.length)c.minPerComparison=Math.min.apply(null,counts);
    return c;
  }
  (window.AlmStraightAdapters=window.AlmStraightAdapters||{})[APP]={ctx:ctx};
  function start(){
    // Keep advice outside the archived analysis landmarks, beside the feature panel.
    if(!document.getElementById('alm-features')){var mount=document.createElement('div');mount.id='alm-features';mount.setAttribute('data-app',APP);document.body.appendChild(mount);}
    ['alm-features','alm-straight'].forEach(function(name){if(!document.querySelector('link[data-straight-style="'+name+'"]')){var link=document.createElement('link');link.rel='stylesheet';link.href='../shared/'+name+'.css';link.setAttribute('data-straight-style',name);document.head.appendChild(link);}});
    var handle=window.AlmStraightUI.attach({app:APP,ctx:ctx,anchor:'#alm-features',watch:["#ref-host","#het-host"]});
    // Refresh after input handlers update the page's stale state, including attribute-only changes.
    document.addEventListener('input',function(){setTimeout(handle.refresh,0);});
    document.addEventListener('change',function(){setTimeout(handle.refresh,0);});
  }
  if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
})();
