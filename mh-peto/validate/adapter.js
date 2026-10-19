/* Port of the final paper bench/compare.py contract, using the current page. */
(function () {
  'use strict';
  const files = [{"path": "validate/corpus/corpus.json", "sha256": "53bd35b24c11be3acd09bb468af1b35037f3eb4f0c24ad9fd6a4914b2de27f86", "bytes": 193649}, {"path": "validate/corpus/reference.json", "sha256": "948b127ccbd7394e05583be836cba2ecac43659634c8c709f41c885630146bef", "bytes": 1869024}, {"path": "validate/corpus/fragility-reference.json", "sha256": "cd0ff38e2f2e8f6a62080bf8dc914514fd9b7bb56185b4f4abe47fb5312a534a", "bytes": 164441}];
  const Z = 1.959963984540054;
  const scalar = x => x === null || (typeof x === 'number' && Number.isFinite(x));
  const finite = x => typeof x === 'number' && Number.isFinite(x) ? x : NaN;
  function keyed(xs, expected, key='id') {
    if(!Array.isArray(xs) || xs.some(x=>!x || typeof x!=='object' || Array.isArray(x) || !Object.hasOwn(x,key) || typeof x[key]!=='string' || !x[key]))throw new Error('Invalid record key: '+key);
    const ids=xs.map(x=>x[key]);
    if(new Set(ids).size!==ids.length)throw new Error('Duplicate record identifiers: '+key);
    if(expected && (ids.length!==expected.length || ids.some(id=>!expected.includes(id))))throw new Error('Record cardinality/identifier mismatch: '+key);
    return new Map(xs.map(x=>[x[key],x]));
  }
  function fields(x,keys,where,nullable=true) {
    if(!x || typeof x!=='object' || Array.isArray(x) || keys.some(k=>!Object.hasOwn(x,k)||!scalar(x[k])||(!nullable&&x[k]===null)))throw new Error('Missing/invalid evidence: '+where);
  }
  function pooled(res, prefix, measure) {
    const get = k => res && Object.hasOwn(res,prefix+'_'+k) && scalar(res[prefix+'_'+k]) ? res[prefix+'_'+k] : NaN;
    const est=get('est'),lo=get('lo'),hi=get('hi');
    return {est,lo,hi,z:get('z'),p:get('p'),
      beta:est===null ? null : finite(measure==='RD' ? est : est>0 ? Math.log(est) : NaN),
      se:lo===null && hi===null ? null : finite(lo!==null && hi!==null && (measure==='RD'||(lo>0&&hi>0)) ? (measure==='RD' ? hi-lo : Math.log(hi)-Math.log(lo))/(2*Z) : NaN)};
  }
  function currentState() {
    const parsed=window.__mhValidation.parseInput?window.__mhValidation.parseInput(document.getElementById('src').value):null;
    if(parsed&&parsed.errors.length)throw new Error('Input line '+parsed.errors[0].line+': '+parsed.errors[0].message+' Fix the input before validating.');
    const rows=window.__mhValidation.parse(document.getElementById('src').value);
    const measure=document.getElementById('measure').value;
    if(rows.length<2)throw new Error('Need at least two valid studies');
    if(!['OR','RR','RD'].includes(measure))throw new Error('Invalid measure');
    window.__mhValidation.run();
    const result=window._almLastMhPeto();
    return {rows,measure,result,note:'Estimate, CI, z and p are exported on the display scale. Beta and SE are recovered from the full-precision estimate and CI, as in the paper. Heterogeneity (Q, I2, H2), CMH, Tarone and Breslow-Day are not compared in this live check; they are validated against metafor 5.2-1 in the archive supplemental check and by the exported self-checking R script.'};
  }
  function appValues(s) {
    return (s.measure==='OR'?['mh','peto']:['mh']).flatMap(prefix=>{
      const result={...s.result},p=pooled(result,prefix,s.measure);
      for(const q of ['z','p']) {
        const key=prefix+'_'+q;
        if(s.measure==='RD' && p.est===0 && p.se===0 && Number.isNaN(result[key]))result[key]=null;
        else if(result[key]===null && p.est!==null)throw new Error('Invalid current evidence: '+key);
      }
      fields(result,['est','lo','hi','z','p'].map(q=>prefix+'_'+q),'current '+prefix);
      const label=prefix==='peto'?'Peto OR':'MH '+s.measure;
      const values=Object.entries(pooled(result,prefix,s.measure)).map(([q,value])=>({key:prefix+'_'+q,label:label+' '+q,value}));
      // Shared widget supports scalar comparisons: R emits the supplemental tail
      // error, compared to zero here, without weakening the ordinary p row.
      values.push({key:prefix+'_p_tail',label:label+' p tail relative error',value:0});
      return values;
    });
  }
  function buildScript(s) {
    const vector=f=>'c('+s.rows.map(f).join(',')+')';
    const ps=appValues(s).filter(v=>/_p$/.test(v.key));
    return `ai <- as.numeric(${vector(r=>r.e1)})
bi <- as.numeric(${vector(r=>r.n1-r.e1)})
ci <- as.numeric(${vector(r=>r.e2)})
di <- as.numeric(${vector(r=>r.n2-r.e2)})
measure <- "${s.measure}"
get <- function(f) {
 if(inherits(f,'error')) return(setNames(rep(NA_real_,7),c('est','lo','hi','z','p','beta','se')))
 tr <- if(measure=='RD') identity else exp
 out <- c(est=tr(as.numeric(f$beta)),lo=tr(f$ci.lb),hi=tr(f$ci.ub),z=f$zval,p=f$pval,beta=as.numeric(f$beta),se=f$se)
 declared <- names(out)%in%c('z','p') & measure=='RD' & isTRUE(f$se==0) & isTRUE(as.numeric(f$beta)==0) & is.nan(out)
 if(any(is.na(out)&!declared)||any(is.infinite(out)))stop('Invalid R evidence')
 out[declared] <- NA_real_
 out
}
mh <- tryCatch(metafor::rma.mh(ai=ai,bi=bi,ci=ci,di=di,measure=measure,add=c(.5,0),to=c('only0','none'),drop00=c(FALSE,FALSE),correct=FALSE),error=function(e)e)
x <- setNames(get(mh),paste0('mh_',names(get(mh))))
if(measure=='OR') {
 pe <- tryCatch(metafor::rma.peto(ai=ai,bi=bi,ci=ci,di=di,add=0,to='none',drop00=TRUE),error=function(e)e)
 x <- c(x,setNames(get(pe),paste0('peto_',names(get(pe)))))
}
if(!is.numeric(x)||any(is.nan(x)|is.infinite(x))) stop('Invalid R evidence')
v <- ifelse(is.na(x),'null',sprintf('%.17g',x))
app_p <- c(${ps.map(v=>v.key+'='+ (v.value===null?'NA_real_':String(v.value))).join(',')})
for(key in names(app_p)) {
 b <- x[[key]]; a <- app_p[[key]]
 d <- if(is.na(b)) {if(is.na(a)) 0 else 1} else if(b>=0 && b<1e-12) {
   if(is.na(a)) 1 else if(b==0) {if(a==0) 0 else 1} else abs(a-b)/b
 } else 0
 # A finite sentinel above tolerance ensures even overflow reports FAIL.
 v[paste0(key,'_tail')] <- sprintf('%.17g',if(is.finite(d))d else 1)
}
cat('ALMJSON:{',paste(paste0('"',names(v),'":',v),collapse=','),'}\\n',sep='')`;
  }
  async function replay(loaded,progress) {
    const corpus=loaded[files[0].path];
    keyed(corpus);
    if(corpus.some(c=>!Array.isArray(c.rows)))throw new Error('Invalid corpus rows');
    const refs=keyed(loaded[files[1].path],corpus.flatMap(c=>['OR','RR','RD','PETO'].map(m=>c.id+'|'+m)));
    const fr=keyed(loaded[files[2].path],corpus.filter(c=>c.rows.length>=2).flatMap(c=>['OR','RR','RD'].map(m=>c.id+'|'+m)));
    for(const r of fr.values())fields(r,['FI','FQ','beta','lo','hi'],r.id);
    for(const cfg of corpus)for(const m of ['OR','RR','RD','PETO']) {
      const r=refs.get(cfg.id+'|'+m);
      if(r.k_input!==cfg.rows.length)throw new Error('Reference row count mismatch: '+r.id);
      if(cfg.rows.length<2)continue;
      fields(r,['est','lo','hi','zval','pval','beta','se'],r.id);
      if(m!=='PETO') {
        if(!Array.isArray(r.studies)||r.studies.length!==cfg.rows.length)throw new Error('Reference study count mismatch: '+r.id);
        for(const t of r.studies)fields(t,['est','lo','hi','beta','se'],r.id);
      }
    }
    for(const cfg of corpus) {
      if(!cfg.rows.length || new Set(cfg.rows.map(r=>String(r.source_row))).size!==cfg.rows.length || cfg.rows.some(r=>['ai','bi','ci','di'].some(k=>!r||!(typeof r.source_row==='string'&&r.source_row.length>0||Number.isSafeInteger(r.source_row))||!Number.isSafeInteger(r[k])||r[k]<0)||r.ai+r.bi<=0||r.ci+r.di<=0))throw new Error('Invalid source rows: '+cfg.id);
      for(const m of ['OR','RR','RD','PETO'])if(!refs.has(cfg.id+'|'+m))throw new Error('Missing reference '+cfg.id+'|'+m);
      for(const m of ['OR','RR','RD'])if(cfg.rows.length>=2&&!fr.has(cfg.id+'|'+m))throw new Error('Missing greedy oracle '+cfg.id+'|'+m);
    }
    const tails=[];let checks=0,passed=0;const failed=[],maxima={},refusals=[];
    function check(id,q,a,b,tol=1e-9,absolute=false) {
      const d=scalar(a)&&scalar(b) ? AlmValidate.compare(a,b,absolute||q.endsWith('.p')?'abs':'rel',tol) : {pass:false,diff:Infinity,reason:'Missing/invalid evidence'};
      if(q.endsWith('.p') && Number.isFinite(b) && b>=0 && b<1e-12) {
        const diff=!Number.isFinite(a)?Infinity:b>0?Math.abs(a-b)/b:a===0?0:Infinity;
        const row={id,quantity:q,app:a,ref:b,diff,tol:1e-9,pass:diff<=1e-9};
        tails.push(row);
        if(!row.pass)failed.push({...row,quantity:q+'.tail_relative'});
      }
      checks++;if(d.pass)passed++;else failed.push({id,quantity:q,app:a,ref:b,tol,...d});
      maxima[q]=Math.max(maxima[q]||0,d.diff);
    }
    const src=document.getElementById('src'),sel=document.getElementById('measure');
    const original={src:src.value,measure:sel.value,result:window._almLastMhPeto(),labbe:window.__almLabbe,
      active:document.activeElement,x:scrollX,y:scrollY,start:src.selectionStart,end:src.selectionEnd,direction:src.selectionDirection};
    const panels=['pooled-body','per-body','forest','labbe','fragility-note','het-body','assoc-body','k-note','estimability-note','zero-note','input-errors','per-effect-h','per-caption'].map(id=>document.getElementById(id)).filter(Boolean).map(e=>[e,e.innerHTML,e.getAttribute('viewBox'),e.hidden]);
    const srcAria=[src.getAttribute('aria-invalid'),src.getAttribute('aria-describedby')];
    const controls=[...document.querySelectorAll('main input,main textarea,main select,main button')].map(e=>[e,e.disabled]);
    const writer=window.alm&&alm.urlState&&alm.urlState.write;
    if(typeof writer!=='function')throw new Error('URL state write guard unavailable');
    const fragility=AlmFragility.fragility;let frag;
    // Synchronous page renders all call this API; suppress writes before any render.
    alm.urlState.write=()=>{};
    AlmFragility.fragility=function(...args){frag=fragility.apply(this,args);return frag;};
    controls.forEach(([e])=>{e.disabled=true;});
    try {
      for(const [i,cfg] of corpus.entries())for(const m of ['OR','RR','RD']) {
        const id=cfg.id+'|'+m,r=refs.get(id);sel.value=m;frag=null;window.__almLabbe=null;
        window.__almLoad(cfg.rows.map(row=>({study:'source-row-'+row.source_row,e1:row.ai,n1:row.ai+row.bi,e2:row.ci,n2:row.ci+row.di})));
        const result=window._almLastMhPeto(),pt=document.getElementById('pooled-body').innerText,st=document.getElementById('per-body').innerText;
        if(r.k_input<2) {
          check(id,m+'.single_row_refusal',Number(result===null),1);check(id,m+'.single_row_UI_clear',Number(!pt&&!st),1);refusals.push(id);continue;
        }
        for(const method of (m==='OR'?[m,'PETO']:[m])) {
          const rr=refs.get(cfg.id+'|'+method),p=pooled(result,method==='PETO'?'peto':'mh',m);
          for(const [q,k] of [['est','est'],['lo','lo'],['hi','hi'],['z','zval'],['p','pval'],['beta','beta'],['se','se']])check(id,method+'.'+q,p[q],rr[k]);
        }
        for(const line of pt.split('\n').filter(Boolean)) {
          const cells=line.split('\t'),method=cells[0]==='Peto OR'?'PETO':m,rr=refs.get(cfg.id+'|'+method);
          const values=cells.slice(1).join(' ').match(/-?\d+(?:\.\d+)?/g)||[];
          if(values.length===5)['est','lo','hi','zval','pval'].forEach((q,j)=>check(id,method+'.display_pooled_'+q,Number(values[j]),rr[q],q==='zval'?.0050000001:.0005000001,true));
        }
        const ss=window.__mhPetoBusStudies(),rs=r.studies||[];
        const expected=rs.filter(t=>t.se!==null&&t.se>0&&t.beta!==null);
        check(id,m+'.study_count',ss.length,expected.length);
        const byLabel=keyed(ss,cfg.rows.filter((row,j)=>rs[j].se!==null&&rs[j].se>0&&rs[j].beta!==null).map(row=>'source-row-'+row.source_row),'label');
        cfg.rows.forEach((row,j)=>{
          const t=rs[j];if(t.se===null||t.se<=0||t.beta===null)return;
          const s=byLabel.get('source-row-'+row.source_row)||{};
          check(id+'|row'+(j+1),m+'.study_beta',s.est,t.beta);check(id+'|row'+(j+1),m+'.study_se',s.se,t.se);
        });
        st.split('\n').filter(Boolean).forEach((line,j)=>{
          const cells=line.split('\t'),t=rs[j],values=(cells[3]+' '+cells[4]).match(/-?\d+(?:\.\d+)?/g)||[];
          if(values.length===3)['est','lo','hi'].forEach((q,k)=>check(id+'|row'+(j+1),m+'.display_study_'+q,Number(values[k]),t[q],.0005000001,true));
          else check(id+'|row'+(j+1),m+'.display_study_defined',values.length,3);
        });
        const lb=window.__almLabbe;
        if(lb) {
          fields(lb,['logEff'],id,false);
          const grid=[],eff=Math.exp(lb.logEff);
          for(let pc=.001;pc<=.999;pc+=.01) {
            const pt=m==='RR'?eff*pc:(pc/(1-pc)*eff)/(1+pc/(1-pc)*eff);
            if(Number.isFinite(pt)&&pt>=0&&pt<=1)grid.push(pc);
          }
          if(!Array.isArray(lb.points)||lb.points.length!==cfg.rows.length||!Array.isArray(lb.curve)||!lb.curve.length||lb.curve.length!==grid.length)throw new Error('Invalid Labbe shape: '+id);
          for(const p of [...lb.points,...lb.curve])fields(p,['pc','pt'],id,false);
          if(lb.curve.some((p,j)=>Math.abs(p.pc-grid[j])>1e-15))throw new Error('Invalid Labbe curve grid: '+id);
          check(id,m+'.labbe_logEff',lb.logEff,r.labbe.logEff);
          lb.points.forEach((p,j)=>['pc','pt'].forEach(q=>check(id,m+'.labbe_'+q,p[q],r.labbe[q][j])));
          const e=r.labbe.eff;check(id,m+'.labbe_curve_max_abs_error',Math.max(0,...lb.curve.map(p=>Math.abs(p.pt-(m==='RR'?e*p.pc:e*p.pc/(1-p.pc+e*p.pc))))),0);
        }
        const f=frag||{},rf=fr.get(id);
        for(const key of ['FI','FQ'])check(id,m+'.fragility_'+key,f[key],rf[key]);
        for(const [key,rkey] of [['est','beta'],['lo','lo'],['hi','hi']])check(id,m+'.fragility_DL_'+rkey,(f.pooled||{})[key],rf[rkey]);
        progress('Configuration '+(i+1)+'/'+corpus.length+' ('+m+'); '+checks+' checks');
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    } finally {
      src.value=original.src;sel.value=original.measure;
      window.__mhValidation.restoreResult(original.result);window.__almLabbe=original.labbe;
      for(const [e,html,viewBox,hidden] of panels){e.innerHTML=html;if(viewBox!==null)e.setAttribute('viewBox',viewBox);e.hidden=hidden;}
      [['aria-invalid',srcAria[0]],['aria-describedby',srcAria[1]]].forEach(([k,v])=>{if(v===null)src.removeAttribute(k);else src.setAttribute(k,v);});
      AlmFragility.fragility=fragility;alm.urlState.write=writer;
      controls.forEach(([e,disabled])=>{e.disabled=disabled;});
      src.setSelectionRange(original.start,original.end,original.direction);
      if(original.active && original.active.isConnected)original.active.focus({preventScroll:true});
      window.scrollTo(original.x,original.y);
    }
    if(!tails.length)throw new Error('No p-value tail checks executed');
    const tailPassed=tails.filter(t=>t.pass).length;
    return {checks,passed,failed,maxima,refusals,tails:{checks:tails.length,passed:tailPassed,rows:tails},summaryLines:[
      'TAIL: '+tailPassed+'/'+tails.length+' relative p-value checks pass; tolerance=1e-9.',
      'Current page recomputed: pooled estimate/CI/z/p, recovered beta/SE, per-study outputs, rounded UI, greedy DL fragility FI/FQ and baseline, L\'Abbe, and single-row refusal/clear checks.',
      'Replayed R oracle: archived metafor 5.2-1 reference and independent R greedy FI/FQ and DL baseline records. R is not executed in Tier 2; its initial/final oracle self-checks are provenance, not extra checks.',
      'Full precision: relative 1e-9; p absolute 1e-9. Rounded UI: absolute 0.0005000001 (z: 0.0050000001). Undefined matches undefined only. This replay has no CMH/Tarone/Q/I2 rows (those are checked in the archive supplemental check).'
    ]};
  }
  const repo='https://github.com/mahmood726-cyber/mhpeto-reproducible';
  const kinds=Object.fromEntries(['mh','peto'].flatMap(p=>['est','lo','hi','z','p','beta','se'].map(q=>[p+'_'+q,q==='p'?'abs':'rel'])));
  const adapter={app:'mh-peto',paper:{checks:68461,repoUrl:repo,runUrl:repo+'/#validate-with-one-command',codespacesUrl:'https://codespaces.new/mahmood726-cyber/mhpeto-reproducible',doi:null},
    live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState,buildScript,appValues,compare:{tolerance:{default:1e-9},kind:kinds}},corpus:{files,run:replay}};
  window.AlmMhPetoValidationAdapter=adapter;
  window.AlmMhPetoValidation=AlmValidate.mount(document.getElementById('alm-validate'),adapter);
  // The shared widget in this checkout uses an Actions label; link to actual instructions.
  const link=document.querySelector('#alm-validate a[href="'+adapter.paper.runUrl+'"]');
  if(link)link.textContent='Full R re-execution (one-command instructions)';
})();
