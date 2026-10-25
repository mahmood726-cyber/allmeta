(function(global){
  'use strict';
  function validate(rows){
    global.AlmRevmanReader.validateRecords(rows,'generic');
    rows.forEach(r=>{global.AlmRevman.label(r.study);if(/[,#]/.test(r.study))throw new Error('Study name contains a comma or # that the native input cannot preserve.');});
  }
  const entry={schema:'generic',validate,apply(rows){
    validate(rows);
    document.getElementById('f-data').value=rows.map(r=>[r.study,r.yi,r.sei].join('\t')).join('\n');
    document.getElementById('btn-run').click();return {ok:true,n:rows.length};
  }};
  function read(){
    const lines=document.getElementById('f-data').value.split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#'));
    return lines.filter((l,i)=>!(i===0&&/[,\t]\s*(yi|est|effect|estimate)\s*[,\t]\s*(se|sei|standard[ _-]?error)\s*$/i.test(l))).map(l=>{
      const parts=l.trim().split(/\s*[,\t]\s*/),se=parts.pop(),yi=parts.pop(),study=parts.join(', ');
      const numeric=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
      if(!study||!numeric.test(yi||'')||!numeric.test(se||''))throw new Error('Invalid numeric native input row.');
      return {study,yi:Number(yi),sei:Number(se)};
    });
  }
  const api={entry,read};if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global.AlmFeatures&&typeof document!=='undefined')global.AlmRevman.install('heterogeneity',api);
})(typeof window!=='undefined'?window:globalThis);
