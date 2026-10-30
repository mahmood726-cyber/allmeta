/* Current-analysis netmeta check. The R oracle follows P16 reference.R, including
 * the uncentred metafor QE function for PM and preset-tau global decomposition. */
(function () {
'use strict';
const a=window.AlmIncoValidationAdapter;
const $=id=>document.getElementById(id);
const fmt=(v,d=3)=>Number.isFinite(v)?v.toFixed(d):'—';
function currentState() {
  const rows=window.parse($('src').value), reason=window.inputIssue(rows);
  if(reason) throw Error(reason);
  const original=window._almLastInco(), state=structuredClone(original);
  if(!state || state.status==='refused') throw Error(state?.reason || 'Run the analysis first.');
  // structuredClone omits non-enumerable join metadata. Carry it into the
  // immutable snapshot, separately from the pinned numerical quantities.
  state.nodeSplit.forEach((r,i)=>Object.defineProperty(r,'pairKey',{value:original.nodeSplit[i].pairKey}));
  // Recompute through the shipped page, but restore exactly what the user was viewing.
  const saved=a.snapshot(); let fresh;
  try {window.__almIncoLoad(saved.text); fresh=structuredClone(window._almLastInco());} finally {a.restore(saved);}
  if(JSON.stringify(state)!==JSON.stringify(fresh)) throw Error('Displayed results are out of date; run tests first.');
  const vals=a.leaves(a.sortedState(state));
  const optionsOK=a.controls(state.model,$('src').value);
  const table=[...$('ns-body').querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent.trim()));
  const expected=state.nodeSplit.map(s=>[s.comparison,`${fmt(s.direct.mean)} (${fmt(s.direct.se)})`,`${fmt(s.indirect.mean)} (${fmt(s.indirect.se)})`,`${fmt(s.diff)} (${fmt(s.seDiff)})`,fmt(s.z,2),fmt(s.p,3),s.p<.05?'inconsistent':'consistent']);
  const g=state.dbt, tau=state.model==='FE'?'fixed-effect (τ²=0)':`${state.model} τ² = ${fmt(state.tau2,4)}`;
  const global=`Design-by-treatment Q = ${fmt(g.Q,2)}, df = ${g.df}, p = ${fmt(g.p,3)}. ${g.p===null?'inconsistency is not testable':g.p<.05?'evidence of inconsistency':'no evidence of inconsistency'} Model: ${tau}.`;
  vals.push({key:'display.table',value:JSON.stringify(table)===JSON.stringify(expected)},
    {key:'display.global',value:$('dbt').textContent.replace(/\s+/g,' ').trim()===global},
    {key:'display.controls',value:optionsOK},
    {key:'display.pageText',value:JSON.stringify(a.pageText())===JSON.stringify(a.contract.pageText)},
    {key:'display.chartControls',value:a.chartControls()});
  // Structural identities must survive the validator's serialisation boundary;
  // do not add them to the historically pinned enumerable numerical state.
  const pairKeys=state.nodeSplit.map(r=>r.pairKey);
  if(pairKeys.some(k=>typeof k!=='string') || new Set(pairKeys).size!==pairKeys.length)
    throw Error('Missing or duplicate structural treatment-pair identity; R validation refused.');
  return {rows,state,values:vals,pairKeys,note:'Live: self-hosted netmeta 3.4-0 / metafor 4.8-0. Paper: netmeta 3.7-0 / metafor 5.2-1. Numerical checks and table/global text; the pinned replay additionally checks every plot element.'};
}
function buildScript(s) {
  const vector=(key,numeric=false)=>'c('+s.rows.map(r=>numeric?r[key].toPrecision(17):JSON.stringify(r[key])).join(',')+')';
  if(!Array.isArray(s.pairKeys) || s.pairKeys.length!==s.state.nodeSplit.length)
    throw Error('Missing structural treatment-pair identity; R validation refused.');
  if(new Set(s.pairKeys).size!==s.pairKeys.length)
    throw Error('Duplicate structural treatment-pair identity; R validation refused.');
  const pairId=key=>{
    let pair;
    try { pair=JSON.parse(key); } catch (_) { throw Error('Invalid structural treatment-pair identity; R validation refused.'); }
    if(!Array.isArray(pair) || pair.length!==2 || pair.some(t=>typeof t!=='string'))
      throw Error('Invalid structural treatment-pair identity; R validation refused.');
    const ids=pair.map(t=>s.state.trts.indexOf(t)+1);
    if(ids.includes(0) || ids[0]===ids[1])
      throw Error('Unknown structural treatment-pair identity; R validation refused.');
    return ids.sort((a,b)=>a-b).join(':');
  };
  return `suppressPackageStartupMessages(library(netmeta))
suppressPackageStartupMessages(library(metafor))
A <- ${vector('A')}; B <- ${vector('B')}; te <- ${vector('te',true)}; se <- ${vector('se',true)}; study <- ${vector('study')}
model <- ${JSON.stringify(s.state.model)}
tr <- ${'c('+s.state.trts.map(t=>JSON.stringify(t)).join(',')+')'}
stopifnot(!anyDuplicated(study), length(te)>=3, setequal(tr,unique(c(A,B))))
tau <- 0
if(model=='PM') {
 X <- sapply(tr[-1],function(t)as.numeric(A==t)-as.numeric(B==t))
 if(length(te)>ncol(as.matrix(X))) {
  qe <- get('.QE.func',asNamespace('metafor'))
  f <- function(t2)qe(t2,Y=as.matrix(te),vi=se^2,X=as.matrix(X),k=length(te),objective=length(te)-ncol(as.matrix(X)))
  if(f(0)>0) {upper<-max(1,var(te));while(f(upper)>0)upper<-upper*2;tau<-sqrt(uniroot(f,c(0,upper),tol=.Machine$double.eps^0.75,maxiter=1000)$root)}
 }
}
sep <- ' ~~ '
while(any(grepl(sep,tr,fixed=TRUE))) sep<-paste0(sep,'~')
m <- netmeta(TE=te,seTE=se,treat1=A,treat2=B,studlab=study,sm='MD',reference.group=tr[1],common=TRUE,random=TRUE,method.tau='DL',tau.preset=if(model=='DL')NULL else tau,sep.trts=sep,warn=FALSE)
tau <- if(model=='FE')0 else m$tau
spl <- netsplit(m,method='Back-calculation',tol.direct=0)
suffix <- if(model=='FE')'common' else 'random'
direct <- spl[[paste0('direct.',suffix)]]; indirect <- spl[[paste0('indirect.',suffix)]]; cmp <- spl[[paste0('compare.',suffix)]]
path <- function(a,b) {keep<-!((A==a&B==b)|(A==b&B==a));reach<-a;repeat{nextset<-unique(c(reach,B[keep&A%in%reach],A[keep&B%in%reach]));if(length(nextset)==length(reach))break;reach<-nextset};b%in%reach}
splits <- list()
for(j in seq_len(nrow(cmp))) {
 pair<-strsplit(cmp$comparison[j],sep,fixed=TRUE)[[1]]; ord<-pair[order(match(pair,tr))];sign<-if(pair[1]==ord[1])1 else -1
 if(!is.finite(direct$TE[j]) || !path(ord[1],ord[2]))next
 stopifnot(is.finite(cmp$TE[j]))
 key<-paste(sort(match(ord,tr)),collapse=':')
 splits[[key]]<-list(comparison=paste(ord,collapse=' vs '),direct=list(mean=sign*direct$TE[j],se=direct$seTE[j]),indirect=list(mean=sign*indirect$TE[j],se=indirect$seTE[j]),diff=sign*cmp$TE[j],seDiff=cmp$seTE[j],z=sign*cmp$statistic[j],p=cmp$p[j])
}
# Order is supplied only for emission; membership must match independently.
names_app <- ${s.state.nodeSplit.length?'c('+s.state.nodeSplit.map((row,i)=>({row,key:s.pairKeys[i]})).sort((x,y)=>x.row.comparison.localeCompare(y.row.comparison)).map(x=>JSON.stringify(pairId(x.key))).join(',')+')':'character(0)'}
stopifnot(!anyDuplicated(names_app),setequal(names_app,names(splits)))
splits<-unname(splits[names_app])
dec<-decomp.design(m,tau.preset=tau,warn=FALSE)
q<-if(model=='FE')dec$Q.decomp else dec$Q.inc.random.preset
g<-list(Q=0,df=0,p=NA_real_)
if(!is.null(q)){j<-match('Between designs',rownames(q));g<-list(Q=q$Q[j],df=q$df[j],p=q$pval[j]);if(g$df==0){g$Q<-0;g$p<-NA_real_}}
est<-function(which)setNames(lapply(tr,function(t)list(est=m[[paste0('TE.',which)]][t,tr[1]],se=m[[paste0('seTE.',which)]][t,tr[1]])),tr)
fe<-est('common');re<-est('random');beta<-vapply(re,function(x)x$est,0.0)
out<-list(trts=as.list(tr),Q=m$Q,df=m$df.Q,estimates=fe,estimatesRandom=re,Qrandom=sum((te-(beta[A]-beta[B]))^2/(se^2+tau^2)),model=model,tau2=tau^2,nodeSplit=splits,dbt=g)
flat<-list()
walk<-function(x,p='') {if(is.list(x)){nn<-names(x);if(is.null(nn))nn<-as.character(seq_along(x)-1L);for(i in seq_along(x))walk(x[[i]],if(nchar(p))paste(p,nn[i],sep='.')else nn[i])}else flat[[p]]<<-x}
walk(out)
for(k in c('table','global','controls','pageText','chartControls'))flat[[paste0('display.',k)]]<-TRUE
quote<-function(x)encodeString(x,quote='"')
emit<-function(x){stopifnot(length(x)==1);if(is.character(x))quote(x)else if(is.logical(x))if(x)'true'else'false'else if(is.na(x))'null'else{stopifnot(is.finite(x));sprintf('%.17g',x)}}
cat('ALMJSON:{',paste(paste0(vapply(names(flat),quote,''),':',vapply(flat,emit,'')),collapse=','),'}\\n',sep='')
`;
}
const live={packages:['netmeta','metafor'],paperVersions:{netmeta:'3.7-0',metafor:'5.2-1'},currentState,buildScript,appValues:s=>s.values.map(v=>({...v,label:v.key})),compare:{tolerance:{default:1e-9},kind:{}}};
// Build per-quantity comparison rules at the same time as the immutable input snapshot.
live.currentState=()=>{
  const s=currentState(); live.compare={tolerance:{default:1e-9},kind:{}};
  for(const v of s.values) {
    live.compare.kind[v.key]=typeof v.value==='number' ? (/(^|\.)p$/.test(v.key)?'abs':'rel') : v.value===null?'abs':'exact';
    if(typeof v.value==='number' && /(^|\.)df$/.test(v.key))live.compare.kind[v.key]='exact';
    if(s.state.model==='PM' && typeof v.value==='number' && !/(^|\.)p$/.test(v.key) && !v.key.startsWith('estimates.') && v.key!=='Q')live.compare.tolerance[v.key]=1e-6;
  }
  return s;
};
a.live=live;
window.AlmIncoValidation=AlmValidate.mount($('alm-validate'),a);
const note=document.createElement('p');
note.textContent=`Pinned replay: ${a.contract.configurations} configurations / ${a.contract.checks} checks. ${a.contract.rule} Live R checks current numerical results and table/global text; replay also checks the plot. Full archived comparison: 76,601 checks.`;
$('alm-validate').append(note);
})();
