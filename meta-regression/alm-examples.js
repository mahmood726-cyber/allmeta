/* P8 base-model example adapter: same recipe as the page's Export R script. */
(function(global) {
  'use strict';
  const keys=['intercept','intercept_se','intercept_ci_lb','intercept_ci_ub','slope','slope_se','slope_ci_lb','slope_ci_ub','tau2_pm'];
  function currentState() {
    const result=global.__almResults(), rows=global._almLastStudies();
    if(!rows?.length || keys.some(k=>!Number.isFinite(result[k]))) throw Error('Run the meta-regression first');
    adapter.compare.tolerance.default=result.tau2_pm===0?1e-9:1e-6;
    return {rows,result};
  }
  function buildScript(s) {
    if(!s?.rows?.length || s.rows.some(r=>![r.est,r.se,r.x].every(Number.isFinite)||r.se<=0)) throw Error('Invalid finite regression input');
    const vec=k=>'c('+s.rows.map(r=>r[k]).join(',')+')';
    return `yi <- ${vec('est')}
se <- ${vec('se')}
x <- ${vec('x')}
f <- metafor::rma(yi=yi, sei=se, mods=~x, method="PM", test="adhoc", control=list(tol=1e-12))
out <- list(intercept=as.numeric(coef(f)[1]),intercept_se=f$se[1],intercept_ci_lb=f$ci.lb[1],intercept_ci_ub=f$ci.ub[1],
  slope=as.numeric(coef(f)[2]),slope_se=f$se[2],slope_ci_lb=f$ci.lb[2],slope_ci_ub=f$ci.ub[2],tau2_pm=f$tau2)
cat('ALMJSON:',jsonlite::toJSON(out,auto_unbox=TRUE,digits=NA),'\\n',sep='')
`;
  }
  const adapter={packages:['metafor','jsonlite'],currentState,buildScript,
    appValues:s=>keys.map(key=>({key,label:key,value:s.result[key]})),
    compare:{tolerance:{default:1e-6},kind:Object.fromEntries(keys.map(k=>[k,'rel']))}};
  // Existing meta-regression-features.spec.mjs: relative 1e-9 at tau2=0,
  // otherwise 1e-6 for iterative PM, scaled by max(1, abs(R)).
  if(typeof document!=='undefined') global.AlmExamples.register('meta-regression',{adapter:()=>adapter});
  if(typeof module!=='undefined') module.exports=adapter;
})(typeof window!=='undefined'?window:globalThis);
