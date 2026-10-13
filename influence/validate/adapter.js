/* Full primary paper contract: 142 configurations, 164802 checks.
 * The shipped page computes every app value; archived app outputs are not loaded. */
(function () {
  'use strict';
  const files = [{"path": "validate/corpus/corpus.json", "sha256": "9e911db8f01aa2d0df045dcb81f5bf20ba35364b66f2c96414d7ca1ddb048dfa", "bytes": 377061}, {"path": "validate/corpus/reference.json", "sha256": "5c9ca912fc04ff5375fb32b25f6c8fbf6cb114c77c53e2c903ef66cb6d423fca", "bytes": 5461541}];
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const own = (x,k) => x && Object.hasOwn(x,k);
  function requireField(x,k) { if(!own(x,k))throw new Error('Missing field: '+k);return x[k]; }
  function vector(x,k,boolean=false,nullable=false) {
    if(!Array.isArray(x)||x.length!==k||x.some(v=>boolean?typeof v!=='boolean':!(finite(v)||(nullable&&v===null))))throw new Error('Invalid vector shape/type');
    return x;
  }
  function index(records) {
    if(!Array.isArray(records)||records.length!==142)throw new Error('Expected exactly 142 configurations');
    const out=new Map();
    for(const record of records) {
      if(!record||typeof record.id!=='string'||!record.id||out.has(record.id)||!own(record,'data'))throw new Error('Duplicate or invalid configuration identifier');
      out.set(record.id,record.data);
    }
    return out;
  }
  function source(c) {
    const k=requireField(c,'yi').length;
    if(k<3)throw new Error('Need at least three valid effect rows');
    vector(c.yi,k);vector(requireField(c,'vi'),k);
    const rows=vector(requireField(c,'rows'),k);
    if(c.vi.some(v=>v<=0)||rows.some(v=>!Number.isInteger(v)||v<1)||new Set(rows).size!==k)throw new Error('Invalid variance or source row identifiers');
    return k;
  }
  function capture() {
    const rows=window._almStudies();
    if(rows.length<3)throw new Error('Need at least three valid effect rows');
    return structuredClone({full:window._almLastInfluence(),diag:window._almLastDiag(),baujat:window.__almBaujat,radial:window.__almRadial,
      flags:[...document.querySelectorAll('#body tr')].slice(0,-1).map(r=>r.classList.contains('flag')),
      ui:{tableRows:document.querySelectorAll('#body tr').length,plots:['loo-plot','influence-plot','baujat-plot','radial-plot'].map(id=>document.getElementById(id).children.length)}});
  }
  function appValues(a,k,ui=true) {
    const out=[];
    function add(q,v,i,tol=1e-6,nullable=false) {
      if(!(finite(v)||(nullable&&v===null)))throw new Error('Invalid app quantity: '+q);
      const key=q+(i===undefined?'':'.'+i);out.push({key,label:key,value:v,tol});
    }
    const f=requireField(a,'full');
    for(const q of ['mu','seMu','tau2','Q','df','swRE'])add('full.'+q,requireField(f,q),undefined,['Q','df'].includes(q)?1e-9:1e-6);
    vector(requireField(f,'wRE'),k);vector(requireField(a,'flags'),k,true);
    if(f.swRE<=0||!Array.isArray(a.diag)||a.diag.length!==k)throw new Error('Invalid app record shape');
    for(const q of ['x','y'])vector(requireField(a.baujat,q),k,false,true);
    for(const q of ['x','z','resid'])vector(requireField(a.radial,q),k);
    for(let i=0;i<k;i++) {
      const d=a.diag[i];
      add('full.wRE',f.wRE[i],i);
      for(const q of ['loo_mu','loo_seMu','resid','dffits','cooksD','covRatio','hat'])add(q,requireField(d,q),i,1e-6,true);
      for(const [sign,q] of [[-1,'ci.lb'],[1,'ci.ub']])add('loo.'+q,d.loo_mu===null||d.loo_seMu===null?null:d.loo_mu+sign*1.959963984540054*d.loo_seMu,i,1e-6,true);
      // Strict Boolean validation above precedes lossless 0/1 encoding for the shared numeric helper.
      add('flags',Number(a.flags[i]),i,0);
      add('weight.percent',100*f.wRE[i]/f.swRE,i);
      for(const q of ['x','y'])add('baujat.REML.'+q,a.baujat[q][i],i,1e-6,true);
      for(const q of ['x','z','resid'])add('radial.'+q,a.radial[q][i],i,1e-9);
    }
    add('radial.slope',requireField(a.radial,'slope'),undefined,1e-9);
    if(ui) {
      if(!Number.isInteger(a.ui.tableRows))throw new Error('Invalid table row count');
      add('ui.table_rows',a.ui.tableRows,undefined,0);
      vector(a.ui.plots,4);
      a.ui.plots.forEach((n,i)=>{if(!Number.isInteger(n)||n<0)throw new Error('Invalid plot count');add('ui.plot_nonempty',Number(n>0),i,0);});
    }
    return out;
  }
  function referenceValues(c,r) {
    const k=source(c),out={};
    const add=(q,v,i)=>{out[q+(i===undefined?'':'.'+i)]=v;};
    for(const q of ['mu','seMu','tau2','Q','df']) {
      const v=requireField(r.full,q);if(!finite(v))throw new Error('Invalid reference full fit');add('full.'+q,v);
    }
    const w=c.vi.map(v=>1/(v+r.full.tau2));add('full.swRE',w.reduce((a,b)=>a+b,0));
    for(const q of ['estimate','se','ci.lb','ci.ub'])vector(requireField(r.loo,q),k,false,true);
    for(const q of ['rstudent','dffits','cook.d','cov.r','hat','weight'])vector(requireField(r.inf,q),k,false,q!=='weight');
    vector(requireField(r,'flags'),k,true);
    for(const q of ['x','y'])vector(requireField(r.baujat,q),k,false,true);
    for(const q of ['x','z','resid'])vector(requireField(r.radial,q),k);
    if(!finite(r.radial.slope))throw new Error('Invalid radial slope');
    for(let i=0;i<k;i++) {
      add('full.wRE',w[i],i);
      for(const [aq,rq] of [['loo_mu','estimate'],['loo_seMu','se'],['loo.ci.lb','ci.lb'],['loo.ci.ub','ci.ub']])add(aq,r.loo[rq][i],i);
      for(const [aq,rq] of [['resid','rstudent'],['dffits','dffits'],['cooksD','cook.d'],['covRatio','cov.r'],['hat','hat'],['weight.percent','weight']])add(aq,r.inf[rq][i],i);
      add('flags',Number(r.flags[i]),i);
      for(const q of ['x','y'])add('baujat.REML.'+q,r.baujat[q][i],i);
      for(const q of ['x','z','resid'])add('radial.'+q,r.radial[q][i],i);
    }
    add('radial.slope',r.radial.slope);add('ui.table_rows',k+1);
    for(let i=0;i<4;i++)add('ui.plot_nonempty',1,i);
    return out;
  }
  async function replay(loaded,progress) {
    const corpus=index(loaded[files[0].path]),refs=index(loaded[files[1].path]);
    if([...corpus.keys()].some(k=>!refs.has(k)))throw new Error('Configuration coverage differs');
    // Preflight every reference before touching inputs.
    const expected=new Map([...corpus].map(([id,c])=>[id,referenceValues(c,refs.get(id))]));
    if(!window.alm?.urlState?.withoutWrites)throw new Error('URL-state replay guard unavailable');
    const snapshot=window.__almInfluenceValidationSnapshot();
    let checks=0,passed=0;const failed=[],maxima={};
    return alm.urlState.withoutWrites(async()=>{
      try {
        let done=0;
        for(const [id,c] of corpus) {
          window.__almRestore({data:c.yi.map((v,i)=>`${v}, ${Math.sqrt(c.vi[i])}, row${c.rows[i]}`).join('\n')});
          const values=appValues(capture(),c.yi.length),ref=expected.get(id);
          if(values.length!==Object.keys(ref).length)throw new Error('Per-configuration check coverage differs');
          for(const v of values) {
            const r=requireField(ref,v.key),d=AlmValidate.compare(v.value,r,'rel',v.tol);
            checks++;if(d.pass)passed++;else failed.push({id,quantity:v.key,app:v.value,ref:r,tol:v.tol,...d});
            const q=v.key.replace(/\.\d+$/,'');maxima[q]=Math.max(maxima[q]||0,d.diff);
          }
          progress(`Replaying ${++done}/142 configurations; ${checks} checks`);
          await new Promise(resolve=>setTimeout(resolve,0));
        }
      } finally {window.__almInfluenceValidationRestore(snapshot);}
      if(JSON.stringify(window.__almInfluenceValidationSnapshot())!==JSON.stringify(snapshot))throw new Error('Page restoration failed');
      if(checks!==164802)throw new Error('Primary paper check cardinality differs');
      return {checks,passed,failed,maxima,refusals:[],summaryLines:['Full primary comparison: 142 configurations; every per-study value and four plot-presence checks. No saved app outputs used.','REML relative tolerance 1e-6; Q/df and FE radial 1e-9; Boolean flags and UI counts exact. Paper metafor 5.2-1. No additional DL controls in this denominator.']};
    });
  }
  function currentState() {
    // Direct restore runs the actual page without synthesizing clicks or changing browser history.
    const data=document.getElementById('src').value;
    const lines=data.trim().split(/\n/).filter(s=>s.trim());
    if(lines.length<3||lines.some(line=>{const p=line.split(',');return p.length<2||!p[0].trim()||!p[1].trim()||!finite(Number(p[0]))||!finite(Number(p[1]))||Number(p[1])<=0;}))throw new Error('Need at least three valid effect rows; invalid lines are refused');
    window.__almRestore({data});
    const rows=window._almStudies(),a=capture(),values=appValues(a,rows.length,false);
    adapter.live.compare={tolerance:{default:1e-6,...Object.fromEntries(values.map(v=>[v.key,v.tol]))},kind:Object.fromEntries(values.map(v=>[v.key,'rel']))};
    return {yi:rows.map(r=>r.te),vi:rows.map(r=>r.se*r.se),values,note:'Current data: intercept-only REML; flags exact, relative REML tolerance 1e-6, Q/df and FE radial 1e-9. Paper metafor 5.2-1; live metafor 4.8-0.'};
  }
  function buildScript(s) {
    return `yi <- c(${s.yi.join(',')})
vi <- c(${s.vi.join(',')})
res <- metafor::rma(yi,vi,method='REML',control=list(threshold=1e-12,maxiter=10000))
loo <- metafor::leave1out(res)
inf <- influence(res)
pdf(NULL)
bj <- metafor::baujat(res)
fe <- metafor::rma(yi,vi,method='FE')
rad <- metafor::radial(fe)
dev.off()
out <- list()
put <- function(q,x) {for(i in seq_along(x))out[[paste0(q,'.',i-1)]] <<- x[i]}
out[['full.mu']] <- as.numeric(coef(res));out[['full.seMu']]<-res$se
out[['full.tau2']]<-res$tau2;out[['full.Q']]<-res$QE;out[['full.df']]<-res$k-1
w<-1/(vi+res$tau2);out[['full.swRE']]<-sum(w);put('full.wRE',w)
put('loo_mu',loo$estimate);put('loo_seMu',loo$se);put('loo.ci.lb',loo$ci.lb);put('loo.ci.ub',loo$ci.ub)
put('resid',inf$inf$rstudent);put('dffits',inf$inf$dffits);put('cooksD',inf$inf$cook.d);put('covRatio',inf$inf$cov.r);put('hat',inf$inf$hat)
stopifnot(is.logical(inf$is.infl),!anyNA(inf$is.infl))
put('flags',as.numeric(inf$is.infl));put('weight.percent',inf$inf$weight)
put('baujat.REML.x',bj$x);put('baujat.REML.y',bj$y)
put('radial.x',rad$x);put('radial.z',rad$y);put('radial.resid',rad$y-as.numeric(coef(fe))*rad$x)
out[['radial.slope']]<-as.numeric(coef(fe))
emit <- function(x) {stopifnot(is.numeric(x),length(x)==1);if(is.na(x)&&!is.nan(x))'null' else {stopifnot(is.finite(x));sprintf('%.17g',x)}}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(out,emit,'')),collapse=','),'}\\n',sep='')`;
  }
  const adapter={app:'influence',paper:{checks:164802,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'R re-execution instructions',runUrl:'validate/README.md',doi:null},
    live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState,buildScript,appValues:s=>s.values,compare:{tolerance:{default:1e-6},kind:{}}},corpus:{files,run:replay}};
  window.AlmInfluenceValidationAdapter=adapter;
  window.AlmInfluenceValidation=AlmValidate.mount(document.getElementById('alm-validate'),adapter);
})();
