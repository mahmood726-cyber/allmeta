/* Replay definitions ported directly from heterogeneity-reproducible/analysis/checks.py.
 * Display audit follows bench/run_app.mjs; it is separate from the numerical total.
 * No fitted app outputs are stored: each comparison calls the shipped page engine.
 */
(function () {
  'use strict';
  const KEYS = ['pm','reml','ml','eb','sj','he','hs','dl'];
  const files = [{"path":"validate/corpus/corpus.json","sha256":"b3d7ea381e31a70dc45d2d2f613ac390592fef4184e3fb989cb21ef54ee21fac","bytes":109686},{"path":"validate/corpus/reference.json","sha256":"aecb7c1ef7f3d290fd53b6709c2ce11d3d8f02fe0fcef4cb0e3d6febe47ad8f2","bytes":3128201}];
  const repo = 'https://github.com/mahmood726-cyber/heterogeneity-reproducible';
  function liveState() {
    document.getElementById('f-data').dispatchEvent(new Event('input', {bubbles:true}));
    const text = document.getElementById('f-data').value;
    const requested = document.getElementById('f-tau2').value;
    const result = window.__almHetCompute(text, requested);
    if (result.notPooled) throw new Error('Need at least two valid studies');
    return { result, studies: window._almLastStudies().map(s => ({ est: s.est, se: Math.sqrt(s.v) })),
      note: result.dlRefused ? 'DL refused for k < 10; PM is the analysis currently displayed and validated.' : '' };
  }
  function values(state) {
    const a = state.result, s = a.sum, q = a.qpci;
    return Object.entries({tau2:a.tau2,mu:s.mu,se:s.se,ci_lb:s.ciLo,ci_ub:s.ciHi,hk_lo:s.ciLoHKSJ,hk_hi:s.ciHiHKSJ,
      pi_lo:a.pi.lo,pi_hi:a.pi.hi,QE:s.Q,pQ:s.pQ,I2:s.I2,k:a.k,df:s.df,
      tau2_lo:q.tau2Lo,tau2_hi:q.tau2Hi,I2_lo:q.I2Lo,I2_hi:q.I2Hi}).map(([key,value]) => ({key,label:key,value}));
  }
  function displayAudit(res) {
    const shown = {
      cards: Object.fromEntries([...document.querySelectorAll('#stats-wrap .stat')].map(s => [s.querySelector('.k').textContent.trim(),s.querySelector('.v').textContent.trim()])),
      loo: [...document.querySelectorAll('#loo-table tr')].slice(1).map(tr => [...tr.children].map(td => td.textContent.trim()))
    };
    const near = (shown, value, d) => Number.isFinite(value) ? Math.abs(parseFloat(shown) - value) <= 0.5 * 10 ** -d * (1 + 1e-9) + 1e-12 : shown === '--';
    const fails = [];
    const nums = (s) => (s.match(/-?\d+(\.\d+)?|--/g) || []);
    const S = res.sum, C = shown.cards;
    const chk = (name, s, vals, dps) => { const n = nums(s || ""); vals.forEach((v, i) => { if (!near(n[i], v, dps[i])) fails.push(`${name}[${i}] shows ${n[i]} for ${v}`); }); };
    const qtext = C[`Q (df=${S.df})`] || "";
    chk("Q", qtext, [S.Q], [2]);
    if (S.pQ < 0.0005 ? !/p<0\.001/.test(qtext) : !near(nums(qtext)[1], S.pQ, 3)) fails.push(`p(Q) shows ${qtext} for ${S.pQ}`);
    const used = C["τ² used"] || "";
    chk("tau2used", used, [res.tau2], [4]);
    if (!used.includes(`(${res.estimator.toUpperCase()})`)) fails.push(`tau2used names ${used} for ${res.estimator}`);
    chk("I2", C["I²"], [S.I2, res.qpci.I2Lo, res.qpci.I2Hi], [1, 1, 1]);
    chk("tau2CI", C["τ² 95% CI (Q-profile)"], [res.qpci.tau2Lo, res.qpci.tau2Hi], [4, 4]);
    chk("tau2PM", C["τ² (PM)"], [res.tauEstimates.pm], [4]);
    chk("tau2REML", C["τ² (REML)"], [res.tauEstimates.reml], [4]);
    if (res.tauEstimates.dl != null) chk("tau2DL", C["τ² (DL)"], [res.tauEstimates.dl], [4]);
    chk("REz", C["RE pooled (z)"], [S.mu, S.ciLo, S.ciHi], [3, 3, 3]);
    chk("REhk", C["RE pooled (HKSJ + t)"], [S.mu, S.ciLoHKSJ, S.ciHiHKSJ], [3, 3, 3]);
    chk("PI", C["95% PI"], [res.pi.lo, res.pi.hi], [3, 3]);
    res.loo.forEach((r, i) => {
      const t = shown.loo[i] || [];
      if (String(r.k) !== t[1]) fails.push(`loo[${i}].k`);
      chk(`loo[${i}].mu`, t[2], [r.mu], [3]); chk(`loo[${i}].ci`, t[3], [r.ciLo, r.ciHi], [3, 3]);
      chk(`loo[${i}].I2`, t[4], [r.I2], [1]); chk(`loo[${i}].tau2`, t[5], [r.tau2], [4]);
    });

    return { numbers: 19 + 6 * res.loo.length - (res.tauEstimates.dl == null ? 1 : 0), fails };
  }
  async function replay(loaded, onProgress) {
    const corpus = loaded[files[0].path], refs = loaded[files[1].path];
    const byID = new Map(refs.map(r => [r.analysis,r]));
    if (byID.size !== refs.length || byID.size !== corpus.length || new Set(corpus.map(c => c.id)).size !== corpus.length) throw new Error('Corpus/reference identifiers differ or duplicate');
    let checks=0, passed=0, configurations=0, refused=0, compared=0, displayed=0;
    const failed=[], displayFails=[], maxima={REL:0,ABS:0,EXACT:0};
    function check(id, quantity, app, ref, kind='REL') {
      const tol=kind==='EXACT'?0:1e-9;
      const d = kind==='EXACT' && typeof app==='boolean' && typeof ref==='boolean' ? {diff:app===ref?0:Infinity,pass:app===ref} : AlmValidate.compare(app,ref,kind==='REL'?'rel':'abs',tol);
      checks++;if(d.pass)passed++;else failed.push({id,quantity,app,ref,diff:d.diff,tol});
      maxima[kind]=Math.max(maxima[kind],d.diff);
    }
    const data=document.getElementById('f-data'), select=document.getElementById('f-tau2');
    const original={data:data.value,key:select.value};
    try {
      for (const [index,c] of corpus.entries()) {
        const r=byID.get(c.id);if(!r)throw new Error('Missing reference: '+c.id);
        const a=window.__almHetCompute(c.text,'pm'),s=a.sum,q=a.qpci,rc=r.common;
        if(a.k!==c.k)throw new Error('Corpus parser study count mismatch: '+c.id);
        for(const [name,av,rv,kind] of [
          ['k',a.k,rc.k,'EXACT'],['Q',s.Q,rc.Q,'REL'],['df',s.df,rc.df,'EXACT'],['p(Q)',s.pQ,rc.pQ,'ABS'],['I2',s.I2,rc.I2,'ABS'],
          ['tau2 CI lower',q.tau2Lo,rc.tau2_lo,'REL'],['tau2 CI upper',q.tau2Hi,rc.tau2_hi,'REL'],['I2 CI lower',q.I2Lo,rc.I2_lo,'ABS'],['I2 CI upper',q.I2Hi,rc.I2_hi,'ABS']
        ]) check(c.id,name,av,rv,kind);
        for(const key of KEYS) {
          configurations++;
          const A=key==='pm'?a:window.__almHetCompute(c.text,key),R=r.configs[key],S=A.sum;
          if(!R || R.error)throw new Error('Reference fit unavailable: '+c.id+'/'+key);
          const refRefused=R.refused===true || R.refused==='true';
          check(c.id+'/'+key,'refusal',!!A.dlRefused,refRefused,'EXACT');
          // The original display audit includes the PM fallback when DL is refused.
          data.value=c.text;select.value=key;data.dispatchEvent(new Event('input',{bubbles:true}));
          const audit=displayAudit(A);displayed+=audit.numbers;displayFails.push(...audit.fails.map(f=>c.id+'/'+key+': '+f));
          if(refRefused || A.dlRefused){refused++;continue;}compared++;
          const id=c.id+'/'+key;
          for(const [name,av,rv] of [
            ['tau2',A.tau2,R.tau2],['mu',S.mu,R.mu],['SE',S.se,R.se],['CI lower (z)',S.ciLo,R.ci_lo],['CI upper (z)',S.ciHi,R.ci_hi],
            ['HKSJ CI lower',S.ciLoHKSJ,R.hk_lo],['HKSJ CI upper',S.ciHiHKSJ,R.hk_hi],['PI lower',A.pi.lo,R.pi_lo],['PI upper',A.pi.hi,R.pi_hi]
          ])check(id,name,av,rv);
          if(A.loo.length!==c.k || A.baujat.length!==c.k)throw new Error('Incomplete app output: '+id);
          A.loo.forEach((l,i)=>{
            for(const [name,av,rv,kind] of [
              ['LOO mu',l.mu,R.loo_mu[i],'REL'],['LOO CI lower',l.ciLo,R.loo_ci_lo[i],'REL'],['LOO CI upper',l.ciHi,R.loo_ci_hi[i],'REL'],
              ['LOO I2',l.I2,R.loo_I2[i],'ABS'],['LOO tau2',l.tau2,R.loo_tau2[i],'REL']
            ])check(id+'/'+i,name,av,rv,kind);
          });
          A.baujat.forEach((b,i)=>{check(id+'/'+i,'Baujat x',b.x,R.baujat_x[i]);check(id+'/'+i,'Baujat y',b.y,R.baujat_y[i]);});
        }
        onProgress('Replaying '+(index+1)+'/'+corpus.length+' meta-analyses; '+checks+' numerical checks');
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    } finally {data.value=original.data;select.value=original.key;data.dispatchEvent(new Event('input',{bubbles:true}));}
    return {checks,passed,failed,maxima,refusals:{configurations,refused,compared},displayed,displayFails,
      summaryLines:[corpus.length+' meta-analyses; '+configurations+' configurations; '+refused+' refused; '+compared+' compared.',
      'Separate rendered-number audit: '+displayed+' numbers; '+displayFails.length+' failures (not included in numerical total).',
      ...displayFails.slice(0,20), 'Reference: metafor 5.2-1. REL = |app-R|/max(1,|R|); ABS = |app-R|; tolerance 1e-9; structural checks exact.']};
  }
  const adapter = {
    app:'heterogeneity',
    paper:{title:'Heterogeneity in meta-analysis in the browser',doi:null,checks:131781,repoUrl:repo,runUrl:repo+'/actions/runs/38088539463',codespacesUrl:'https://codespaces.new/mahmood726-cyber/heterogeneity-reproducible'},
    live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState:liveState,appValues:values,
      buildScript:state=>AlmWebR.buildMetaforScript(state.studies,state.result.estimator.toUpperCase(),'z',true),
      compare:{tolerance:{default:1e-6,k:0,df:0},kind:{tau2:'rel',mu:'rel',se:'rel',ci_lb:'rel',ci_ub:'rel',hk_lo:'rel',hk_hi:'rel',pi_lo:'rel',pi_hi:'rel',QE:'rel',tau2_lo:'rel',tau2_hi:'rel'}}},
    corpus:{files,run:replay}
  };
  window.AlmHetValidationAdapter=adapter;
  window.AlmHetValidation=AlmValidate.mount(document.getElementById('alm-validate'),adapter);
})();
