/* Binomial-normal GLMM protocol. Fits are executed by R, never by corpus lookup. */
(function (root) {
  'use strict';
  const fields = ['k','mu','se','tau2','estimate','ciLo','ciHi','piLo','piHi'];
  const reasons = ['insufficient_studies','boundary_unidentifiable','nonfinite_fit','nonconvergence'];
  function validateRows(rows) {
    if (!Array.isArray(rows) || rows.some(r => !Number.isSafeInteger(r.x) || !Number.isSafeInteger(r.n) || r.n <= 0 || r.x < 0 || r.x > r.n)) throw new Error('Invalid binomial counts');
    return rows;
  }
  function parse(text) {
    if (!text.trim()) return [];
    // CSV uploads and the transformed-scale analysis share the same input box.
    if (root.AlmProportionInput) return root.AlmProportionInput.parse(text);
    return validateRows(text.trim().split(/\r?\n/).map((line,i) => {
      const p = line.split(',').map(s => s.trim());
      if (p.length < 2 || !/^\d+$/.test(p[0]) || !/^\d+$/.test(p[1])) throw new Error('Invalid counts on row ' + (i+1));
      return {x:Number(p[0]),n:Number(p[1]),label:p.slice(2).join(',') || 'Study '+(i+1)};
    }));
  }
  function validateResult(r) {
    if (!r || !['ok','refused'].includes(r.status)) throw new Error('Invalid GLMM status');
    if (r.status === 'refused') {
      if (!reasons.includes(r.reason)) throw new Error('Invalid refusal reason');
    } else {
      const v = r.values;
      if (!v || Object.keys(v).length !== fields.length || fields.some(k => !Object.hasOwn(v,k))) throw new Error('Invalid GLMM fields');
      if (!Number.isSafeInteger(v.k) || v.k < 2 || v.se <= 0 || v.tau2 < 0) throw new Error('Invalid GLMM fit');
      for (const k of fields) {
        if (['piLo','piHi'].includes(k) && v.k < 3) { if (v[k] !== null) throw new Error('Prediction interval must be unavailable'); }
        else if (!Number.isFinite(v[k])) throw new Error('Nonfinite GLMM field: '+k);
      }
      if (['estimate','ciLo','ciHi','piLo','piHi'].some(k => v[k] !== null && (v[k]<0 || v[k]>1)) || v.ciLo>v.estimate || v.ciHi<v.estimate || v.piLo>v.piHi) throw new Error('Invalid probability limits');
    }
    return r;
  }
  function flat(r) { validateResult(r); return r.status === 'ok' ? {status:r.status,...r.values} : {status:r.status,reason:r.reason}; }
  function format(v) { return v === null ? 'Unavailable (fewer than 3 studies)' : typeof v === 'number' ? v.toPrecision(17) : v; }
  function close(a,b,key) {
    if (['status','reason','k'].includes(key)) return typeof a === typeof b && a === b;
    return a === null && b === null || Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= 1e-6*Math.max(1,Math.abs(b));
  }
  function buildScript(rows) {
    validateRows(rows);
    const vector = k => rows.length ? 'c('+rows.map(r=>r[k]).join(',')+')' : 'numeric(0)';
    return `print(.libPaths())
for (p in c('metafor','lme4')) cat(p,as.character(packageVersion(p)),'\\n')
x <- ${vector('x')}
n <- ${vector('n')}
k <- length(x)
warnings <- character()
out <- tryCatch(withCallingHandlers({
 if(k<2) stop('insufficient_studies')
 if(all(x==0)||all(x==n)) stop('boundary_unidentifiable')
 f <- metafor::rma.glmm(measure='PLO',xi=x,ni=n,method='ML',test='z',nAGQ=7,control=list(glmerCtrl=list(optimizer='bobyqa',optCtrl=list(maxfun=100000L,rhoend=1e-9))))
 if(any(grepl('converg|Hessian|identif|gradient|fallback|Cannot fit',warnings,ignore.case=TRUE))) stop('nonconvergence')
 mu <- as.numeric(coef(f)); se <- as.numeric(f$se); tau2 <- f$tau2
 if(any(!is.finite(c(mu,se,tau2)))||se<=0||tau2<0) stop('nonfinite_fit')
 ci <- plogis(mu+c(-1,1)*qnorm(.975)*se)
 pi <- if(k>=3) plogis(mu+c(-1,1)*qt(.975,k-1)*sqrt(tau2+se^2)) else c(NA_real_,NA_real_)
 list(status='ok',k=k,mu=mu,se=se,tau2=tau2,estimate=plogis(mu),ciLo=ci[1],ciHi=ci[2],piLo=pi[1],piHi=pi[2])
},warning=function(w){warnings<<-c(warnings,conditionMessage(w));invokeRestart('muffleWarning')}),error=function(e){
 reason <- conditionMessage(e)
 if(!reason %in% c('insufficient_studies','boundary_unidentifiable','nonfinite_fit')) reason <- 'nonconvergence'
 list(status='refused',reason=reason)
})
encode <- function(z) if(is.character(z)) paste0('"',z,'"') else if(is.na(z)) 'null' else sprintf('%.17g',z)
cat('ALMJSON:{',paste(sprintf('"%s":%s',names(out),vapply(out,encode,'')),collapse=','),'}\\n',sep='')`;
  }
  function decode(stdout) {
    const lines = stdout.split(/\r?\n/).filter(s=>s.startsWith('ALMJSON:'));
    if (lines.length !== 1) throw new Error('R must emit exactly one GLMM record');
    const f = JSON.parse(lines[0].slice(8));
    const r = f.status === 'ok' ? {status:f.status,values:Object.fromEntries(fields.map(k=>[k,f[k]]))} : {status:f.status,reason:f.reason};
    return validateResult(r);
  }
  root.AlmPropPlusCore = {fields,reasons,validateRows,parse,validateResult,flat,format,close,buildScript,decode};
})(globalThis);
