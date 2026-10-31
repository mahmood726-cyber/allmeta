/* P19: same discomb model used by component-nma/tests/fixtures/cnma-oracle.R. */
(function(global) {
  'use strict';
  function currentState() {
    const result=global._almLastCnma();
    if(!result || !document.querySelector('#comp-body tr')) throw Error('Run the component model first');
    for(const name of result.comps) for(const key of ['est','se']) adapter.compare.kind['component.'+name+'.'+key]='rel';
    const rows=document.getElementById('src').value.split(/\n/).map((line,i)=>{
      const [A,B,y,se]=line.split('|').map(x=>x.trim());return {A,B,yi:Number(y),se:Number(se),study:'row_'+(i+1)};
    });
    return {rows,result};
  }
  function appValues(s) {
    const out=['Q','df','tau2'].map(key=>({key,label:key,value:s.result[key]}));
    for(const name of s.result.comps) {
      const r=s.result.components[name];
      for(const key of ['est','se']) out.push({key:'component.'+name+'.'+key,label:name+' '+key,value:r[key]});
      // The page reports normal intervals with this same exact qnorm(.975).
      for(const [key,sign] of [['ci_lo',-1],['ci_hi',1]]) out.push({key:'component.'+name+'.'+key,label:name+' '+key,value:r.est+sign*1.959963984540054*r.se});
    }
    return out;
  }
  function buildScript(s) {
    if(!s?.rows?.length || s.rows.some(r=>![r.yi,r.se].every(Number.isFinite)||r.se<=0||!r.A||!r.B)) throw Error('Invalid component input or standard error');
    const vec=k=>'c('+s.rows.map(r=>JSON.stringify(r[k])).join(',')+')';
    return `te <- ${vec('yi')}; se <- ${vec('se')}
A <- ${vec('A')}; B <- ${vec('B')}; study <- ${vec('study')}
f <- netmeta::discomb(TE=te,seTE=se,treat1=A,treat2=B,studlab=study,inactive="control",sep.comps="+",common=TRUE,random=TRUE)
out <- list(Q=f$Q.additive,df=f$df.Q.additive,tau2=f$tau^2)
for(name in c(${s.result.comps.map(x=>JSON.stringify(x)).join(',')})) {
  j <- match(name, f$comps)
  stopifnot(!is.na(j))
  out[[paste0('component.',name,'.est')]] <- f$Comp.random[j]
  out[[paste0('component.',name,'.se')]] <- f$seComp.random[j]
  out[[paste0('component.',name,'.ci_lo')]] <- f$Comp.random[j]-qnorm(.975)*f$seComp.random[j]
  out[[paste0('component.',name,'.ci_hi')]] <- f$Comp.random[j]+qnorm(.975)*f$seComp.random[j]
}
cat('ALMJSON:',jsonlite::toJSON(out,auto_unbox=TRUE,digits=NA),'\\n',sep='')
`;
  }
  const adapter={packages:['netmeta','jsonlite'],currentState,buildScript,appValues,
    compare:{tolerance:{default:1e-9},kind:{df:'exact',Q:'rel',tau2:'rel'}}};
  if(typeof document!=='undefined') global.AlmExamples.register('component-nma',{adapter:()=>adapter});
  if(typeof module!=='undefined') module.exports=adapter;
})(typeof window!=='undefined'?window:globalThis);
