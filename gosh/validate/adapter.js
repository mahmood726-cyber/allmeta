(function(){
'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const summaries=['n_subsets','median_est','median_i2','min_est','max_est','q25_est','q75_est'];
function field(x,k){if(!x||!Object.hasOwn(x,k))throw Error('Missing field '+k);return x[k];}
function members(p,k){const m=field(p,'members');if(!Array.isArray(m)||!m.length||m.some(x=>!Number.isInteger(x)||x<1||x>k)||new Set(m).size!==m.length)throw Error('Invalid membership');return [...m].sort((a,b)=>a-b).join(',');}
function keyed(points,k){if(!Array.isArray(points))throw Error('Missing points');const seen=new Map(),out=new Map();for(const p of points){const m=members(p,k),n=seen.get(m)||0;seen.set(m,n+1);out.set(m+'#'+n,p);}return out;}
function source(c){const k=field(c,'k');for(const q of ['te','se','source_rows']){const a=field(c,q);if(!Array.isArray(a)||a.length!==k||a.some(x=>!finite(x)))throw Error('Invalid source '+q);}if(!Number.isInteger(k)||k<3||c.se.some(x=>x<=0)||c.source_rows.some(x=>!Number.isInteger(x)||x<1)||new Set(c.source_rows).size!==k)throw Error('Invalid source rows');}
function display(s){
 const cards=[...document.querySelectorAll('.metrics > .card')];
 const labels=['Subsets computed','Median estimate','Median I²'];
 const values=s===null?['\u2014','\u2014','\u2014']:[s.n_subsets.toLocaleString(),s.median_est.toFixed(3),s.median_i2.toFixed(1)+'%'];
 const section=document.querySelector('.metrics').parentElement;
 const headings=[...section.children].filter(x=>x.tagName==='H2');
 return headings.length===2&&headings[0].textContent==='Summary'&&headings[1].textContent==='GOSH scatter'&&cards.length===3&&cards.every((card,i)=>card.children.length===2&&card.children[0].className==='k'&&card.children[1].className==='v'&&card.children[0].textContent===labels[i]&&card.children[1].textContent===values[i]);
}
function samplingVisible(expected){const el=document.getElementById('sample-label');return el.style.display===(expected?'block':'none')&&el.checkVisibility()===expected;}
const MODEL_LABELS={FE:'Fixed effect',DL:'Random effects (DerSimonian-Laird)'};
function controls(model,draws){
 const select=document.getElementById('model'),opts=[...select.options],chosen=[...select.selectedOptions];
 return JSON.stringify(opts.map(o=>[o.value,o.textContent]))===JSON.stringify(Object.entries(MODEL_LABELS))&&select.value===model&&chosen.length===1&&chosen[0].value===model&&chosen[0].textContent===MODEL_LABELS[model]&&(draws===null||Number(document.getElementById('n-sample').value.trim())===draws);
}
const STATUS_IDS=['plot-error','plot-note','sample-error'];
function statusClear(ids){const axisError=document.querySelector('#alm-axis-mount [data-error]');return ids.every(id=>document.getElementById(id).textContent==='')&&!!axisError&&axisError.textContent==='';}
// Replay renders with the page's default axes ({}): X unset, Y 0-100, both linear.
const AXIS_DEFAULT=[['X axis (pooled effect)','X axis (pooled effect) axis minimum','','X axis (pooled effect) axis maximum','',false],['Y axis (I², 0–100%)','Y axis (I², 0–100%) axis minimum','0','Y axis (I², 0–100%) axis maximum','100',false]];
function axisInputs(){return [...document.querySelectorAll('#alm-axis-mount input')];}
function axisRows(){return [...document.querySelectorAll('#alm-axis-mount .alm-axis-row')].map(row=>{const label=row.querySelector('label'),min=row.querySelector('[data-edge=min]'),max=row.querySelector('[data-edge=max]'),log=row.querySelector('[data-edge=log]');return [label?.textContent,min?.getAttribute('aria-label'),min?.value,max?.getAttribute('aria-label'),max?.value,log?.checked];});}
function axisDefault(){return JSON.stringify(axisRows())===JSON.stringify(AXIS_DEFAULT)&&axisInputs().length===6;}
function setAxisDefault(){const rows=[...document.querySelectorAll('#alm-axis-mount .alm-axis-row')];rows.forEach((row,i)=>{const d=AXIS_DEFAULT[i];if(!d)return;row.querySelector('[data-edge=min]').value=d[2];row.querySelector('[data-edge=max]').value=d[4];row.querySelector('[data-edge=log]').checked=d[5];});const e=document.querySelector('#alm-axis-mount [data-error]');if(e)e.textContent='';}
// Page template text and structure: every visible text node and every aria-label/title in the page's own landmarks (skip link, nav, header, main,
// footer), in document order, outside the validation panel. This includes the benchmark-dataset selector, citation and undo controls.
// Regions with their own exact checks (summary cards and headings, model selector, axis-row quantity labels, plot, status messages)
// and the user's own data (textarea) are excluded. Overlays that shared scripts append to <body> at runtime (citation dialog, glossary
// tooltips) are not part of the template; the autosave draft banner has its own exact contract below.
const TEMPLATE_ROOTS=['A','NAV','HEADER','MAIN','FOOTER'];
const TEXT_SKIP='#alm-validate,#plot,.metrics,section:has(.metrics) > h2,#plot-error,#plot-note,#sample-error,textarea,script,style,#model,#alm-axis-mount [data-error],.alm-axis-row > label:first-of-type,#alm-csv-mount [data-section=warnings]';
function templateRoots(){return [...document.body.children].filter(e=>TEMPLATE_ROOTS.includes(e.tagName));}
// Each text is recorded with its element path from the landmark (tag and position among element siblings at every level), so
// text moved between cells, rows or containers fails even when the reading order is unchanged.
function path(e,root){const p=[];for(;e&&e!==root;e=e.parentElement)p.push(e.tagName+[...e.parentElement.children].indexOf(e));return [root.tagName,...p.reverse()].join('>');}
function pageText(){
 const panel=document.querySelector('#alm-plot-mount > fieldset');
 if(!window.alm?.plotExport?.statusContract(panel))return 'Invalid plot export panel/status';
 const exportStatus=panel.lastElementChild;
 const texts=[],attrs=[];
 for(const root of templateRoots()){
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){if(n.parentElement===exportStatus||n.parentElement.closest(TEXT_SKIP))continue;const t=n.textContent.replace(/\s+/g,' ').trim();if(t)texts.push([path(n.parentElement,root),t]);}
  for(const e of [root,...root.querySelectorAll('[aria-label],[title]')])if((e.hasAttribute('aria-label')||e.hasAttribute('title'))&&!e.closest('#alm-validate,#plot'))attrs.push([e.id||e.tagName,e.getAttribute('aria-label'),e.getAttribute('title')]);
 }
 return JSON.stringify({roots:templateRoots().map(e=>e.tagName),texts,attrs});
}
// The autosave draft banner (shared/autosave.js) is absent, or exactly: "Draft from N min|h ago found. Restore?" + Restore + Discard.
function draftBannerOk(){
 const banners=[...document.body.children].filter(e=>e.tagName==='DIV'&&e.getAttribute('role')==='status'&&e.getAttribute('aria-live')==='polite');
 if(banners.length===0)return true;
 if(banners.length!==1)return false;
 const c=[...banners[0].children];
 return c.length===3&&c[0].tagName==='SPAN'&&/^Draft from [1-9]\d* (min|h) ago found\. Restore\?$/.test(c[0].textContent)&&c[1].tagName==='BUTTON'&&c[1].textContent==='Restore'&&c[2].tagName==='BUTTON'&&c[2].textContent==='Discard'&&banners[0].textContent===c[0].textContent+'RestoreDiscard';
}
// CSV import warnings (hub/shared/csv-upload.js) must be exactly the importer's own records for the last import, as the importer renders
// them (bullet + space + message, joined by newlines), or empty before any import. The page records those records in onParse, so the
// mapped column, distance, row numbers and the echoed header or cell text (the user's data, which may contain quotes or line breaks)
// are all compared exactly.
function csvWarningsOk(){
 const el=document.querySelector('#alm-csv-mount [data-section=warnings]');
 if(!el||el.children.length)return false;
 const records=window.__almGoshImportWarnings;
 if(records===undefined)return el.textContent==='';
 return Array.isArray(records)&&records.every(x=>typeof x==='string')&&el.textContent===records.map(x=>'• '+x).join('\n');
}
function pageTextOk(){return pageText()===PAGE_TEXT&&draftBannerOk()&&csvWarningsOk();}
const PAGE_TEXT=JSON.stringify({"roots":["A","NAV","HEADER","MAIN","FOOTER"],"texts":[["A","Skip to main content"],["NAV>A0","← allmeta"],["HEADER>H10","GOSH plot — all-subset meta-analysis"],["HEADER>P1","Graphical display of study heterogeneity (Olkin, Dahabreh, Trikalinos 2012). For every non-empty subset of studies, compute the pooled estimate and"],["HEADER>P1>SPAN0","I²"],["HEADER>P1","under a fixed-effect or DL random-effects model. Each subset becomes one dot; clusters suggest influential studies or subgroup structure. For k > 15 the engine uses random sampling (advanced-stats.md)."],["MAIN>SECTION0>H20","Input"],["MAIN>SECTION0>LABEL1>SPAN0","Studies —"],["MAIN>SECTION0>LABEL1>SPAN0>CODE0","effect, SE, label"],["MAIN>SECTION0>LABEL1>SPAN0","(per line)"],["MAIN>SECTION0>BUTTON2","Run analysis"],["MAIN>SECTION0>DIV3","Analysis updated"],["MAIN>SECTION0>DIV4","Results out of date — press Run analysis"],["MAIN>SECTION0>DIV5>DIV0>DIV0>LABEL0","Upload CSV:"],["MAIN>SECTION0>DIV5>DIV0>DIV0>SPAN1","or paste below:"],["MAIN>SECTION0>DIV5>DIV0>DIV2>BUTTON0","Parse pasted text"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>SUMMARY0","Expected CSV format"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>THEAD0>TR0>TH0","column"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>THEAD0>TR0>TH1","type"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>THEAD0>TR0>TH2","required"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>THEAD0>TR0>TH3","example"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR0>TD0","yi"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR0>TD1","float"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR0>TD2","yes"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR0>TD3","0.22"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR1>TD0","vi"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR1>TD1","float"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR1>TD3","0.0064"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR2>TD0","sei"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR2>TD1","float"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR2>TD3","0.08"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR3>TD0","study"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR3>TD1","string"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>TABLE1>TBODY1>TR3>TD3","S1"],["MAIN>SECTION0>DIV5>DIV0>DETAILS4>P2>BUTTON0","Download sample CSV"],["MAIN>SECTION0>DIV6>DIV0>SPAN0","Try with:"],["MAIN>SECTION0>DIV6>DIV0>SELECT1>OPTION0","— pick a dataset —"],["MAIN>SECTION0>DIV6>DIV0>SELECT1>OPTION1","BCG vaccine (Berkey 1995, log-RR)"],["MAIN>SECTION0>DIV7>BUTTON0","📑 Cite as"],["MAIN>SECTION0>SPAN8","k ≤ 15 studies: full enumeration (2ᵑ − 1 subsets). k > 15: random sampling (Olkin & Dahabreh 2012 recommendation)."],["MAIN>SECTION0>LABEL9>SPAN0","Pooling model"],["MAIN>SECTION0>LABEL10>SPAN0","Random subsets to draw (k > 15)"],["MAIN>SECTION0>LABEL10>SPAN2","App default: 5,000 draws; enter a whole number from 1 to 100,000 (cap limits browser workload). Uniform subset size from 2 to k, with replacement. This differs from metafor."],["MAIN>SECTION0>DIV11>BUTTON0","Load from bus"],["MAIN>SECTION0>DIV11>BUTTON1","Save to bus"],["MAIN>SECTION0>DIV11>BUTTON2","Verify in R"],["MAIN>SECTION0>DIV11>BUTTON3","TruthCert receipt"],["MAIN>SECTION0>DIV11>BUTTON4","🔑 Key"],["MAIN>SECTION0>DIV12>DIV0>DIV0>SPAN1","min"],["MAIN>SECTION0>DIV12>DIV0>DIV0>SPAN3","max"],["MAIN>SECTION0>DIV12>DIV0>DIV0>LABEL5","log"],["MAIN>SECTION0>DIV12>DIV0>DIV1>SPAN1","min"],["MAIN>SECTION0>DIV12>DIV0>DIV1>SPAN3","max"],["MAIN>SECTION0>DIV12>DIV0>DIV1>LABEL5","log"],["MAIN>SECTION0>DIV13>DIV0>BUTTON0","Undo"],["MAIN>SECTION0>DIV13>DIV0>BUTTON1","Clear all"],["MAIN>SECTION0>DIV13>DIV0>DIALOG2>P0","Clear all data? This cannot be undone."],["MAIN>SECTION0>DIV13>DIV0>DIALOG2>FORM1>BUTTON0","Cancel"],["MAIN>SECTION0>DIV13>DIV0>DIALOG2>FORM1>BUTTON1","Clear"],["MAIN>SECTION1>DIV6>SPAN0","Download plots:"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>LEGEND0","Download plots"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>P1","Choose plots and a format. Each plot downloads as a separate file. Resolution applies to raster exports; width is the printed width."],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>LABEL2","GOSH scatter"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>BUTTON3","Select all"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>BUTTON4","Select none"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>LABEL5","Format"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>SELECT6>OPTION0","PNG"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>SELECT6>OPTION1","SVG"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>SELECT6>OPTION2","TIFF"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>SELECT6>OPTION3","PDF"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>LABEL7","Resolution"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>SELECT8>OPTION0","300 dpi"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>SELECT8>OPTION1","600 dpi"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>LABEL9","Physical width"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>SELECT10>OPTION0","85 mm"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>SELECT10>OPTION1","170 mm"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>BUTTON11","Download selected"],["MAIN>SECTION1>DIV6>DIV1>FIELDSET0>BUTTON12","Download GOSH scatter"],["MAIN>SECTION1>DIV7>SPAN0","Export results:"],["MAIN>SECTION1>DIV7>DIV1>DIV0>BUTTON0","Methods+Results (.md)"],["MAIN>SECTION1>DIV7>DIV1>DIV0>BUTTON1",".txt"],["MAIN>SECTION1>DIV7>DIV1>DIV0>BUTTON2","JSON"],["MAIN>SECTION1>DIV7>DIV1>DIV0>BUTTON3","CSV"],["MAIN>SECTION1>DIV7>DIV1>DIV0>BUTTON4","Data (.md)"],["MAIN>SECTION1>DIV8>STRONG0","Interpretation:"],["MAIN>SECTION1>DIV8","multimodal clustering indicates subgroup heterogeneity (the meta-analysis averages two or more distinct populations). A thick “horizontal band” at one estimate means most subsets converge on the same answer — homogeneous evidence. Streaks along the"],["MAIN>SECTION1>DIV8>SPAN1","I²"],["MAIN>SECTION1>DIV8","axis often indicate one or two highly influential outliers."],["MAIN>DIV2>DIV0>SPAN0","Continue with →"],["MAIN>DIV2>DIV0>BUTTON1","Forest plot"],["MAIN>DIV2>DIV0>BUTTON2","Heterogeneity"],["MAIN>DIV2>DIV0>BUTTON3","Influence diagnostics"],["FOOTER","Olkin I, Dahabreh IJ, Trikalinos TA. GOSH — a graphical display of study heterogeneity."],["FOOTER>EM0","Res Synth Methods"],["FOOTER","2012;3(3):214–23. Subgroup structure interpretation aligns with"],["FOOTER>EM1","Cochrane Handbook v6.5 §10.10.2"],["FOOTER","on detecting influential studies;"],["FOOTER>SPAN2","I²"],["FOOTER","interpretation per §10.10.2 (low <30%, moderate 30–60%, substantial 50–90%, considerable 75–100%). For k > 15 this app draws 5,000 subsets by default, choosing sizes uniformly from 2 to k, with replacement, using a fixed seed. This differs from"],["FOOTER>CODE3","metafor::gosh()"],["FOOTER",", which enumerates all non-empty subsets when 2^k - 1 is at most 1,000,000 (k up to 19), and otherwise draws 1,000,000 subsets by default with binomial size probabilities. Full enumeration here includes single-study subsets."]],"attrs":[["NAV","Back to allmeta hub",null],["hub-back","Back to allmeta hub",null],["src","Input",null],["alm-hero-mount","Load a famous benchmark dataset",null],["SELECT","Load a benchmark dataset",null],["alm-cite-btn",null,"Show suggested citations"],["model","Model",null],["n-sample","App default: 5,000 draws. Larger = more accurate density but slower.",null],["btn-bus-load",null,"Load studies from the shared ma-studies-v1 bus"],["btn-bus-save",null,"Save current studies to the shared ma-studies-v1 bus"],["btn-verify-in-r",null,"Push current studies to the shared bus and open WebR Validator pre-loaded with metafor — independent R verification in your browser."],["btn-truthcert",null,"Download an HMAC-signed TruthCert receipt of the current studies — re-verifiable offline with your signing key."],["btn-truthcert-key",null,"Set or generate the TruthCert signing key (shared across all allmeta apps)."],["INPUT","X axis (pooled effect) axis minimum",null],["INPUT","X axis (pooled effect) axis maximum",null],["INPUT","Y axis (I², 0–100%) axis minimum",null],["INPUT","Y axis (I², 0–100%) axis maximum",null],["BUTTON",null,"Readable Methods + Results report (Markdown)"],["BUTTON",null,"Readable Methods + Results report (plain text)"],["DIV","Continue this analysis with another tool",null],["BUTTON",null,"Visualise individual study effects + pooled diamond"],["BUTTON",null,"I², τ², Q, prediction interval"],["BUTTON",null,"Per-study leave-one-out, Cook's D, hat values"]]});
function capture(c,model){return window.__almGoshValidationRun(c.te.map((v,i)=>`${v}, ${c.se[i]}, ${c.source_rows[i]}`).join('\n'),model,5000,{});}
function plotChecks(points,check){
 const circles=[...document.querySelectorAll('#plot circle')];check('plotted_count',circles.length,points.length,'exact');
 const xs=points.map(p=>p.mu),lo=Math.min(...xs),hi=Math.max(...xs),scale=Math.max(Math.abs(lo),Math.abs(hi));
 const pad=Math.max(scale?Math.max((hi/scale-lo/scale)*.1,8*Number.EPSILON)*scale:.1,Number.MIN_VALUE);
 const xmin=Math.max(-Number.MAX_VALUE,lo-pad),xmax=Math.min(Number.MAX_VALUE,hi+pad);
 function fraction(v,a,b){const eps=8*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)),dl=Math.abs(v-a),dh=Math.abs(v-b);if(Math.min(dl,dh)<=eps)v=dl<=dh?a:b;const scale=Math.max(Math.abs(a),Math.abs(b));return(v/scale-a/scale)/(b/scale-a/scale);}
 for(let i=0;i<points.length;i++){const p=points[i],c=circles[i];for(const [axis,expected] of [['x',60+fraction(p.mu,xmin,xmax)*520],['y',20+(1-fraction(p.I2,0,100))*350]]){const raw=c?.getAttribute('c'+axis);check('plot_'+axis,raw===null||raw===undefined?undefined:Number(raw),expected,'abs');}}
 const ticks=[xmin,xmin*.5+xmax*.5,xmax];
 const magnitude=Math.max(...ticks.map(Math.abs)),scientific=magnitude!==0&&(magnitude<1e-4||magnitude>=1e7);let labels;
 for(let digits=2;digits<=17;digits++){labels=ticks.map(x=>scientific?x.toExponential(digits):x.toFixed(digits));if(labels.every((x,i)=>i===0||ticks[i]===ticks[i-1]||x!==labels[i-1]))break;if(digits===17)labels=ticks.map(String);}
 const expected=['0%','25%','50%','75%','100%',...labels,'Pooled effect','I²'];
 check('axis_labels',JSON.stringify([...document.querySelectorAll('#plot text')].map(x=>x.textContent)),JSON.stringify(expected),'exact');
}
function validatePoint(p,k,model,sampled,reference){members(p,k);for(const q of ['mu','I2','Q','k',...(model==='DL'&&p.k>1?['tau2']:[]),...(sampled?['se']:[])])if(!finite(field(p,q)))throw Error('Invalid '+(reference?'reference':'app')+' '+q);if(p.k!==p.members.length)throw Error('Subset k mismatch');}
function compareRecord(c,model,a,r,check){
 if(c.k>100){
  check('cap_refusal',a.summary,null,'null');
  check('cap_export',window._almLastGosh(),null,'null');
  check('cap_points',JSON.stringify(a.points),'[]','exact');
  check('cap_empty',document.getElementById('plot').innerHTML,'','exact');
  check('display',display(null),true,'exact');
  check('sampling_control_visibility',samplingVisible(false),true,'exact');
  check('controls',controls(model,5000),true,'exact');
  check('status_messages',statusClear(STATUS_IDS),true,'exact');
  check('axis_controls',axisDefault(),true,'exact');
  check('page_text',pageTextOk(),true,'exact');
  return;
 }
 const s=field(a,'summary'),rs=field(r,'summary');if(!s||r.refused!==false)throw Error('Unexpected refusal');
 const aa=keyed(a.points,c.k),rr=keyed(r.points,c.k);
 check('model',s.model,model,'exact');check('input_k',s.k,c.k,'exact');check('sampling_mode',s.sampled,c.k>15,'exact');check('point_count',aa.size,rr.size,'exact');
 check('membership_coverage',JSON.stringify([...aa.keys()].sort()),JSON.stringify([...rr.keys()].sort()),'exact');
 if(aa.size!==rr.size||[...rr.keys()].some(k=>!aa.has(k)))throw Error('Membership coverage mismatch');
 if(c.k<=15&&(rr.size!==2**c.k-1||[...rr.keys()].some(k=>!k.endsWith('#0'))))throw Error('Enumeration cardinality mismatch');
 if(c.k>15&&rr.size!==5000)throw Error('Sample cardinality mismatch');
 for(const [key,p] of aa){const t=rr.get(key);validatePoint(p,c.k,model,c.k>15,false);validatePoint(t,c.k,model,c.k>15,true);
  check('members',members(p,c.k),members(t,c.k),'exact');
  for(const q of ['k','mu','I2','Q',...(model==='DL'&&p.k>1?['tau2']:[]),...(c.k>15?['se']:[])])check('subset_'+q,p[q],t[q],q==='k'?'exact':q==='I2'?'i2':'rel');
 }
 for(const q of summaries){if(!finite(field(s,q))||!finite(field(rs,q)))throw Error('Invalid summary '+q);check('summary_'+q,s[q],rs[q],q==='n_subsets'?'exact':q==='median_i2'?'i2':'rel');}
 check('display',display(s),true,'exact');
 check('sampling_control_visibility',samplingVisible(c.k>15),true,'exact');
 check('controls',controls(model,5000)&&(c.k<=15||s.n_subsets===5000),true,'exact');
 check('status_messages',statusClear(STATUS_IDS),true,'exact');
 check('axis_controls',axisDefault(),true,'exact');
 check('page_text',pageTextOk(),true,'exact');
 plotChecks(a.points,check);
}
let manifest,files;
// Pins and the replay count are generated from the selected source records.
const CONTRACT={"files":[{"path":"validate/corpus/corpus.json","sha256":"2c4ece4f9c4e49d281f860ba5850b441d9f220ff0ce75c82ffbc69963972150a","bytes":267665},{"path":"validate/corpus/reference.json","sha256":"13b575fb42ca8c198da5bbcaa92919631e1490fe9013d7b435bddb8c92053ee7","bytes":14037575}],"checks":876760,"archived_checks":12813556,"configurations":89,"model_configurations":178,"sampled_ids":["dat.anand1999::001","dat.anand1999::002"],"rule":"All k <= 12, first two 16 <= k <= 100 in corpus order, and all k > 100; FE and DL","referenceVersions":{"R":"4.6.0","metafor":"5.2-1","metadat":"1.6-0"},"replay_quantities":["exact membership and coverage","subset mu, I2, Q, k, computed DL tau2, sampled SE","all exported numerical summaries","exact summary headings/labels/values","sampling control visibility","exact model option labels/selection and requested draw-control value","plotted count and every default SVG coordinate","exact ordered axis/tick labels","empty error/status messages (plot, sampling, axis) and exact default axis-control labels/values during replay","every other visible text node and aria-label/title of the page template (incl. benchmark selector) outside the validation panel, exactly; draft banner absent or exact"]};
manifest=CONTRACT;files=manifest.files;
async function replay(loaded,progress){
 const corpus=loaded[files[0].path],refs=loaded[files[1].path];
 if(!Array.isArray(corpus)||corpus.length!==manifest.configurations||!Array.isArray(refs)||refs.length!==manifest.model_configurations)throw Error('Configuration cardinality mismatch');
 const ids=new Set(),index=new Map();for(const c of corpus){source(c);if(typeof c.id!=='string'||ids.has(c.id))throw Error('Duplicate/invalid ID');ids.add(c.id);}
 for(const r of refs){if(typeof r.key!=='string'||index.has(r.key))throw Error('Duplicate/invalid reference key');index.set(r.key,r);}
 if([...ids].some(id=>!index.has(id+'::FE')||!index.has(id+'::DL')))throw Error('Reference coverage mismatch');
 const snap=__almGoshValidationSnapshot(),draft=localStorage.getItem('alm-autosave:gosh');
 const controls=[...document.querySelectorAll('input,textarea,select,button')].filter(x=>!x.closest('#alm-validate')).map(x=>[x,x.disabled]);
 let checks=0,passed=0;const failed=[],maxima={},refusals=[];
 if(!window.alm?.urlState?.withoutWrites)throw Error('URL replay guard unavailable');
 const axisSaved=axisInputs().map(x=>[x,x.value,x.checked]),axisErrorEl=document.querySelector('#alm-axis-mount [data-error]'),axisError=axisErrorEl?.textContent;
 return alm.urlState.withoutWrites(async()=>{try{
  controls.forEach(([x])=>x.disabled=true);
  setAxisDefault();
  for(const c of corpus)for(const model of ['FE','DL']){
   const id=c.id+'::'+model,r=index.get(id);if(c.k>100){if(r.refused!==true||r.reason!=='page cap: more than 100 valid rows'||r.points.length!==0)throw Error('Invalid cap reference');refusals.push(id);}
   const a=capture(c,model);
   compareRecord(c,model,a,r,(quantity,app,ref,kind)=>{let d;if(kind==='null')d={pass:app===null&&ref===null,diff:app===null?0:Infinity};else d=AlmValidate.compare(kind==='i2'?app/100:app,kind==='i2'?ref/100:ref,kind==='i2'?'abs':kind,1e-9);checks++;if(d.pass)passed++;else failed.push({id,quantity,app,ref,tol:kind==='exact'?0:1e-9,...d});maxima[quantity]=Math.max(maxima[quantity]||0,d.diff);});
   progress(`${id}: ${checks} checks`);await new Promise(r=>setTimeout(r,0));
  }
 }finally{axisSaved.forEach(([x,v,c])=>{x.value=v;x.checked=c;});if(axisErrorEl)axisErrorEl.textContent=axisError;__almGoshValidationRestore(snap);if(draft===null)localStorage.removeItem('alm-autosave:gosh');else localStorage.setItem('alm-autosave:gosh',draft);controls.forEach(([x,d])=>x.disabled=d);}
 if(checks!==manifest.checks)throw Error('Replay check cardinality mismatch: '+checks);
 return {checks,passed,failed,maxima,refusals,summaryLines:[manifest.rule,manifest.replay_quantities.join('; '),`Declared deterministic subset: ${manifest.model_configurations} model configurations, ${checks} checks. Full archived paper: 12813556 checks.`, 'Paper I² uses absolute difference / 100 <= 1e-9; other statistical values relative to max(1, |R|). Default SVG coordinates use absolute 1e-9. Display text and memberships are exact.']};});
}
function currentState(){
 if(document.querySelector('#alm-axis-mount [data-error]')?.textContent)throw Error('Axis limits are invalid; correct or reset them before validating');
 const text=document.getElementById('src').value,lines=text.trim().split(/\n/);
 if(lines.length<3||lines.length>100||lines.some(x=>{const v=x.split(',');return v.length<2||!v[0].trim()||!v[1].trim()||!finite(Number(v[0]))||!finite(Number(v[1]))||Number(v[1])<=0;}))throw Error('Need 3 through 100 valid effect rows; invalid lines refused');
 const c={k:lines.length,te:lines.map(x=>Number(x.split(',')[0])),se:lines.map(x=>Number(x.split(',')[1]))},model=document.getElementById('model').value;
 if(!['FE','DL'].includes(model))throw Error('Invalid model');
 let a;alm.urlState.withoutWrites(()=>{a=__almGoshValidationRun();});if(!a.summary)throw Error('Page refused current analysis');
 const values=[],kind={};const add=(key,value,exact=false)=>{if(!exact&&!finite(value))throw Error('Invalid app '+key);values.push({key,label:key,value});kind[key]=exact?'exact':'rel';};
 const seen=new Set();a.points.forEach((p,i)=>{validatePoint(p,c.k,model,c.k>15,false);const m=members(p,c.k);if(c.k<=15&&seen.has(m))throw Error('Duplicate enumeration');seen.add(m);add('members.'+i,m,true);for(const q of ['mu','I2','Q','k',...(model==='DL'&&p.k>1?['tau2']:[]),...(c.k>15?['se']:[])])add(q+'.'+i,p[q],q==='k');});
 if(a.points.length!==(c.k<=15?2**c.k-1:Number(document.getElementById('n-sample').value)))throw Error('Current cardinality mismatch');
 for(const q of summaries)add(q,a.summary[q],q==='n_subsets');add('display',display(a.summary)&&controls(model,c.k>15?a.summary.n_subsets:null)&&statusClear(['plot-error','sample-error'])&&pageTextOk(),true);
 add('input_k',field(a.summary,'k'),true);add('model',field(a.summary,'model'),true);add('sampled',field(a.summary,'sampled'),true);
 adapter.live.compare.kind=kind;
 return {...c,model,points:a.points,values,note:'Every captured subset is compared. Enumerated: metafor::gosh; sampled: rma on each captured draw in original order. Live tolerance 1e-9 relative to max(1, |R|), including I². Paper metafor 5.2-1; live 4.8-0.'};
}
function buildScript(s){return `
get <- function(x,k){stopifnot(k %in% names(x));x[[k,exact=TRUE]]}
yi<-c(${s.te.join(',')}); vi<-c(${s.se.map(x=>x*x).join(',')}); method<-'${s.model}'
members<-list(${s.points.map(p=>'c('+p.members.join(',')+')').join(',')})
base<-metafor::rma(yi,vi,method=method)
out<-list(); mus<-i2s<-numeric(length(members))
if(length(yi)<=15){g<-metafor::gosh(base,progbar=FALSE);incl<-get(g,'incl');res<-get(g,'res');keys<-apply(incl,1,function(x)paste(which(x),collapse=','));stopifnot(!anyDuplicated(keys),length(keys)==length(members))}
for(i in seq_along(members)){
 m<-members[[i]];key<-paste(sort(m),collapse=',');out[[paste0('members.',i-1)]]<-key
 if(length(yi)<=15){j<-match(key,keys);stopifnot(!is.na(j));v<-list(mu=get(res,'estimate')[j],I2=get(res,'I2')[j],Q=get(res,'QE')[j],k=get(res,'k')[j]);if(method=='DL'&&length(m)>1)v[['tau2']]<-get(res,'tau2')[j]
 }else{z<-metafor::rma(yi[m],vi[m],method=method);v<-list(mu=as.numeric(coef(z)),I2=get(z,'I2'),Q=get(z,'QE'),k=get(z,'k'),se=get(z,'se'));if(method=='DL')v[['tau2']]<-get(z,'tau2')}
 for(q in names(v))out[[paste0(q,'.',i-1)]]<-get(v,q)
 mus[i]<-get(v,'mu');i2s[i]<-get(v,'I2')
}
v<-list(input_k=length(yi),model=method,sampled=length(yi)>15,n_subsets=length(members),median_est=median(mus),median_i2=median(i2s),min_est=min(mus),max_est=max(mus),q25_est=unname(quantile(mus,.25)),q75_est=unname(quantile(mus,.75)),display=TRUE)
for(q in names(v))out[[q]]<-get(v,q)
emit<-function(q){x<-get(out,q);if(is.character(x))paste0('"',x,'"')else if(is.logical(x))if(x)'true' else 'false' else {stopifnot(is.numeric(x),length(x)==1,is.finite(x));sprintf('%.17g',x)}}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(names(out),emit,'')),collapse=','),'}\\n',sep='')
`;}
const adapter={app:'gosh',paper:{checks:12813556,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Scope and R reproduction',runUrl:'validate/README.md'},live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState,buildScript,appValues:s=>s.values,compare:{tolerance:{default:1e-9},kind:{}}},corpus:{files,mode:'quick',quickChecks:manifest.checks,run:replay}};
window.AlmGoshValidationAdapter=adapter;window.AlmGoshValidation=AlmValidate.mount(document.getElementById('alm-validate'),adapter);
const scope=document.createElement('p');scope.textContent=`Replay scope: ${manifest.checks} checks / ${manifest.model_configurations} model configurations. ${manifest.rule}. Includes ${manifest.replay_quantities.join('; ')}. Full paper archive: 12,813,556 checks; this button replays the declared subset.`;document.getElementById('alm-validate').append(scope);
})();
