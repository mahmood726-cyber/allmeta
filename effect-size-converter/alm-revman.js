(function(global){
  'use strict';
  const nativeFields=['m1','sd1','n1','m2','sd2','n2'];
  function validate(rows){
    global.AlmRevmanReader.validateRecords(rows,'continuous');
    if(rows.length!==1)throw new Error('This converter accepts one study at a time.');
    rows.forEach(r=>global.AlmRevman.label(r.study));
  }
  const entry={schema:'continuous',maxRows:1,validate,apply(rows){
    validate(rows);
    const r=rows[0],s=global.AlmEffectAccuracy.fromMeans(r.m1i,r.sd1i,r.n1i,r.m2i,r.sd2i,r.n2i);
    if(!Number.isFinite(s.g)||!Number.isFinite(s.se)||!Number.isFinite(s.pooledSd))throw new Error('Invalid continuous input: numerical overflow.');
    const text=global.AlmRevmanReader.csvRows([nativeFields,global.AlmRevmanReader.fields.continuous.map(f=>rows[0][f])]);
    document.querySelector('#alm-csv-mount textarea').value=text;
    document.querySelector('#alm-csv-mount [data-action="parse-paste"]').click();
    return {ok:true,n:rows.length};
  }};
  function read(){
    const matrix=global.AlmRevmanReader.splitTable(document.querySelector('#alm-csv-mount textarea').value);
    if(matrix.length!==2||matrix[0].join(',')!==nativeFields.join(',')||matrix[1].length!==6)throw new Error('Export requires one current means/SD study in the native CSV input.');
    if(matrix[1].some(v=>!v.trim()))throw new Error('Missing continuous input.');
    const saved=global.AlmFeaturesState&&global.AlmFeaturesState.revman;
    const r={study:saved&&saved.records.length===1?saved.records[0].study:'Study 1',effectMeasure:'SMD'};
    global.AlmRevmanReader.fields.continuous.forEach((f,i)=>r[f]=global.AlmRevman.nativeNumber(matrix[1][i]));
    global.AlmRevmanReader.validateRecords([r],'continuous');
    const s=global.AlmEffectAccuracy.fromMeans(r.m1i,r.sd1i,r.n1i,r.m2i,r.sd2i,r.n2i);
    if(document.getElementById('in-type').value!=='SMD'||document.getElementById('in-smd-kind').value!=='g'||Number(document.getElementById('in-est').value)!==s.g||Number(document.getElementById('in-se').value)!==s.se)throw new Error('Current estimate no longer matches the means/SD input. Parse the current means/SD row before exporting.');
    return [r];
  }
  const api={entry,read,note:'This converter accepts one study and computes Hedges g from its means and SDs. Export uses the current native means/SD row.'};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global.AlmFeatures&&typeof document!=='undefined')global.AlmRevman.install('effect-size-converter',api);
})(typeof window!=='undefined'?window:globalThis);
