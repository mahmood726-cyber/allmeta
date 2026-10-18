/* P16 replay: execute the shipped parser, engine, renderer and bus importer.
 * R numbers and page-display contracts are separate evidence. No estimator here.
 */
(function () {
'use strict';
const CONTRACT = {"files":[{"path":"validate/corpus/corpus.json","sha256":"5cbed5003e0be5ea822d4a1c3956dd50202dbcad07beaef9280cc1c7d2251e58","bytes":204100},{"path":"validate/corpus/reference.json","sha256":"68635555a64ac23e30e8dc90ff631ac9dd3ac966a2ad4c41a929316c2ffccc99","bytes":847105}],"checks":4627,"archived_checks":76601,"configurations":122,"archived_configurations":68,"supplementary_configurations":54,"rule":"First archived configuration in corpus order for each (model, measure, acceptance/reason, closed-loop availability, positive tau², global p<0.05) tuple; plus FE/DL/PM repeated-ID, singular-fit, empty/unsupported/multi-arm bus, eight R-checked bus transformations and a four-column variant of the first accepted configuration per model.","referenceVersions":{"R":"4.6.0","netmeta":"3.7-0","metafor":"5.2-1","meta":"8.5-0","metadat":"1.6-0"},"pageText":[["a",[null,null],["Skip to main content"]],["nav",["Back to allmeta hub",null],[["a",["Back to allmeta hub",null],["← allmeta"]]]],["header",[null,null],[["h1",[null,null],["NMA Inconsistency"]],["p",[null,null],["Detect inconsistency between direct and indirect evidence in network meta-analysis. Performs node-splitting (Dias et al. 2010) on every comparison with a closed loop, and a global design-by-treatment test (Higgins et al. 2012), restricted to independent two-arm studies."]]]],["main",[null,null],[["section",[null,null],[["h2",[null,null],["Input"]],["label",[null,null],[["span",[null,null],["Contrasts —",["code",[null,null],["A, B, effect, SE[, study ID]"]]]],["span",[null,null],["Independent two-arm studies only. Multiple rows per comparison allowed. Supply study IDs to detect repeated or multi-arm studies; correlated contrasts are unsupported."]]]],["label",[null,null],[["span",[null,null],["Model"]],["select",["F model",null],[["option",[null,null],["Fixed-effect (common τ²=0)"]],["option",[null,null],["Random-effects (Paule-Mandel τ²)"]],["option",[null,null],["Random-effects (DerSimonian-Laird τ²)"]]]],["span",[null,null],["RE models estimate shared τ² from consistency-model residuals before testing inconsistency — addresses the \"FE Q-statistics inflated under heterogeneity\" caveat below."]]]],["button",[null,null],["Run tests"]],["button",[null,"Import the shared ma-comparisons-v1 network (arm-level events/n), converted to contrast log-OR/RR for this app."],["Load from bus"]]]],["section",[null,null],[["h2",[null,null],["Node-split per comparison"]],["table",[null,null],[["thead",[null,null],[["tr",[null,null],[["th",[null,null],["Comparison"]],["th",[null,null],["Direct"]],["th",[null,null],["Indirect"]],["th",[null,null],["Difference"]],["th",[null,null],["z"]],["th",[null,null],["p"]],["th",[null,null],[]]]]]]]],["h2",[null,null],["Design-by-treatment (global)"]],["h2",[null,null],["Net-split forest"]],["div",[null,null],[["strong",[null,null],["Reading the plot:"]],"direct and indirect whiskers should overlap for a consistent network. Non-overlapping whiskers with |z|",">","1.96 indicate a specific loop with inconsistency. The global design-by-treatment test is the omnibus check."]]]],["div",[null,null],[["div",["Continue this analysis with another tool",null],[["span",[null,null],["Continue with →"]],["button",[null,"Full network meta-analysis platform"],["NMA Pro v2"]],["button",[null,"Contrast-based GLS pooling"],["NMA (frequentist)"]],["button",[null,"decomp.design + Cochrane Q"],["Global inconsistency"]],["button",[null,"Indirect comparison (single loop)"],["Bucher ITC"]]]]]]]],["div",[null,null],[["div",[null,null],[["button",[null,"Readable Methods + Results report (Markdown)"],["Methods+Results (.md)"]],["button",[null,"Readable Methods + Results report (plain text)"],[".txt"]],["button",[null,null],["JSON"]],["button",[null,null],["CSV"]],["button",[null,null],["Data (.md)"]]]]]],["footer",[null,null],["For independent two-arm studies, removing each direct comparison gives the same split as netmeta back-calculation / SIDE at a fixed shared τ². RE global Q uses this consistency-model τ² as a preset; it is not the default within-design τ² test from decomp.design. Node-splitting: Dias S et al.",["em",[null,null],["Stat Med"]],"2010;29:932-944. Design-by-treatment inconsistency model: Higgins JPT, Jackson D, Barrett JK et al.",["em",[null,null],["Res Synth Methods"]],"2012;3:98-110.",["strong",[null,null],["R-parity:"]],"the fixed-effect engine matches",["code",[null,null],["netmeta(common=TRUE)"]],"+",["code",[null,null],["netsplit()"]],"+",["code",[null,null],["decomp.design()"]],"to 1e-4 on network estimates, per-comparison direct/indirect/diff/z/p, and the design-by-treatment Q/df/p (exact χ²; see",["code",[null,null],["hub/shared/tests/nma-inconsistency-parity.spec.mjs"]],").",["strong",[null,null],["Random-effects (2026-06-03):"]],"select PM or DL above to use shared τ² inflated weights (τ² from the consistency-model residuals) for both consistency and inconsistency models — addresses the prior FE-only caveat. The DL path matches",["code",[null,null],["netmeta(random=TRUE, method.tau=\"DL\")"]],"τ², network estimates and",["code",[null,null],["netsplit()"]],"using the generalized DerSimonian-Kacker/Jackson moment denominator (see",["code",[null,null],["hub/shared/tests/nma-inconsistency-re-parity.spec.mjs"]],"); PM uses the generalized Paule-Mandel",["code",[null,null],["Q(τ²)=df"]],"moment condition. Recommended k≥5 per design."]]]}; // generated by build-fixtures.cjs
const $ = id => document.getElementById(id);
const eq = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const normal = s => s.replace(/\s+/g, ' ').trim();
const SKIP = 'script,style,textarea,#alm-validate,#ns-body,#dbt,#ns-plot,.alm-xbar';
// Text-node positions and accessible labels, including shared continue/export controls.
// Dynamic chart-download controls are audited separately; overlays outside landmarks are not template.
function pageText() {
  function visit(e) {
    if (e.nodeType === 3) return normal(e.textContent) || null;
    if (e.nodeType !== 1 || e.matches(SKIP)) return null;
    return [e.localName.toLowerCase(), ['aria-label','title'].map(k => e.getAttribute(k)),
      [...e.childNodes].map(visit).filter(x => x !== null)];
  }
  return [...document.body.children].filter(e => e.matches('a,nav,header,main,footer,#alm-export-mount')).map(visit).filter(Boolean);
}
// Canonical DOM, independent of browser attribute order and HTML serialisation.
function tree(e) {
  if (e.nodeType === 3) return normal(e.textContent) || null;
  if (e.nodeType !== 1) return null;
  return [e.localName.toLowerCase(), [...e.attributes].filter(a => !a.name.startsWith('data-alm-')).map(a => [a.name,a.value]).sort((a,b) => a[0].localeCompare(b[0])),
    [...e.childNodes].map(tree).filter(x => x !== null)];
}
function display() { return ['ns-body','dbt','ns-plot'].map(id => tree($(id))); }
function controls(model, text) {
  const ids = ['src','f-model','btn-run','btn-bus-load'];
  return eq([...$('f-model').options].map(o => [o.value,o.textContent]), [
    ['FE','Fixed-effect (common τ²=0)'],['PM','Random-effects (Paule-Mandel τ²)'],['DL','Random-effects (DerSimonian-Laird τ²)']
  ]) && [...document.querySelectorAll('main button,#alm-export-mount button')].filter(b=>!b.closest('#alm-validate')).every(b=>!b.disabled && !b.closest('fieldset[disabled],[inert]')) && $('src').getAttribute('aria-label')==='Input' && $('f-model').getAttribute('aria-label')==='F model' && $('f-model').value === model && $('src').value === text && ids.every(id => {
    const e = $(id); return e && !e.disabled && !e.readOnly && !e.hasAttribute('aria-disabled') && !e.closest('fieldset[disabled],[inert]');
  });
}
function chartControls() {
  return [...document.querySelectorAll('.alm-xbar')].every(bar =>
    bar.getAttribute('aria-label')==='Download chart' && bar.querySelector('.alm-xbar__lbl')?.textContent==='⬇' &&
    eq([...bar.querySelectorAll('button')].map(b => [b.textContent.trim(),b.getAttribute('aria-label'),!!b.disabled]), ['SVG','PNG','JPG','PDF'].map(f=>[f,'Download chart as '+f,false])));
}
function snapshot() {
  return {text:$('src').value, model:$('f-model').value, state:window._almLastInco(),
    html:['ns-body','dbt','ns-plot'].map(id => $(id).innerHTML), box:$('ns-plot').getAttribute('viewBox'),
    bus:localStorage.getItem('ma-comparisons-v1'), draft:localStorage.getItem('alm-autosave:nma-inconsistency')};
}
function restore(s) {
  $('src').value=s.text; $('f-model').value=s.model;
  window.__almIncoValidationRestore(s.state);
  ['ns-body','dbt','ns-plot'].forEach((id,i) => { $(id).innerHTML=s.html[i]; });
  $('ns-plot').setAttribute('viewBox',s.box);
  for (const [key,value] of [['ma-comparisons-v1',s.bus],['alm-autosave:nma-inconsistency',s.draft]]) {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key,value);
  }
}
function execute(c) {
  $('f-model').value=c.model;
  // Seed accepted results first, so every refusal must also clear a previous result.
  window.__almIncoLoad('A,B,.2,.1\nB,C,.3,.2\nA,C,.6,.15');
  if (c.bus) {
    if (c.bus.empty) window.MaComparisons.clear();
    else window.MaComparisons.write(c.bus.studies,c.bus.measure);
    // Dispatching a click does not dispatch the input event used by autosave.
    // The importer's input event is stopped only during this synchronous replay.
    $('btn-bus-load').click();
  } else window.__almIncoLoad(c.text);
  return window._almLastInco();
}
async function verified(loaded) {
  const decoded=[];
  for (const f of CONTRACT.files) {
    const raw=loaded[f.path];
    if (!(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) throw Error('Original pinned bytes required: '+f.path);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if (hash!==f.sha256) throw Error('SHA-256 mismatch; refused: '+f.path);
    decoded.push(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
  }
  return decoded;
}
// Flatten only declared reference quantities, and compare exact membership separately.
function leaves(x, prefix='', out=[]) {
  if (x === null || typeof x !== 'object') out.push({key:prefix,value:x});
  else for (const [k,v] of Object.entries(x)) leaves(v,prefix ? prefix+'.'+k : k,out);
  return out;
}
function referenceState(r) {
  if (r.status==='refused') return {status:r.status,reason:r.reason};
  const out={};
  for (const k of ['model','trts','Q','df','tau2','Qrandom','estimates','estimatesRandom','dbt']) out[k]=r[k];
  out.nodeSplit=r.nodeSplit.map(({kDirect,...s})=>s).sort((a,b)=>a.comparison.localeCompare(b.comparison));
  return out;
}
function sortedState(s) { return s?.nodeSplit ? {...s,nodeSplit:[...s.nodeSplit].sort((a,b)=>a.comparison.localeCompare(b.comparison))} : s; }
function shape(x) {
  if(x===null || typeof x!=='object')return x===null?'null':typeof x;
  return Array.isArray(x)?['array',x.map(shape)]:['object',Object.keys(x).sort().map(k=>[k,shape(x[k])])];
}
let running=false;
async function replay(loaded, progress) {
  if(running) throw Error('Replay already running');
  running=true;
  let saved;
  const stop=e=>{if(e.target===$('src'))e.stopImmediatePropagation();};
  try {
    const [corpus,reference]=await verified(loaded);
    if(corpus.length!==CONTRACT.configurations || reference.cases.length!==corpus.length || new Set(corpus.map(c=>c.key)).size!==corpus.length || !corpus.every((c,i)=>c.key===reference.cases[i].key)) throw Error('Evidence cardinality or keys differ');
    saved=snapshot(); window.addEventListener('input',stop,true);
    let checks=0,passed=0; const failed=[],maxima={},refusals={expected:0,matched:0};
    function check(id,quantity,app,ref,tol=0,absolute=false) {
      const numeric=typeof ref==='number' && tol>0;
      const diff=numeric ? (typeof app==='number' && Number.isFinite(app) ? Math.abs(app-ref)/(absolute?1:Math.max(1,Math.abs(ref))) : Infinity) : eq(app,ref)?0:Infinity;
      const pass=diff<=tol; checks++; if(pass)passed++; else failed.push({id,quantity,app,ref,diff,tol});
      maxima[quantity]=Math.max(maxima[quantity]||0,diff);
    }
    corpus.forEach((c,i)=>{
      const ref=reference.cases[i],s=execute(c),state=sortedState(s), expected=ref.numeric && referenceState(ref.numeric);
      if(expected) {
        const actual=new Map(leaves(state).map(x=>[x.key,x.value]));
        for(const q of leaves(expected)) check(c.key,q.key,actual.get(q.key),q.value,typeof q.value==='number' && !/^(df|trts\.)|\.df$/.test(q.key) ? (c.model==='PM' && !q.key.startsWith('estimates.') && q.key!=='Q' ? 1e-6:1e-9):0, /(^|\.)p$/.test(q.key));
        // p-values never inherit the PM tolerance.
        for(const q of leaves(expected).filter(x=>/(^|\.)p$/.test(x.key))) check(c.key,'absolute.'+q.key,actual.get(q.key),q.value,typeof q.value==='number'?1e-9:0,true);
        check(c.key,'result_membership',shape(state),shape(expected));
      }
      check(c.key,'parsed_rows',window.parse($('src').value),ref.parsed);
      if(c.inputReference) c.inputReference.forEach((r,j)=>['A','B','te','se'].forEach(k=>check(c.key,`bus_input.${j}.${k}`,window.parse($('src').value)[j]?.[k],r[k],typeof r[k]==='number'?1e-9:0)));
      check(c.key,'controls',controls(c.model,ref.text),true);
      check(c.key,'page_text',pageText(),reference.pageText);
      check(c.key,'chart_controls',chartControls(),true);
      display().forEach((v,j)=>check(c.key,['table','global','plot'][j],v,ref.display[j]));
      if(ref.reason) { refusals.expected++; const ok=s?.status==='refused'&&s.reason===ref.reason; if(ok)refusals.matched++; check(c.key,'refusal',s,{status:'refused',reason:ref.reason}); }
      if(progress)progress(i+1,corpus.length);
    });
    if(CONTRACT.checks && checks!==CONTRACT.checks) throw Error('Replay check cardinality mismatch: '+checks);
    return {checks,passed,failed,maxima,refusals,summaryLines:[CONTRACT.rule,`${corpus.length} configurations; numerical R parity, exact generated display and page text. Refusals are support checks, not numerical passes.`]};
  } finally { if(saved) {restore(saved);window.removeEventListener('input',stop,true);} running=false; }
}
const adapter={app:'nma-inconsistency',paper:{checks:76601,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Scope and R reproduction',runUrl:'validate/README.md',packageVersions:{netmeta:'3.7-0',metafor:'5.2-1'}},
  corpus:{files:CONTRACT.files,rawFiles:true,mode:'quick',quickChecks:CONTRACT.checks,run:replay},
  pageText,display,controls,chartControls,snapshot,restore,execute,leaves,referenceState,sortedState,contract:CONTRACT};
window.AlmIncoValidationAdapter=adapter;
// live.js supplies the current-analysis R tier and mounts the shared widget.
})();
