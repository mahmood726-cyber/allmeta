/* Published twelve-check contract: bench/compare.py and bench/run-app.mjs.
 * Corpus replay runs the current page; no archived app results are substituted. */
(function () {
  'use strict';
  const files = [{"path": "validate/corpus/corpus.json", "sha256": "58d8fa87fdc1b83c57c3f278314a4313d047f6d332276ee3902df2f4655aabf3", "bytes": 598582}, {"path": "validate/corpus/reference.json", "sha256": "993942279a48d9244b49e6629b4aa2c08f71bdc9b9a46dea836c8f0fe6c01845", "bytes": 30221}];
  const keys = ['mu','se','ciLo','ciHi','sigma2Between','sigma2Within','logLik'];
  const repo = 'https://github.com/mahmood726-cyber/multilevel-reproducible';
  function currentState() {
    const rows = window.__almMlmaParse(document.getElementById('src').value);
    if (rows.length < 3) throw new Error('Need at least three valid effect rows');
    window.__almMlmaRun();
    const result = window.__almReml();
    if (!result || keys.some(k => !Number.isFinite(result[k]))) throw new Error('Current REML fit unavailable');
    return {rows, result};
  }
  function buildScript(state) {
    // Numeric cluster codes preserve membership and keep user text out of R code.
    const clusters = [...new Set(state.rows.map(r => r.study))];
    const vector = f => 'c(' + state.rows.map(f).join(',') + ')';
    return `yi <- ${vector(r => r.te)}
vi <- ${vector(r => r.se * r.se)}
cluster <- ${vector(r => clusters.indexOf(r.study) + 1)}
id <- seq_along(yi)
f <- metafor::rma.mv(yi, vi, random = ~ 1 | cluster/id, method = "REML", control=list(rel.tol=1e-10))
x <- c(mu=as.numeric(coef(f)),se=as.numeric(f$se),ciLo=as.numeric(f$ci.lb),ciHi=as.numeric(f$ci.ub),sigma2Between=f$sigma2[1],sigma2Within=f$sigma2[2],logLik=as.numeric(logLik(f)))
stopifnot(all(is.finite(x)))
cat('ALMJSON:{',paste(sprintf('"%s":%.17g',names(x),x),collapse=','),'}\\n',sep='')`;
  }
  function renderMatches(r) {
    const table = document.querySelectorAll('#summary table')[1];
    return !!table && keys.every(k => table.innerText.includes(r[k].toFixed(k.startsWith('sigma2') ? 4 : 3)));
  }
  async function replay(loaded, progress) {
    if (!window.alm || !alm.urlState || !alm.urlState.withoutWrites) throw new Error('URL-state replay guard unavailable');
    return alm.urlState.withoutWrites(() => replayWithoutWrites(loaded, progress));
  }
  async function replayWithoutWrites(loaded, progress) {
    const corpus=loaded[files[0].path], refs=loaded[files[1].path], names=Object.keys(corpus);
    if(names.length!==44 || Object.keys(refs).length!==names.length || names.some(n=>!Object.hasOwn(refs,n))) throw new Error('Corpus/reference configuration identifiers differ');
    let checks=0, passed=0;
    const failed=[], maxima={REML:0,shares:0,exact:0};
    function check(id,quantity,app,ref,tol,group) {
      const d=AlmValidate.compare(app,ref,'rel',tol);
      checks++;if(d.pass)passed++;else failed.push({id,quantity,app,ref,tol,...d});
      maxima[group]=Math.max(maxima[group],d.diff);
    }
    const input=document.getElementById('src'), original=input.value;
    try {
      for(const [i,name] of names.entries()) {
        const rows=corpus[name], ref=refs[name];
        if(!Array.isArray(rows) || rows.length!==ref.rows || rows.some(r=>!Number.isFinite(r.y)||!Number.isFinite(r.v)||r.v<=0||r.cluster==null||r.id==null) || new Set(rows.map(r=>r.id)).size!==rows.length) throw new Error('Invalid source rows: '+name);
        const clusters=[...new Set(rows.map(r=>r.cluster))];
        if(clusters.length!==ref.clusters)throw new Error('Cluster count differs: '+name);
        input.value=rows.map(r=>['cluster_'+clusters.indexOf(r.cluster),r.y,Math.sqrt(r.v),'row_'+r.id].join(',')).join('\n');
        const state=currentState(), r=state.result, m=window._almLastMlma();
        for(const k of keys)check(name,k,r[k],ref.values[k],1e-6,'REML');
        const w=rows.map(r=>1/r.v), sw=w.reduce((a,b)=>a+b,0), typ=(w.length-1)/(sw-w.reduce((a,b)=>a+b*b,0)/sw), den=m.tau2_study+m.tau2_within+typ;
        for(const [q,num] of [['I2_study',m.tau2_study],['I2_within',m.tau2_within],['I2_sampling',typ]])check(name,q+'_formula',m[q],num/den,1e-9,'shares');
        check(name,'UI_row_count',document.querySelectorAll('#body tr').length-1,ref.rows,0,'exact');
        check(name,'UI_REML_render',Number(renderMatches(r)),1,0,'exact');
        progress('Replaying '+(i+1)+'/44 configurations; '+checks+' checks');
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    } finally {
      input.value=original;window.__almMlmaRun();
    }
    return {checks,passed,failed,maxima,refusals:[],summaryLines:[
      '44 configurations; 12 checks each. Seven REML quantities: relative tolerance 1e-6; three MoM variance shares versus closed form: 1e-9; row count and historical rounded-value rendering contract: exact.',
      'Reference: metafor 5.2-1. Relative difference = |App-R|/max(1,|R|). MoM estimates are not compared with R.'
    ]};
  }
  const adapter={app:'multilevel-ma',paper:{checks:528,repoUrl:repo,runLabel:'Full R re-execution (one-command instructions)',runUrl:repo+'/#validate-with-one-command',codespacesUrl:'https://codespaces.new/mahmood726-cyber/multilevel-reproducible',doi:null},
    live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState,buildScript,
      appValues:s=>keys.map(key=>({key,label:key,value:s.result[key]})),compare:{tolerance:{default:1e-6},kind:Object.fromEntries(keys.map(k=>[k,'rel']))}},
    corpus:{files,run:replay}};
  window.AlmMultilevelValidationAdapter=adapter;
  window.AlmMultilevelValidation=AlmValidate.mount(document.getElementById('alm-validate'),adapter);
})();
