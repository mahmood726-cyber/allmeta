/* Full primary contract from the archived bench/compare.py. */
(function () {
  'use strict';
  const files = [{"path": "validate/corpus/corpus.json", "sha256": "23bf51d1343e49fdcbd08ed612844f25418767ed5b9a9a5af43adddbf792e249", "bytes": 263440, "source_sha256": "d008f48ecbd8b4e1740715ced75a5f6f241d0caa97b7b6396991b88bb23ebbe6"}, {"path": "validate/corpus/reference.json", "sha256": "1e0f22fc0bfe2ad7eda7b6bf9443fa2c5d7901ddb0e8360296e94392a4b6c57c", "bytes": 7196578, "source_sha256": "f0c18a50a962a46d0b6760f780e38522694810623fd258d07fa023bd89d67b18"}];
  const keys = ['mu_re','seRE','tau2','Q','df','i2','k','lo','hi','piLo','piHi','poolP','poolLo','poolHi','poolPiLo','poolPiHi'];
  const repo='https://github.com/mahmood726-cyber/proportion-reproducible';
  const api=window.__almPropValidation;
  function tolerance(q,method) { return method==='PM' && !['Q','df','i2','k'].includes(q) ? 1e-6 : 1e-9; }
  function currentState() {
    const rows=api.parse(document.getElementById('src').value);
    const tr=document.getElementById('trans').value, method=document.getElementById('tau-est').value;
    if(rows.length<2)throw new Error('Need at least 2 studies.');
    if(!['logit','ft','raw'].includes(tr)||!['PM','DL','FE'].includes(method))throw new Error('Unsupported transform or estimator');
    api.run();const result=api.snapshot();
    if(!result)throw new Error('Current fit unavailable');
    for(const q of keys)adapter.live.compare.tolerance[q]=tolerance(q,method);
    return {rows,tr,method,result};
  }
  function buildScript(s) {
    const v=f=>'c('+s.rows.map(f).join(',')+')';
    return `x <- ${v(r=>r.x)}
n <- ${v(r=>r.n)}
k <- length(x)
es <- metafor::escalc(measure="${{logit:'PLO',ft:'PFT',raw:'PR'}[s.tr]}",xi=x,ni=n,add=${s.tr==='ft'?'0':'.5'},to="only0")
f <- metafor::rma(es$yi,es$vi,method="${s.method}",test="z",control=list(threshold=1e-12,tol=1e-18,maxiter=10000))
p <- predict(f)
pi <- if(k>=3) as.numeric(coef(f))+c(-1,1)*qt(.975,k-1)*sqrt(f$tau2+f$se^2) else c(NA,NA)
back <- ${s.tr==='logit'?'metafor::transf.ilogit':s.tr==='ft'?'function(z) metafor::transf.ipft.hm(z,targs=list(ni=n))':'function(z) pmin(1,pmax(0,z))'}
b <- predict(f,transf=back)
z <- c(mu_re=as.numeric(coef(f)),seRE=as.numeric(f$se),tau2=f$tau2,Q=f$QE,df=k-1,i2=if(f$QE>k-1)100*(f$QE-(k-1))/f$QE else 0,k=k,lo=p$ci.lb,hi=p$ci.ub,piLo=pi[1],piHi=pi[2],poolP=b$pred,poolLo=b$ci.lb,poolHi=b$ci.ub,poolPiLo=if(k>=3)back(pi[1]) else NA_real_,poolPiHi=if(k>=3)back(pi[2]) else NA_real_)
cat('ALMJSON:{',paste(sprintf('"%s":%s',names(z),ifelse(is.na(z),'null',sprintf('%.17g',z))),collapse=','),'}\\n',sep='')`;
  }
  function display() {
    // This adapter has element-specific text contracts, not a whole-page scan.
    // Exclude the independent extras just as whole-page adapters exclude them.
    const original = selector => [...document.querySelectorAll(selector)].filter(e=>!e.closest('#alm-plus'));
    return {rows:original('#res-body tr').length,forest:original('#forest polygon').length,
      pooled:original('.pooled-row')[0]?.innerText || '',heterogeneity:original('#het')[0].innerText};
  }
  async function replay(loaded,progress) {
    const corpus=loaded[files[0].path],refs=loaded[files[1].path];
    const names=corpus.flatMap(c=>['logit','ft','raw'].flatMap(t=>['PM','DL','FE'].map(m=>c.id+'|'+t+'|'+m)));
    if(names.length!==2160||new Set(names).size!==2160||Object.keys(refs).length!==2160||names.some(n=>!Object.hasOwn(refs,n)))throw new Error('Corpus configuration mismatch');
    const inputs=['src','trans','tau-est'].map(id=>[document.getElementById(id),document.getElementById(id).value]);
    const dom=['res-body','het','forest','k-warn','forest-axis-error'].map(id=>{const e=document.getElementById(id);return [e,e.innerHTML,[...e.attributes].map(a=>[a.name,a.value])];});
    const saved=api.save();let checks=0,passed=0,count=0;
    const failed=[],maxima={},refusals=[];
    function check(id,quantity,app,ref,tol) {
      const d=AlmValidate.compare(app,ref,'rel',tol);checks++;if(d.pass)passed++;else failed.push({id,quantity,app,ref,tol,...d});
      maxima[quantity]=Math.max(maxima[quantity]||0,d.diff);
    }
    const pct=z=>(100*z).toFixed(1)+'%';
    const percents=s=>s.match(/[-+]?\d+\.\d+%/g)||[];
    try {
      for(const ca of corpus)for(const tr of ['logit','ft','raw'])for(const method of ['PM','DL','FE']) {
        const id=ca.id+'|'+tr+'|'+method,r=refs[id];
        if(!Array.isArray(ca.rows)||ca.rows.some(x=>!Number.isInteger(x.x)||!Number.isInteger(x.n)||x.n<=0||x.x<0||x.x>x.n))throw new Error('Invalid counts: '+id);
        inputs[0][0].value=ca.rows.map((r,i)=>[r.x,r.n,'row_'+i].join(',')).join('\n');
        inputs[1][0].value=tr;inputs[2][0].value=method;
        api.run({corpus:true});const a=api.snapshot(),status=a?'ok':'refused';
        check(id,'status',Number(status===r.status),1,0);
        if(status==='refused')refusals.push(id);
        if(a&&r.status==='ok') {
          if(Object.keys(r.values).length!==keys.length||keys.some(q=>!Object.hasOwn(r.values,q)))throw new Error('Reference quantities mismatch');
          for(const q of keys)check(id,q,a.values[q],r.values[q],tolerance(q,method));
          for(const q of ['yi','vi']) {
            if(a[q].length!==r[q].length)throw new Error('Transformed row count differs');
            r[q].forEach((b,i)=>check(id+'#'+(i+1),q,a[q][i],b,1e-9));
          }
          if(a.studies.length!==r.studies.length)throw new Error('Study count differs');
          r.studies.forEach((rr,i)=>{for(const q of ['lo','hi','rel','p'])check(id+'#'+(i+1),'study_'+q,a.studies[i][q],rr[q],q==='rel'&&method==='PM'?1e-6:1e-9);});
          const d=display();
          check(id,'ui_row_count',d.rows,r.values.k+1,0);check(id,'ui_forest_diamond',d.forest,1,0);
          check(id,'ui_pooled_text',Number(JSON.stringify(percents(d.pooled))===JSON.stringify(['poolP','poolLo','poolHi'].map(q=>pct(r.values[q])))),1,0);
          const pi=d.heterogeneity.match(/prediction interval = (.*)/);
          check(id,'ui_prediction_text',Number(JSON.stringify(pi?percents(pi[1]):[])===JSON.stringify(r.values.poolPiLo===null?[]:['poolPiLo','poolPiHi'].map(q=>pct(r.values[q])))),1,0);
        }
        count++;if(count%18===0){progress('Replaying '+count+'/2160 configurations; '+passed+'/'+checks+' passed');await new Promise(r=>setTimeout(r,0));}
      }
    } finally {
      inputs.forEach(([e,v])=>{e.value=v;});
      dom.forEach(([e,html,attrs])=>{e.innerHTML=html;[...e.attributes].forEach(a=>e.removeAttribute(a.name));attrs.forEach(([n,v])=>e.setAttribute(n,v));});
      api.restore(saved);
    }
    return {checks,passed,failed,maxima,refusals,summaryLines:['All 2160 configurations: status, 16 pooled quantities, every yi/vi and per-study proportion/Clopper-Pearson CI/weight, plus four DOM checks. Full 298116-check primary contract; no sampled subset.','Reference metafor 5.2-1; closed form 1e-9, PM-dependent quantities 1e-6; |App-R|/max(1,|R|). URL writes suppressed; inputs, results and rendered output restored.']};
  }
  const adapter={app:'proportion-ma',paper:{checks:298116,repoUrl:repo,runUrl:repo+'/#validate-with-one-command',codespacesUrl:'https://codespaces.new/mahmood726-cyber/proportion-reproducible',doi:null},
    live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState,buildScript,appValues:s=>keys.map(key=>({key,label:key,value:s.result.values[key]})),compare:{tolerance:{default:1e-9},kind:Object.fromEntries(keys.map(k=>[k,'rel']))}},corpus:{files,run:replay}};
  window.AlmProportionValidationAdapter=adapter;
  window.AlmProportionValidation=AlmValidate.mount(document.getElementById('alm-validate'),adapter);
  // This worktree's shared widget predates runLabel; leave the shared file untouched.
  const link=document.querySelector('#alm-validate a[href="'+adapter.paper.runUrl+'"]');
  if(link)link.textContent='Full R re-execution (one-command instructions)';
})();
