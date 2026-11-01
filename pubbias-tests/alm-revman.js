(function(global){
  'use strict';
  const A=global.AlmRevman||(typeof require==='function'?require('../shared/alm-revman.js'):null);
  const R=()=>global.AlmRevmanReader;
  let imported=false;
  function schema(){
    const format=document.getElementById('format').value;
    if(!['binary','te-se'].includes(format))throw new Error('Choose a native data format before importing.');
    return format==='binary'?'binary2x2':'generic';
  }
  function validate(rows){
    R().validateRecords(rows,schema());
    if(rows.length<5)throw new Error('This app requires at least 5 study rows for its tests.');
    rows.forEach(r=>{
      A.label(r.study);
      if(r.study!==r.study.trim()||/[,;\t]/.test(r.study)||/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(r.study))throw new Error('Study name is numeric or contains a delimiter that the native input cannot preserve.');
    });
  }
  const entry={get schema(){return schema();},validate,apply(rows){
    validate(rows);const fields=R().fields[schema()];
    document.getElementById('src').value=rows.map(r=>[r.study,...fields.map(f=>r[f])].join('\t')).join('\n');
    document.getElementById('btn-run').click();imported=true;return {ok:true,n:rows.length};
  }};
  function read(){
    const s=schema(),fields=R().fields[s],rows=[];
    document.getElementById('src').value.split(/\r?\n/).forEach(line=>{
      if(!line.trim())return;
      const p=(/[,;\t]/.test(line)?line.trim().split(/\s*[,;\t]\s*/):line.trim().split(/\s+/));
      let study='Study '+(rows.length+1);
      if(p.length===fields.length+1&&!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(p[0]))study=p.shift();
      if(p.length!==fields.length)throw new Error('Invalid native input columns for '+s+'.');
      const r={study};fields.forEach((f,i)=>r[f]=A.nativeNumber(p[i]));rows.push(r);
    });
    return R().validateRecords(rows,s);
  }
  const api={entry,read,schemaControl:'format',note:'Choose the app data format first: effect + SE for generic IV, or binary for events/totals. At least five studies are required by the native tests.'};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global.AlmFeatures&&typeof document!=='undefined'){
    A.install('pubbias-tests',api);
    document.getElementById('format').addEventListener('change',event=>{
      if(!imported)return;
      // The native format handler replaces #src with example data before running.
      // Once rows are imported, format changes must reinterpret the CURRENT input,
      // including edits or a cleared textarea. Capture prevents even a transient
      // example analysis/URL write; the native Run action reports incompatible data.
      event.stopImmediatePropagation();
      const effect=document.getElementById('alm-revman-effect');
      if(effect)effect.disabled=schema()!=='generic';
      document.getElementById('btn-run').click();
    },true);
  }
})(typeof window!=='undefined'?window:globalThis);
