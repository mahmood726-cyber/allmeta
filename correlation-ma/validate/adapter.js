/* P17: pinned offline replay of the actual page; live same-origin webR/metafor.
 * No estimator implementation lives here. Display rules are checked separately
 * from numerical agreement with the archived independent R reference.
 */
(function () {
'use strict';
const CONTRACT = window.AlmCorrValidationPins;
const $ = id => document.getElementById(id);
const METHODS = ['REML', 'PM', 'DL', 'FE'];
const OPTIONS = [['REML','REML'],['PM','Paule-Mandel'],['DL','DerSimonian-Laird'],['FE','Fixed-effect']];
const NUMBERS = ['mu_z','se_z','tau2_z','I2','r','r_lo','r_hi','r_pi_lo','r_pi_hi'];
const FIELDS = ['_schema','k','method',...NUMBERS,'studies'];
const REFUSAL = 'Enter at least 2 studies (label, r, n).';
const fmt = (n, d = 3) => Number.isFinite(n) ? n.toFixed(d) : '—';
const serial = x => JSON.stringify(x);
const finite = x => typeof x === 'number' && Number.isFinite(x);

// Static text is a pinned contract, never learnt from the page being validated.
// Include text, element paths, titles, accessible names and control attributes.
function pageText() {
  const out = [];
  function visit(el, path) {
    if (el.matches('#alm-validate,#headline,#res-body,#forest-host,#alm-plus,#f-tools,#f-notice,script,style')) return;
    const attrs = ['aria-label','title','href','type','data-action'].map(a => el.getAttribute(a));
    out.push([path, attrs]);
    if (el.tagName === 'TEXTAREA') return;
    let index = 0, text = '';
    // Adjacent text nodes are one run: browsers merge entity-split text that DOM shims may keep separate.
    const flush = () => { const t = text.replace(/\s+/g,' ').trim(); if (t) out.push([path,t]); text = ''; };
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { text += n.textContent; continue; }
      flush();
      if (n.nodeType === 1) visit(n, path + '>' + n.tagName + index++);
    }
    flush();
  }
  for (const el of document.body.children) if (['A','NAV','HEADER','MAIN','FOOTER'].includes(el.tagName)) visit(el,el.tagName + (el.id ? '#'+el.id : ''));
  return out;
}
function controls(method, text, replaying) {
  const a = $('f-data'), b = $('f-method');
  return a.value === text && b.value === method &&
    [a,b].every(e => e.disabled === replaying && !e.readOnly && !e.closest('fieldset[disabled],[inert]') && !e.hasAttribute('aria-disabled')) &&
    serial([...b.querySelectorAll('option')].map(o=>[o.value,o.textContent])) === serial(OPTIONS) &&
    [...b.querySelectorAll('option')].every(o=>!o.disabled) &&
    [...document.querySelectorAll('#alm-export-mount button')].every(e=>!e.disabled);
}
function display(a, check) {
  if (!a) {
    check('refusal.message', $('headline').textContent, REFUSAL, 'exact');
    check('refusal.table', $('res-body').innerHTML, '', 'exact');
    check('refusal.forest', $('forest-host').innerHTML, '', 'exact');
    return;
  }
  const w = a.studies.map(s=>1/(1/(s.n-3)+a.tau2_z)), sw=w.reduce((x,y)=>x+y,0);
  const head = `k = ${a.k} · pooled r = ${fmt(a.r)} [${fmt(a.r_lo)}, ${fmt(a.r_hi)}] · τ²(z) = ${fmt(a.tau2_z,4)} · I² = ${fmt(a.I2,1)}%` +
    (a.r_pi_lo === null ? '' : ` · 95% PI [${fmt(a.r_pi_lo)}, ${fmt(a.r_pi_hi)}]`);
  check('display.headline', $('headline').textContent, head, 'exact');
  const table = [...$('res-body').querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent));
  const expected = a.studies.map((s,i)=>[s.label,fmt(s.r),String(s.n),fmt(Math.atanh(s.r)),fmt(100*w[i]/sw,1)+'%']);
  expected.push(['Pooled',fmt(a.r),'—',fmt(a.mu_z),'100%']);
  check('display.table',serial(table),serial(expected),'exact');
  check('display.pooled_label', $('res-body').querySelectorAll('tr.pooled-row').length, 1, 'exact');
}
function plot(r, check) {
  const svg = $('forest-host').querySelector('svg');
  const texts = svg ? [...svg.querySelectorAll('text')] : [];
  check('plot.text', serial(texts.map(e=>e.textContent)), serial(['-1','-0.5','0','0.5','1',...r.studies.map(s=>s.label),'Pooled']), 'exact');
  const H=80+(r.k+1)*24, x=v=>150+(v+1)*190;
  check('plot.size', svg && svg.getAttribute('viewBox'), '0 0 560 '+H,'exact');
  const circles = svg ? [...svg.querySelectorAll('circle')] : [], lines = svg ? [...svg.querySelectorAll('line')] : [];
  check('plot.circle_count', circles.length, r.k,'exact'); check('plot.line_count',lines.length,r.k+1,'exact');
  const attr=(e,n)=>e && e.hasAttribute(n) ? Number(e.getAttribute(n)) : NaN;
  ['x1','x2','y1','y2'].forEach((n,i)=>check('plot.zero.'+n,attr(lines[0],n),[x(0),x(0),40,H-30][i],'abs'));
  r.studies.forEach((s,i)=>{
    for(const [n,v] of [['cx',x(s.r)],['cy',50+i*24],['r',3.5]]) check('plot.marker.'+n,attr(circles[i],n),v,'abs');
    for(const [n,v] of [['x1',x(r.study_lo[i])],['x2',x(r.study_hi[i])],['y1',50+i*24],['y2',50+i*24]]) check('plot.study.'+n,attr(lines[i+1],n),v,'plot');
  });
  const p = svg && svg.querySelector('polygon');
  const points = p ? p.getAttribute('points').trim().split(/\s+/).map(p=>p.split(',').map(Number)) : [];
  check('plot.diamond_count',points.length,4,'exact');
  [[x(r.r_lo),50+r.k*24],[x(r.r),44+r.k*24],[x(r.r_hi),50+r.k*24],[x(r.r),56+r.k*24]].forEach((p,i)=>p.forEach((v,j)=>check('plot.diamond',points[i]?.[j],v,'plot')));
  const positions=[...[-1,-.5,0,.5,1].map(v=>[x(v),H-14]),...r.studies.map((s,i)=>[10,54+i*24]),[10,54+r.k*24]];
  positions.forEach((p,i)=>p.forEach((v,j)=>check('plot.text_position',attr(texts[i],j?'y':'x'),v,'abs')));
  // Replay invokes the shared exporter's scan so every chart control is present.
  // Native download delivery remains a separate browser task.
  const bars=[...$('forest-host').querySelectorAll('.alm-xbar')];
  check('plot.export_controls',bars.length===1 && bars.every(b=>b.textContent==='⬇SVGPNGJPGPDF' && serial([...b.querySelectorAll('button')].map(e=>[e.textContent,e.getAttribute('aria-label'),e.disabled]))===serial(['SVG','PNG','JPG','PDF'].map(s=>[s,'Download chart as '+s,false]))),true,'exact');
  check('plot.contents',serial([...$('forest-host').childNodes].map(n=>n===svg?'svg':bars.includes(n)?'bar':'unexpected')),serial(['bar','svg']),'exact');
}
function evaluate(c,r,page,check,replaying) {
  const a=window._almLastCorrMA();
  check('status',a ? 'ok':'refused',r.status,'exact');
  check('controls',controls(c.method,c.text,replaying),true,'exact');
  check('page_text',serial(pageText()),serial(page),'exact');
  display(a,check);
  if(r.status==='refused') return;
  // Validate provenance within the existing field check to retain the pinned count.
  const build=window.AlmBuildInfo;
  const actual={fields:a ? Object.keys(a).sort():[]};
  const expected={fields:(build ? [...FIELDS,'producedBy']:FIELDS).slice().sort()};
  if(build) {
    const p=a?.producedBy;
    actual.producedBy=p && typeof p==='object' && !Array.isArray(p)
      ? {fields:Object.keys(p).sort(),version:p.version,sha:p.sha}:null;
    expected.producedBy={fields:['sha','version'],version:build.version,sha:build.sha};
  }
  check('output.fields',serial(actual),serial(expected),'exact');
  check('schema',a?._schema,'corr-ma-results-v1','exact');
  check('k',a?.k,r.k,'exact'); check('method',a?.method,r.method,'exact');
  check('membership',serial(a?.studies),serial(r.studies.map(s=>({label:s.label,r:s.r,n:s.n}))),'exact');
  NUMBERS.forEach(q=>check(q,q==='I2' ? a?.[q]/100 : a?.[q],q==='I2'?r[q]/100:r[q],q==='tau2_z'&&['REML','PM'].includes(c.method)?'tau2':'rel'));
  const cells=[...$('res-body').querySelectorAll('tr')];
  r.studies.forEach((s,i)=>{
    const row=cells[i]?.querySelectorAll('td');
    check('display.reference.r',row?.[1]?.textContent,fmt(s.r),'exact');
    check('display.reference.n',row?.[2]?.textContent,String(s.n),'exact');
    check('display.reference.z',row?.[3]?.textContent,fmt(r.z[i]),'exact');
    // Check the underlying weights at full precision; display consistency is exact above.
    const weights=a?.studies.map(s=>1/(1/(s.n-3)+a.tau2_z))||[];
    check('weight',100*weights[i]/weights.reduce((x,y)=>x+y,0),r.weights[i],'rel');
  });
  plot(r,check);
}
async function verified(files) {
  const objects=[];
  for(const f of CONTRACT.files) {
    const bytes=files[f.path];
    if(!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) throw Error('Raw pinned bytes required: '+f.path);
    objects.push(await AlmValidate.verify(bytes,f.sha256,f.path));
  }
  const [cs,rs]=objects;
  if(cs.length!==CONTRACT.configurations || rs.configurations.length!==cs.length || new Set(cs.map(c=>c.id)).size!==cs.length) throw Error('Configuration cardinality mismatch');
  cs.forEach((c,i)=>{if(c.id!==rs.configurations[i].id || !METHODS.includes(c.method) || !['ok','refused'].includes(rs.configurations[i].status)) throw Error('Reference coverage mismatch');});
  return [cs,rs];
}
async function replay(files,progress=()=>{}) {
  const [cs,rs]=await verified(files), snap=window.__almCorrValidationSnapshot();
  const controlsSaved=[$('f-data'),$('f-method')].map(e=>[e,e.disabled]);
  const result={checks:0,passed:0,failed:[],maxima:{},refusals:[]};
  try {
    controlsSaved.forEach(([e])=>{e.disabled=true;});
    for(let i=0;i<cs.length;i++) {
      const c=cs[i],r=rs.configurations[i];
      $('f-data').value=c.text; $('f-method').value=c.method;
      window.__almCorrValidationRun();
      window.alm.chartExportAuto.scan();
      // Let the shared chart export observer finish before checking its controls.
      await new Promise(resolve=>setTimeout(resolve,0));
      evaluate(c,r,rs.pageText,(quantity,app,ref,kind)=>{
        const tol=kind==='exact'?0:kind==='tau2'?1e-6:kind==='plot'?190e-9:1e-9;
        const d=AlmValidate.compare(app,ref,kind==='tau2'?'rel':kind==='plot'?'abs':kind,tol);
        result.checks++; if(d.pass) result.passed++; else result.failed.push({id:c.id,quantity,app,ref,tol,...d});
        result.maxima[quantity]=Math.max(result.maxima[quantity]||0,d.diff);
      },true);
      if(r.status==='refused') result.refusals.push(c.id);
      progress(`${i+1}/${cs.length} configurations; ${result.checks} checks`);
    }
  } finally {
    window.__almCorrValidationRestore(snap);
    controlsSaved.forEach(([e,d])=>{e.disabled=d;});
  }
  if(CONTRACT.checks && result.checks!==CONTRACT.checks) throw Error('Replay check cardinality mismatch: '+result.checks);
  result.summaryLines=[CONTRACT.rule,`${cs.length} configurations, including ${result.refusals.length} refused analyses. Full archived comparison: 149379 checks.`,
    'Strict R comparison: tau² relative 1e-6 for PM/REML; other numbers 1e-9 relative to max(1, |R|); I² on the fraction scale. SVG x coordinates allow 190 × 1e-9 (r-to-pixel scale). Text, labels, controls and refusal state are exact.'];
  return result;
}

function currentState() {
  window.__almCorrValidationRun();
  const a=window._almLastCorrMA();
  if(!a) throw Error('Page refused current analysis: need at least 2 valid studies');
  if(!METHODS.includes(a.method)) throw Error('Invalid method');
  const values=[],kind={},tolerance={default:1e-9};
  function add(key,value,how='rel',tol=1e-9){values.push({key,label:key,value});kind[key]=how;tolerance[key]=tol;}
  NUMBERS.forEach(q=>add(q,q==='I2'?a[q]/100:a[q],'rel',q==='tau2_z'&&['PM','REML'].includes(a.method)?1e-6:1e-9));
  add('k',a.k,'exact');
  let displayOK=true;
  display(a,(q,x,y)=>{if(x!==y)displayOK=false;});
  add('display',displayOK,'exact');
  add('controls',controls(a.method,$('f-data').value,false),'exact');
  adapter.live.compare={kind,tolerance};
  return {method:a.method,studies:a.studies,values,note:'Live metafor uses the current accepted studies. Numerical results, table/headline consistency and analysis controls are checked. Replay additionally checks the pinned static text, forest geometry and refusal corpus. Paper metafor 5.2-1; the self-hosted live build is 4.8-0.'};
}
function buildScript(s) {
  const nums=key=>s.studies.map(v=>{if(!finite(v[key]))throw Error('Nonfinite input');return String(v[key]);}).join(',');
  if(!METHODS.includes(s.method))throw Error('Invalid method');
  return `
r <- c(${nums('r')}); n <- c(${nums('n')}); k <- length(r)
e <- metafor::escalc(measure='ZCOR',ri=r,ni=n)
m <- metafor::rma(yi=e$yi,vi=e$vi,method='${s.method}',test='z',control=list(threshold=1e-12,maxiter=10000,stepadj=.5,tol=.Machine$double.eps^0.75))
mu <- as.numeric(coef(m)); se <- m[['se',exact=TRUE]]; tau <- m[['tau2',exact=TRUE]]
pi <- if('${s.method}'=='FE') c(NA_real_,NA_real_) else mu+c(-1,1)*qt(.975,k-1)*sqrt(tau+se^2)
out <- list(mu_z=mu,se_z=se,tau2_z=tau,I2=m[['I2',exact=TRUE]]/100,r=tanh(mu),r_lo=tanh(m[['ci.lb',exact=TRUE]]),r_hi=tanh(m[['ci.ub',exact=TRUE]]),r_pi_lo=tanh(pi[1]),r_pi_hi=tanh(pi[2]),k=k,display=TRUE,controls=TRUE)
emit <- function(x) if(is.logical(x)) {if(x)'true' else 'false'} else if(is.na(x)) 'null' else {stopifnot(is.finite(x));sprintf('%.17g',x)}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(out,emit,'')),collapse=','),'}\\n',sep='')
`;
}
const adapter={app:'correlation-ma',paper:{checks:149379,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Scope and R reproduction',runUrl:'validate/README.md',packageVersions:{metafor:'5.2-1'}},
  live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState,buildScript,appValues:s=>s.values,compare:{kind:{},tolerance:{default:1e-9}}},
  corpus:{files:CONTRACT.files,rawFiles:true,mode:'quick',quickChecks:CONTRACT.checks,run:replay},pageText};
window.AlmCorrValidationAdapter=adapter;
function mount(){
  window.AlmCorrValidation=AlmValidate.mount($('alm-validate'),adapter);
  const p=document.createElement('p');p.textContent=`Declared replay subset: ${CONTRACT.configurations} configurations / ${CONTRACT.checks} checks. ${CONTRACT.rule} Native chart downloads and browser rendering are separate checks.`;$('alm-validate').append(p);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
