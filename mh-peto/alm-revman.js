(function(global){
  'use strict';
  function validate(rows){global.AlmRevmanReader.validateRecords(rows,'binary2x2');rows.forEach(r=>global.AlmRevman.label(r.study));}
  const entry={schema:'binary2x2',validate,apply(rows){
    validate(rows);
    document.getElementById('src').value=global.AlmRevmanReader.csvRows(rows.map(r=>[r.study,r.ai,r.n1i,r.ci,r.n2i]));
    document.getElementById('btn-run').click();return {ok:true,n:rows.length};
  }};
  function read(){
    const text=document.getElementById('src').value;
    const matrix=global.AlmRevmanReader.splitTable(text,text.includes('\t')?'\t':text.includes(',')?',':';');
    const numeric=s=>s.trim()!==''&&Number.isFinite(Number(s));
    if(matrix.length&&matrix[0].length>=4&&matrix[0].slice(0,5).every(s=>!numeric(s)))matrix.shift();
    return matrix.map((parts,i)=>{
      parts=parts.map(s=>s.trim());let study,counts;
      if(parts.length===5&&!(Number.isFinite(Number(parts[0]))&&!Number.isFinite(Number(parts[4])))){study=parts[0];counts=parts.slice(1);}
      else if(parts.length===4||parts.length===5){study=parts[4]||'Study '+(i+1);counts=parts.slice(0,4);}
      else throw new Error('Invalid native input row.');
      if(!counts.every(s=>/^\d+$/.test(s)))throw new Error('Invalid whole-number counts in native input.');
      return {study,ai:Number(counts[0]),n1i:Number(counts[1]),ci:Number(counts[2]),n2i:Number(counts[3]),effectMeasure:document.getElementById('measure').value};
    });
  }
  const api={entry,read};if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global.AlmFeatures&&typeof document!=='undefined')global.AlmRevman.install('mh-peto',api);
})(typeof window!=='undefined'?window:globalThis);
