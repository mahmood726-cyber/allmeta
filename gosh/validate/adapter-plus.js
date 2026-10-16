(function () {
  'use strict';
  const P=AlmGoshPlus, pointFields=['mu','I2','H2','Q','tau2','tau'];
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const memberKey=p=>{if(!Array.isArray(p.members)||!p.members.length||p.members.some(x=>!Number.isInteger(x)||x<1)||new Set(p.members).size!==p.members.length)throw Error('Invalid membership');return [...p.members].sort((a,b)=>a-b).join(',');};
  // Generated pins are loaded by manifest-plus.js; no downloaded manifest can replace them.
  const manifest=window.AlmGoshPlusManifest;
  function values() {
    const a=P.state;if(!a)throw Error('No extras to validate');const out=[];
    const add=(key,value,exact=false)=>{if(!exact&&!finite(value))throw Error('Invalid displayed '+key);out.push({key,label:key,value,exact});};
    const headings=[...document.querySelectorAll('#plus-table thead button')].map(e=>e.textContent);
    if(JSON.stringify(headings)!==JSON.stringify(P.columnLabels))throw Error('Invalid extra table headers');
    const rows=[...document.querySelectorAll('#plus-table tbody tr')];
    add('row_count',rows.length,true);
    for(const row of rows){const i=Number(row.dataset.study);if(!Number.isInteger(i)||i<1||i>a.k||row.querySelector('th button')?.textContent!==`${i}: ${a.labels[i-1]}`)throw Error('Invalid extra study label');for(const q of P.fields){const cells=row.querySelectorAll(`[data-quantity="${q}"]`);if(cells.length!==1||!cells[0].textContent.trim())throw Error('Missing displayed '+q);add(`study.${i}.${q}`,Number(cells[0].textContent),q.endsWith('_n'));}}
    a.points.forEach((p,i)=>{add('members.'+i,memberKey(p),true);for(const q of pointFields)if(a.model==='DL'||!q.startsWith('tau'))add(q+'.'+i,p[q]);});
    const circles=[...document.querySelectorAll('#plus-plot circle')];add('plot_count',circles.length,true);
    circles.forEach((c,i)=>{add('plot_x.'+i,Number(c.getAttribute('cx')));add('plot_y.'+i,Number(c.getAttribute('cy')));add('included.'+i,c.dataset.includes,true);add('colour.'+i,c.getAttribute('fill'),true);});
    add('highlight_counts',document.getElementById('plus-counts').textContent,true);
    const ticks=[...document.querySelectorAll('#plus-plot text')];if(ticks.length!==6)throw Error('Missing extra axes');['x_title','y_title','xmin','xmax','ymin','ymax'].forEach((q,i)=>add(q,i<2?ticks[i].textContent:Number(ticks[i].textContent),i<2));
    return out;
  }
  function referenceValues(r,k,model) {
    if(!Array.isArray(r.rows)||r.rows.length!==k||!Array.isArray(r.points)||!r.points.length)throw Error('Invalid reference shape');
    const grouped=new Map();for(const p of r.points){const key=memberKey(p);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(p);}
    const ordered=P.state.points.map(p=>{const queue=grouped.get(memberKey(p));if(!queue?.length)throw Error('Reference membership coverage mismatch');return queue.shift();});
    if([...grouped.values()].some(queue=>queue.length))throw Error('Reference membership coverage mismatch');
    r={...r,points:ordered};
    const v={row_count:k};const seen=new Set();
    for(const row of r.rows){if(!Number.isInteger(row.study)||row.study<1||row.study>k||seen.has(row.study))throw Error('Invalid study coverage');seen.add(row.study);for(const q of P.fields){if(!finite(row[q]))throw Error('Missing reference '+q);v[`study.${row.study}.${q}`]=row[q];}}
    r.points.forEach((p,i)=>{if(p.members.some(m=>m>k))throw Error('Invalid reference membership');v['members.'+i]=memberKey(p);for(const q of pointFields)if(model==='DL'||!q.startsWith('tau')){if(!finite(p[q]))throw Error('Missing reference '+q);v[q+'.'+i]=p[q];}});
    const selected=Number(document.getElementById('plus-study').value),het=document.getElementById('plus-het').value;
    if(!Number.isInteger(selected)||selected<1||selected>k||!Object.hasOwn(P.axes,het)||(model!=='DL'&&het.startsWith('tau')))throw Error('Invalid extra controls');
    const xs=r.points.map(p=>p.mu),ys=r.points.map(p=>p[het]),lo=Math.min(...xs),hi=Math.max(...xs),yl=Math.min(0,...ys),yh=Math.max(...ys);
    const pos=(x,l,h,o,n)=>{if(l===h)return o+n/2;const s=Math.max(Math.abs(l),Math.abs(h));return o+n*((x/s-l/s)/(h/s-l/s));};
    v.plot_count=r.points.length;Object.assign(v,{x_title:'Pooled effect',y_title:P.axes[het],xmin:lo,xmax:hi,ymin:yl,ymax:yh});
    r.points.forEach((p,i)=>{v['plot_x.'+i]=pos(p.mu,lo,hi,60,520);v['plot_y.'+i]=400-pos(p[het],yl,yh,30,350);v['included.'+i]=String(p.members.includes(selected));v['colour.'+i]=p.members.includes(selected)?'#0072b2':'#d55e00';});
    const row=r.rows.find(x=>x.study===selected);v.highlight_counts=`Includes study ${selected}: ${row.with_n} (blue); excludes study ${selected}: ${row.without_n} (orange).`;
    return v;
  }
  function compare(r,k,model,check) {
    const refs=referenceValues(r,k,model), actual=values();
    if(actual.length!==Object.keys(refs).length||new Set(actual.map(v=>v.key)).size!==actual.length)throw Error('Extra quantity coverage mismatch');
    for(const v of actual){if(!Object.hasOwn(refs,v.key))throw Error('Unknown extra quantity');check(v.key,v.value,refs[v.key],v.exact?'exact':'rel');}
  }
  async function replay(loaded,progress) {
    const corpus=loaded[manifest.files[0].path],refs=loaded[manifest.files[1].path];
    if(!Array.isArray(corpus)||corpus.length!==manifest.configurations||!Array.isArray(refs)||refs.length!==manifest.model_configurations)throw Error('Corpus cardinality mismatch');
    const index=new Map(refs.map(r=>[r.key,r]));if(index.size!==refs.length)throw Error('Duplicate reference key');
    const ids=new Set();for(const c of corpus){if(ids.has(c.id)||!Number.isInteger(c.k)||c.k<3||c.k>100||!Array.isArray(c.te)||!Array.isArray(c.se)||c.te.length!==c.k||c.se.length!==c.k||c.te.some(x=>!finite(x))||c.se.some(x=>!finite(x)||x<=0))throw Error('Invalid corpus input');ids.add(c.id);for(const m of ['FE','DL'])if(!index.has(c.id+'::'+m))throw Error('Missing reference');}
    const status=document.getElementById('plus-status').textContent;
    const previous=P.state,selection=document.getElementById('plus-study').value,het=document.getElementById('plus-het').value;
    let checks=0,passed=0;const failed=[],maxima={};
    try {for(const c of corpus)for(const model of ['FE','DL']){
      const id=c.id+'::'+model,r=index.get(id);
      P.render(P.capture(c.te.map((v,i)=>`${v}, ${c.se[i]}, ${c.source_rows[i]}`).join('\n'),model,5000));
      compare(r,c.k,model,(quantity,app,ref,kind)=>{const d=AlmValidate.compare(app,ref,kind,1e-9);checks++;if(d.pass)passed++;else failed.push({id,quantity,app,ref,...d});if(failed.length>=1000)throw Error('Extras replay stopped after 1000 mismatches; first: '+JSON.stringify(failed[0]));const group=quantity.startsWith('study.')?quantity.split('.').at(-1):quantity.split('.')[0];maxima[group]=Math.max(maxima[group]||0,d.diff);});
      progress(id+': '+checks+' checks');await new Promise(resolve=>setTimeout(resolve,0));
    }}finally {if(previous){P.render(previous);document.getElementById('plus-study').value=selection;document.getElementById('plus-study').dispatchEvent(new Event('change'));document.getElementById('plus-het').value=het;document.getElementById('plus-het').dispatchEvent(new Event('change'));}else P.clear();document.getElementById('plus-status').textContent=status;}
    if(checks!==manifest.checks)throw Error('Extra check cardinality mismatch: '+checks);
    return {checks,passed,failed,maxima,refusals:[],summaryLines:['Every displayed table value and every extra point quantity; exact memberships and counts; relative tolerance 1e-9.',"Sampled summaries use the app's own draws, checked against archived R fits on the same memberships."]};
  }
  function currentState() {
    const a=P.capture();P.render(a);
    const lines=document.getElementById('src').value.trim().split(/\n/).map(l=>l.split(','));
    const v=values();adapter.live.compare.kind=Object.fromEntries(v.map(x=>[x.key,x.exact?'exact':'rel']));
    return {...a,te:lines.map(l=>Number(l[0])),se:lines.map(l=>Number(l[1])),values:v,note:"Overlapping subsets: descriptive differences only. Sampled results use the app's own draws. Paper metafor 5.2-1; live 4.8-0."};
  }
  function buildScript(s) {return `
selected<-${Number(document.getElementById('plus-study').value)};het<-'${document.getElementById('plus-het').value}'
yi<-c(${s.te.join(',')});vi<-c(${s.se.map(x=>x*x).join(',')});method<-'${s.model}'
members<-list(${s.points.map(p=>'c('+p.members.join(',')+')').join(',')})
base<-metafor::rma(yi,vi,method=method)
if(length(yi)<=15){sav<-metafor::gosh(base,progbar=FALSE);keys<-apply(sav$incl,1,function(x)paste(which(x),collapse=','));idx<-match(vapply(members,function(m)paste(sort(m),collapse=','),''),keys);stopifnot(!anyNA(idx),!anyDuplicated(idx),length(idx)==nrow(sav$res));res<-sav$res[idx,,drop=FALSE];incl<-sav$incl[idx,,drop=FALSE]
}else{res<-do.call(rbind,lapply(members,function(m){z<-metafor::rma(yi[m],vi[m],method=method);data.frame(estimate=as.numeric(coef(z)),I2=z$I2,QE=z$QE,H2=z$QE/(length(m)-1),tau2=z$tau2,tau=sqrt(z$tau2))}));incl<-t(vapply(members,function(m)seq_along(yi)%in%m,logical(length(yi))))}
out<-list(row_count=length(yi));for(i in seq_along(yi)){a<-incl[,i];stopifnot(any(a),any(!a));v<-list(with_n=sum(a),without_n=sum(!a));for(q in c('mean','median','i2')){x<-if(q=='i2')res$I2 else res$estimate;f<-if(q=='median')median else mean;v[[paste0('with_',q)]]<-f(x[a]);v[[paste0('without_',q)]]<-f(x[!a]);v[[paste0('diff_',q)]]<-f(x[a])-f(x[!a])};for(q in names(v))out[[paste0('study.',i,'.',q)]]<-v[[q]]}
for(i in seq_along(members)){out[[paste0('members.',i-1)]]<-paste(sort(members[[i]]),collapse=',');v<-list(mu=res$estimate[i],I2=res$I2[i],H2=res$H2[i],Q=res$QE[i]);if(method=='DL'){v$tau2<-res$tau2[i];v$tau<-res$tau[i]};for(q in names(v))out[[paste0(q,'.',i-1)]]<-v[[q]]}
xx<-res$estimate;yy<-res[[if(het=='Q')'QE' else het]];pos<-function(x,l,h,o,n){if(l==h)return(o+n/2);s<-max(abs(l),abs(h));o+n*((x/s-l/s)/(h/s-l/s))}
out$plot_count<-nrow(res);out$x_title<-'Pooled effect';out$y_title<-'${P.axes[document.getElementById('plus-het').value]}';out$xmin<-min(xx);out$xmax<-max(xx);out$ymin<-min(0,yy);out$ymax<-max(yy)
for(i in seq_along(members)){out[[paste0('plot_x.',i-1)]]<-pos(xx[i],min(xx),max(xx),60,520);out[[paste0('plot_y.',i-1)]]<-400-pos(yy[i],min(0,yy),max(yy),30,350);out[[paste0('included.',i-1)]]<-if(selected%in%members[[i]])'true' else 'false';out[[paste0('colour.',i-1)]]<-if(selected%in%members[[i]])'#0072b2' else '#d55e00'}
out$highlight_counts<-paste0('Includes study ',selected,': ',sum(incl[,selected]),' (blue); excludes study ',selected,': ',sum(!incl[,selected]),' (orange).')
emit<-function(q){x<-out[[q]];if(is.character(x))paste0('"',x,'"')else{stopifnot(is.numeric(x),length(x)==1,is.finite(x));sprintf('%.17g',x)}}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(names(out),emit,'')),collapse=','),'}\\n',sep='')
`;}
  const adapter={app:'gosh-plus',paper:{checks:manifest.checks,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Extras scope and reproduction',runUrl:'validate/plus/README.md'},live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState,buildScript,appValues:s=>s.values,compare:{tolerance:{default:1e-9},kind:{}}},corpus:{files:manifest.files,mode:'quick',quickChecks:manifest.checks,run:replay}};
  adapter.compareDisplay=compare;window.AlmGoshPlusAdapter=adapter;window.AlmGoshPlusValidation=AlmValidate.mount(document.getElementById('alm-plus-validate'),adapter);
  for(const button of document.querySelectorAll('#alm-plus-validate button')){if(button.textContent==='Re-run full validation')button.textContent='Re-run extras validation';if(button.textContent==='Validate this analysis in R')button.textContent='Validate the extras in R';}
})();
