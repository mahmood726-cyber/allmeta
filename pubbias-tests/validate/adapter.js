/* Paper comparator: bench/compare.py, five methods only. Each app result is
 * recomputed by the page engine; no archived app results supply these values. */
(function () {
  'use strict';
  const files = [{"path": "validate/corpus/corpus.json", "sha256": "cffcb3de27e0bbcb9b152ff684f014e745306569e1365a43346f45d00b48f00d", "bytes": 278933}, {"path": "validate/corpus/reference.json", "sha256": "bf9f4ed82527b127c96e1ef7d34abbd70b16e58e72ef02fb22aa6276f381c990", "bytes": 79793}];
  const repo = 'https://github.com/mahmood726-cyber/pubbias-reproducible';
  const methods = {
    egger_lm: ['Egger', 'egger', ['statistic', 'p', 'b0', 'limit']],
    begg: ['Begg', 'begg', ['tau', 'p']],
    trimfill: ['Trim-and-fill', 'trimfill', ['k0', 'side', 'est', 'se', 'tau2']],
    peters: ['Peters', 'peters', ['statistic', 'p']],
    harbord: ['Harbord', 'harbord', ['statistic', 'p']]
  };
  const note = 'Selection model: experimental, not validated; excluded from all checks. Thompson-Sharp is outside the paper comparison.';
  const tolerance = (method, quantity) => method === 'trimfill' && ['est', 'se', 'tau2'].includes(quantity) ? 1e-6 : quantity === 'side' ? 0 : 1e-9;
  const safe = fn => { try { return fn(); } catch (e) { return {error: e.message}; } };
  function calculate(rows, binary) {
    const E = window.__almPubBiasEngine;
    const a = {
      egger: safe(() => ({...E.eggerGeneric(rows), limit:E.wls(rows.map(r=>1/r.se),rows.map(r=>r.te/r.se),rows.map(()=>1)).b1})),
      begg: safe(() => E.beggMazumdar(rows)),
      trimfill: safe(() => ({...E.trimFill(rows), side:E.remlSlopeNeg(rows.map(r=>r.te),rows.map(r=>r.se*r.se),rows.map(r=>r.se))?'right':'left'}))
    };
    if (binary) { a.peters=safe(()=>E.petersTest(binary)); a.harbord=safe(()=>E.harbordTest(binary)); }
    return a;
  }
  function state() {
    const E=window.__almPubBiasEngine, binary=document.getElementById('format').value==='binary';
    const rows=(binary?E.parseBinary:E.parseTESE)(document.getElementById('src').value);
    if(rows.length<5 || rows.some(r=>!Number.isFinite(r.te)||!Number.isFinite(r.se)||r.se<=0)) throw new Error('Need at least five finite studies with positive standard errors.');
    return {rows,binary,note};
  }
  function values(s) {
    const a=calculate(s.rows,s.binary?s.rows:null), rows=[];
    for(const [method,[label,key,fields]] of Object.entries(methods)) {
      if(!a[key])continue;
      if(a[key].error)throw new Error(label+': '+a[key].error);
      for(const q of fields) rows.push({key:method+'_'+q,label:label+' '+q,value:a[key][q]});
    }
    return rows;
  }
  function buildScript(s) {
    const vec=x=>'c('+x.join(',')+')';
    const lines=[
      'library(metafor)',
      'y <- '+vec(s.rows.map(r=>r.te)), 'v <- '+vec(s.rows.map(r=>r.se*r.se)),
      "m <- rma(y,v,method='REML')",
      "e <- regtest(m,model='lm',predictor='sei',ret.fit=TRUE)",
      'b <- ranktest(y,vi=v)', "t <- trimfill(m,estimator='L0')",
      'out <- list(egger_lm_statistic=e$zval,egger_lm_p=e$pval,egger_lm_b0=as.numeric(coef(e$fit)[2]),egger_lm_limit=as.numeric(coef(e$fit)[1]),begg_tau=b$tau,begg_p=b$pval,trimfill_k0=t$k0,trimfill_side=t$side,trimfill_est=as.numeric(t$b),trimfill_se=t$se,trimfill_tau2=t$tau2)'
    ];
    if(s.binary) {
      lines.push('library(meta)');
      for(const key of ['e1','n1','e2','n2'])lines.push(key+' <- '+vec(s.rows.map(r=>r[key])));
      lines.push("mb <- metabin(e1,n1,e2,n2,sm='OR',method='Inverse',allstudies=TRUE)");
      for(const method of ['Peters','Harbord']) {
        const key=method.toLowerCase();
        lines.push("z <- metabias(mb,method.bias='"+method+"',k.min=3)", 'out$'+key+'_statistic <- unname(z$statistic)', 'out$'+key+'_p <- z$p.value');
      }
    }
    lines.push('encode <- function(x) { if(length(x)!=1 || is.na(x)) return("null"); if(is.character(x)) return(paste0("\\\"",x,"\\\"")); if(!is.finite(x)) return("null"); sprintf("%.17g",x) }',
      'cat("ALMJSON:{",paste(sprintf("\\\"%s\\\":%s",names(out),vapply(out,encode,"")),collapse=","),"}\\n",sep="")');
    return lines.join('\n');
  }
  async function replay(loaded, progress) {
    const corpus=loaded[files[0].path], reference=loaded[files[1].path].datasets;
    if(!Array.isArray(corpus) || corpus.length!==152 || Object.keys(reference).length!==corpus.length || new Set(corpus.map(d=>d.id)).size!==corpus.length)throw new Error('Invalid corpus/reference configuration identities');
    let checks=0,passed=0;const failed=[],maxima={},refusals=[];
    function record(id,method,q,app,ref,diff,tol,pass) {
      checks++;if(pass)passed++;
      else failed.push({id,method:methods[method][0],quantity:q,label:id+' | '+methods[method][0]+' | '+q,app,ref,diff,tol});
      const key=method+'.'+q;maxima[key]=Math.max(maxima[key]||0,diff);
    }
    for(const [i,d] of corpus.entries()) {
      const r=reference[d.id];
      if(!r || d.yi.length!==d.k || d.vi.length!==d.k || d.yi.some(v=>!Number.isFinite(v)) || d.vi.some(v=>!Number.isFinite(v)||v<=0))throw new Error('Invalid source inputs: '+d.id);
      const rows=d.yi.map((te,j)=>({te,se:Math.sqrt(d.vi[j])}));
      const binary=d.binary?window.__almPubBiasEngine.parseBinary(d.binary.map(b=>[b.e1,b.n1,b.e2,b.n2].join(',')).join('\n')):null;
      const a=calculate(rows,binary);
      for(const [method,[,key,fields]] of Object.entries(methods)) {
        if(!d.binary && ['peters','harbord'].includes(method))continue;
        if(!r[method] || !r[method].value)throw new Error('Missing reference: '+d.id+'/'+method);
        let rv=r[method].value; const av=a[key] || {error:'null result'};
        if(['peters','harbord'].includes(method)&&!rv.error&&rv.statistic==null&&rv.p==null)rv={error:'meta::metabias returned no statistic or p-value (insufficient informative rows)'};
        if(rv.error || av.error) {
          const pass=!!(rv.error&&av.error&&!rv.unavailable&&!av.unavailable);
          record(d.id,method,'refusal',JSON.stringify(av),JSON.stringify(rv),pass?0:1,0,pass);
          refusals.push({id:d.id,method,pass});continue;
        }
        for(const q of fields) {
          const tol=tolerance(method,q);
          const c=q==='side'?{diff:av[q]===rv[q]?0:1,pass:typeof av[q]==='string'&&av[q]===rv[q]}:AlmValidate.compare(av[q],rv[q],q==='p'?'abs':'rel',tol);
          record(d.id,method,q,av[q],rv[q],c.diff,tol,c.pass);
        }
      }
      progress('Replaying '+(i+1)+'/'+corpus.length+' configurations; '+checks+' checks');
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    return {checks,passed,failed,maxima,refusals,summaryLines:[corpus.length+' configurations; five validated methods. Below k=5 configurations are engine checks, not successful page analyses.',note,'Paper reference: metafor 5.2-1; meta 8.5-0. Six published exceptions remain FAIL; no exception is converted to PASS.']};
  }
  const tol={default:1e-9},kind={};
  for(const [method,[,,fields]] of Object.entries(methods))for(const q of fields){const key=method+'_'+q;tol[key]=tolerance(method,q);kind[key]=q==='side'?'exact':q==='p'?'abs':'rel';}
  const adapter={app:'pubbias-tests',paper:{checks:2113,repoUrl:repo,runUrl:repo+'/actions',codespacesUrl:'https://codespaces.new/mahmood726-cyber/pubbias-reproducible'},
    live:{packages:['metafor','meta'],paperVersions:{metafor:'5.2-1',meta:'8.5-0'},currentState:state,appValues:values,buildScript,compare:{tolerance:tol,kind}},
    corpus:{files,run:replay}};
  window.AlmPubbiasValidationAdapter=adapter;
  window.AlmPubbiasValidation=AlmValidate.mount(document.getElementById('alm-validate'),adapter);
})();
