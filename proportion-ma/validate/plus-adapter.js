(function () {
  'use strict';
  const C=AlmPropPlusCore, U=AlmPropPlus, files=AlmPropPlusPins.files;
  async function replay(loaded,progress=()=>{}) {
    const corpus=loaded['validate/plus-corpus/corpus.json'], refs=loaded['validate/plus-corpus/reference-plus.json'];
    if(corpus.length!==240 || Object.keys(refs).length!==240 || new Set(corpus.map(c=>c.id)).size!==240 || corpus.some(c=>!Object.hasOwn(refs,c.id))) throw new Error('GLMM corpus configuration mismatch');
    const saved=U.save(),runButton=document.getElementById('plus-run');
    if(runButton.disabled)throw new Error('Wait for the current GLMM fit');
    runButton.disabled=true;
    let checks=0,passed=0;const failed=[],refusals=[];
    function check(id,key,a,b,exact=false) {checks++;const pass=exact?a===b:C.close(a,b,key);if(pass)passed++;else failed.push({id,quantity:key,app:a,ref:b});}
    try {
      for(const ca of corpus) {
        C.validateRows(ca.rows);
        const pair=refs[ca.id],a=C.flat(pair.metafor),b=C.flat(pair.meta);
        U.render(pair.metafor,null,'Pinned native R corpus replay: '+ca.id,U.signature(),ca.rows);
        document.getElementById('plus-export').disabled=true;
        const shown=U.display(),exported=JSON.parse(U.exported()),output=C.flat(exported.result);
        if(JSON.stringify(exported.validation)!==JSON.stringify(AlmPropPlusParity.assess(ca.rows)))throw new Error('GLMM export validation label differs');
        // Both key sets must agree; missing quantities never silently pass.
        if(JSON.stringify(Object.keys(a))!==JSON.stringify(Object.keys(b))) throw new Error('Reference field mismatch: '+ca.id);
        for(const key of Object.keys(b)) {
          check(ca.id,key,a[key],b[key]);
          // Display is tested against metafor's exact formatted value; numeric parity
          // with meta is checked separately (rounding boundaries must not fail).
          check(ca.id,'display_'+key,shown[key],C.format(a[key]),true);
          check(ca.id,key,output[key],b[key]);
        }
        check(ca.id,'labels',U.labelsOK(pair.metafor),true,true);
        check(ca.id,'export_inputs',JSON.stringify(exported.inputs),JSON.stringify(ca.rows),true);
        check(ca.id,'provenance',exported.method==='Binomial-normal GLMM' && exported.source==='Pinned native R corpus replay: '+ca.id && document.getElementById('plus-provenance').textContent===exported.source,true,true);
        if(a.status==='refused')refusals.push(ca.id);
        if(checks%100<30) {progress('Replaying GLMM presentation and export: '+passed+'/'+checks);await new Promise(r=>setTimeout(r,0));}
      }
    } finally {U.restore(saved);runButton.disabled=false;}
    return {checks,passed,failed,refusals,maxima:{},summaryLines:['Pinned native metafor versus meta results; every status, refusal, numerical field, displayed field and JSON result checked. This offline tier replays archived fits; it does not rerun the optimiser. No GLMM plot is drawn.']};
  }
  const adapter={app:'proportion-ma-plus',paper:{checks:7248,repoUrl:'https://github.com/mahmood726-cyber/proportion-reproducible'},
    live:{packages:['metafor','lme4'],paperVersions:{metafor:'5.2-1',lme4:'2.0-6'},
      currentState:()=>({...U.audit(),rows:C.parse(document.getElementById('src').value)}),
      buildScript:s=>C.buildScript(s.rows),appValues:s=>Object.entries(C.flat(s.result)).map(([key,value])=>({key,label:key,value})),
      compare:{tolerance:{default:1e-6,k:0,status:0,reason:0},kind:{status:'exact',reason:'exact',k:'exact',...Object.fromEntries(C.fields.filter(k=>k!=='k').map(k=>[k,'rel']))}}},
    corpus:{files,run:replay}};
  window.AlmPropPlusAdapter=adapter;
  window.AlmPropPlusValidation=AlmValidate.mount(document.getElementById('alm-validate-plus'),adapter);
  document.querySelector('#alm-validate-plus h2').textContent='Validate the extras in R';
  const buttons=document.querySelectorAll('#alm-validate-plus button');
  buttons[0].textContent='Validate current GLMM in R';
  buttons[1].textContent='Replay GLMM corpus';
})();
