(function(global){
  'use strict';
  const A=global.AlmRevman||(typeof require==='function'?require('../shared/alm-revman.js'):null);
  const R=()=>global.RevmanReader;
  function validate(rows){
    R().validateRecords(rows,'generic');
    rows.forEach(r=>{
      A.label(r.study);
      if(r.study.trim().startsWith('#'))throw new Error('Study name would be interpreted as a native input comment.');
      if(r.year!=null&&!Number.isInteger(r.year))throw new Error('This app requires a numeric year; a year suffix cannot be preserved.');
    });
  }
  const entry={schema:'generic',validate,apply(rows){
    validate(rows);
    const matrix=rows.map(r=>[r.study,r.yi,r.sei,r.year==null?'':r.year,r.provenance&&r.provenance.choice?r.provenance.choice.subgroup:(r.subgroup||'')]);
    const el=document.getElementById('f-data');el.value=R().csvRows(matrix);el.dispatchEvent(new Event('input',{bubbles:true}));
    return {ok:true,n:rows.length};
  }};
  function read(){
    const text=document.getElementById('f-data').value;
    const matrix=R().splitTable(text,text.split('\n').find(l=>l.trim()&&!l.trim().startsWith('#'))?.includes('\t')?'\t':',');
    const rows=[];
    matrix.forEach((p,i)=>{
      if(p[0].trim().startsWith('#'))return;
      if(i<3&&!rows.length&&/^(label|study)$/i.test(p[0].trim())&&/^(est|estimate|effect|yi|logOR)$/i.test(p[1]?.trim()||'')&&/^se$/i.test(p[2]?.trim()||''))return;
      if(p.length<3||p.length>5)throw new Error('Invalid native input columns.');
      let year=null,subgroup='';
      if(p.length===4){if(/^[12]\d{3}$/.test(p[3].trim()))year=Number(p[3]);else if(/^\d/.test(p[3].trim()))throw new Error('Invalid native study year.');else subgroup=p[3];}
      if(p.length===5){if(p[3].trim()){if(!/^[12]\d{3}$/.test(p[3].trim()))throw new Error('Invalid native study year.');year=Number(p[3]);}subgroup=p[4];}
      rows.push({study:p[0],yi:A.nativeNumber(p[1]),sei:A.nativeNumber(p[2]),year,subgroup});
    });
    return R().validateRecords(rows,'generic');
  }
  const api={entry,read,note:'Imports the selected subgroup only. Source years and subgroup names are passed to the native cumulative/subgroup input; no years or additional groups are inferred.'};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global.AlmFeatures&&typeof document!=='undefined')A.install('cumulative-subgroup',api);
})(typeof window!=='undefined'?window:globalThis);
