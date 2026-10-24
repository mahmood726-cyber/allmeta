// Host: node --test screen/tests/persona_fixes.test.cjs
// Only synthetic __control_* records. No packages or network needed for VM tests.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = process.env.PERSONA_ROOT || path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'screen/index.html'), 'utf8');
const read = p => fs.readFileSync(path.join(ROOT,p), 'utf8');
function app() {
  const elements=new Map(), downloads=[], timers=[];
  let document;
  function element(id='') {
    const classes=new Set(), handlers={};
    const el={id,tagName:'DIV',innerHTML:'',textContent:'',value:'',style:{},hidden:false,
      checked:false,children:[],handlers,
      classList:{contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:x=>classes.has(x)?classes.delete(x):classes.add(x)},
      addEventListener:(type,fn)=>{handlers[type]=fn;},setAttribute(){},getAttribute(){return null;},
      appendChild(x){this.children.push(x);},removeChild(x){this.children=this.children.filter(y=>y!==x);},
      contains(x){return this.children.includes(x);},focus(){document.activeElement=this;},
      click(){if(this.download)downloads.push({name:this.download,blob:this.href});if(handlers.click)handlers.click();},
      querySelectorAll(){return [];},
      querySelector(sel){
        if(sel==='.ctitle' && this.innerHTML.includes('class="ctitle"')){
          const h=element();h.classList.add('ctitle');h.tagName='H2';return h;
        }
        return null;
      },closest(){return null;}
    };
    return el;
  }
  document={getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},
    createElement:()=>element(),addEventListener(){},querySelectorAll(){return [];}};
  document.body=element('body');document.head=element('head');document.activeElement=document.body;
  const storage=new Map();
  const context={document,console,Blob,URL:{createObjectURL:b=>b,revokeObjectURL(){}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    location:{search:''},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
    requestAnimationFrame:fn=>fn(),confirm:()=>true,addEventListener(){},
    alm:{analysisLifecycle(fn){fn.refresh=()=>{};return fn;}}};
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  for(const f of ['screen/workflow.js','shared/build-info.js','shared/toast.js','shared/rct-classifier-v1.js','screen/assets/rct-classifier-weights-v1.js'])vm.runInContext(read(f),context,{filename:f});
  let script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('var LS_KEY = "screen-v1"'));
  assert.ok(script,'inline Screen application found');
  script=script.replace('// ---- boot ----','window.__persona={exportJSON,exportBundle,exportCSV,exportRIS,aiExportTask,pushPrisma,onKey,decide,applyReason,render,highlight,toast,renderMlPerf,confirmDuplicate:typeof confirmDuplicate==="function"?confirmDuplicate:null};\n// ---- boot ----');
  vm.runInContext(script,context,{filename:'screen/index.html'});
  return {api:context.__almScreenpro,ui:context.__persona,el:id=>document.getElementById(id),
    document,downloads,storage,context};
}
const record=(id,extra={})=>({id:'__control_'+id,title:'__control_'+id,...extra});
const plain=x=>JSON.parse(JSON.stringify(x));
function download(a,name) {const d=a.downloads.find(d=>d.name===name);assert.ok(d,'download '+name);return d.blob.text();}
async function jsonDownload(a,name){return JSON.parse(await download(a,name));}
function set(a,records,extra={}){a.api.setState({records,...extra});}

test('S04 headers map by name and missing title fails closed',()=>{
  const a=app();
  const rows=a.api.parse('DI,AU,Article Title,SO,PY,AB,id\n10.1/control,Control A,__control_title,__control_journal,2024,__control_abstract,__control_csv','x.csv');
  assert.equal(rows.length,1);assert.equal(rows[0].title,'__control_title');
  assert.equal(rows[0].doi,'10.1/control');assert.equal(rows[0].journal,'__control_journal');
  assert.equal(rows[0].year,'2024');assert.deepEqual(plain(rows[0].authors),['Control A']);
  assert.throws(()=>a.api.parse('ttile,abstract\n__control_title,__control_abstract','x.csv'),/Missing title column/);
  for(const title of ['title','ti','TI','Article Title']){
    const r=a.api.parse('id,AB,'+title+'\n__control_alias,__control_abstract,__control_title','x.csv');
    assert.equal(r.length,1);assert.equal(r[0].abstract,'__control_abstract');
  }
});
test('S16 semicolon CSV respects quoting and multiline abstracts',()=>{
  const a=app(),r=a.api.parse('\uFEFFid;"Article Title";"Source Title";AB\n__control_sc;"__control_title, comma";"__control_journal";"first; line\nsecond ""quote"""','x.csv');
  assert.equal(r.length,1);assert.equal(r[0].title,'__control_title, comma');
  assert.equal(r[0].abstract,'first; line second "quote"');
});
test('S06 conflicting DOIs cannot merge; fuzzy candidates require confirmation and are reversible',()=>{
  const a=app(),title='__control_therapy outcomes at twelve months';
  set(a,[record('a',{title,doi:'10.1/a'}),record('b',{title,doi:'10.1/b'})]);
  assert.equal(a.api.counts().duplicates,0);assert.equal(a.api.flow().pendingScreen,2);
  set(a,[record('a',{title}),record('b',{title})]);
  assert.equal(a.api.counts().duplicates,0);assert.equal(a.api.flow().pendingScreen,2);
  assert.deepEqual(plain(a.api.recordById('__control_b').possibleDupOf),['__control_a']);
  a.ui.decide('include');
  assert.match(a.el('card-host').innerHTML,/Possible duplicate/);
  assert.match(a.el('card-host').innerHTML,/data-confirm-dup/);
  assert.equal(a.ui.confirmDuplicate('__control_b','__control_a'),true);
  assert.equal(a.api.flow().duplicates,1);
  a.ui.decide('duplicate');assert.equal(a.api.flow().duplicates,0);
  assert.equal(a.api.state().audit.some(e=>e.action==='duplicate-confirmed'),true);
  set(a,[record('a',{title,doi:'10.1/A'}),record('b',{title,doi:'https://doi.org/10.1/a'})]);
  assert.equal(a.api.flow().duplicates,1);
});
test('S09 title normalisation retains non-Latin letters and NFKC',()=>{
  const a=app();
  assert.notEqual(a.api.normTitle('SGLT2心力衰竭随机试验'),a.api.normTitle('SGLT2糖尿病肾功能研究'));
  assert.match(a.api.normTitle('Русский контроль'),/русский/);
  assert.equal(a.api.normTitle('ＡＢＣ'),a.api.normTitle('ABC'));
});
test('S05 Unicode whole words drive both score and highlighting',()=>{
  const a=app();set(a,[],{excTerms:['rat','кот']});
  assert.equal(a.api.score(record('ratio',{abstract:'hazard ratio strategy duration moderate accurate котик'})),0);
  assert.equal(a.api.score(record('rat',{title:'__control_words',abstract:'rat; кот.'})),-4);
  assert.doesNotMatch(a.ui.highlight('ratio котик'),/<mark/);
  assert.match(a.ui.highlight('rat < кот'),/<mark class="hl-exc">rat<\/mark> &lt; <mark/);
});

test('S07 project and bundle counts and agreement match the displayed stage',async()=>{
  const a=app(),r=(id,ta,ft,retrieval='retrieved')=>record(id,{
    r1:{d:ta},r2:{d:ta},fullText:{r1:{d:ft},r2:{d:ft},retrieval}});
  const records=[r('include','include','include'),r('exclude','include','exclude'),
    r('not_retrieved','include','','not-retrieved'),r('ta_excluded','exclude','')];
  for(const stage of ['ta','ft']){
    set(a,records,{stage,mode:'dual',blind:false});a.downloads.length=0;
    a.ui.exportJSON();a.ui.exportBundle();
    const project=await jsonDownload(a,'screen-project.json');
    const bundle=await jsonDownload(a,'screen-bundle.json');
    for(const out of [project,bundle.screen]){
      assert.equal(out.counts.stage,stage);assert.equal(out.agreement.stage,stage);
      for(const [key,value] of Object.entries(plain(a.api.counts())))assert.equal(out.counts[key],value,key);
      assert.equal(out.agreement.n,a.api.kappa().n);
      assert.equal(out.agreement.kappa,a.api.kappa().kappa);
      assert.equal(out.counts.undecided,stage==='ft'?1:0);
    }
    assert.match(a.el('stats').innerHTML,new RegExp('Undecided</span><span class="v">'+project.counts.undecided));
  }
});
test('S08 blind JSON and bundle refuse combined counts for either reviewer',()=>{
  const a=app();
  for(const active of ['r1','r2']){
    set(a,[record('conflict',{r1:{d:'include'},r2:{d:'exclude'}})],{mode:'dual',blind:true,active});
    a.ui.exportJSON();a.ui.exportBundle();
    assert.equal(a.downloads.length,0);assert.match(a.el('workflow-status').textContent,/Turn off blind mode/);
    assert.equal(a.api.reviewerExport().reviewer,active);
  }
});
test('S14 all generated export formats carry the loaded build identity',async()=>{
  const a=app();
  const provenance=x=>{assert.equal(x.version,a.context.AlmBuildInfo.version);assert.equal(x.buildCommit,a.context.AlmBuildInfo.sha);};
  set(a,[record('final',{r1:{d:'include'},fullText:{r1:{d:'include'},retrieval:'retrieved'}})]);
  a.ui.exportJSON();a.ui.exportBundle();a.ui.exportCSV();a.ui.exportRIS();a.ui.pushPrisma();
  provenance((await jsonDownload(a,'screen-project.json')).provenance);
  provenance((await jsonDownload(a,'screen-bundle.json')).provenance);
  provenance(a.api.reviewerExport().provenance);
  provenance(JSON.parse(a.storage.get('prisma-flow-v1')).provenance);
  for(const name of ['screen-decisions.csv','screen-includes.ris']){
    const text=await download(a,name);assert.ok(text.includes(a.context.AlmBuildInfo.version));assert.ok(text.includes(a.context.AlmBuildInfo.sha));
  }
  set(a,[record('pending')]);a.ui.aiExportTask();
  provenance((await jsonDownload(a,'screen-ai-batch.json')).provenance);
  assert.ok((await download(a,'screen-ai-task.md')).includes(a.context.AlmBuildInfo.sha));
});

test('S02 held-out denominator comes from test n, not training plus test',()=>{
  const a=app();assert.match(a.el('rct-meta').textContent,/held-out n=799/);
  assert.doesNotMatch(a.el('rct-meta').textContent,/3194/);
});
test('S01 and S15 model limitations accompany an uncalibrated score',()=>{
  const a=app();set(a,[record('nonrandom',{abstract:'Non-randomised intervention without random allocation.'})]);
  assert.match(html,/Negatives were reviews, observational studies, case reports and comparative studies/);
  assert.match(html,/Non-randomised interventional designs were absent as an explicit negative class/);
  assert.match(html,/non-English performance is not validated/);
  assert.match(a.el('card-host').innerHTML,/RCT model score/);
  assert.doesNotMatch(a.el('card-host').innerHTML,/>RCT \d+%/);
});
test('S03 2 to 5 folds report actual folds and small-n caveat',()=>{
  for(const n of [2,3,4,5]){
    const a=app(),records=[];
    for(let i=0;i<n;i++){
      records.push(record('positive_'+i,{title:'__control_positive_'+i,abstract:i<2?'alpha benefit response':'__control_unique_positive_'+i,r1:{d:'include'}}));
      records.push(record('negative_'+i,{title:'__control_negative_'+i,abstract:i<2?'omega unrelated methods':'__control_unique_negative_'+i,r1:{d:'exclude'}}));
    }
    set(a,records);
    const res=a.api.mlTrain();assert.equal(res.ok,true,res.msg);
    assert.equal(res.cv.folds,n);assert.ok(res.msg.includes(n+'-fold CV AUC'));
    assert.match(res.msg,/Small sample/);a.ui.renderMlPerf();
    assert.match(a.el('ml-perf').textContent,/Small sample/);
  }
});
test('S10 toast uses shared Toast and creates a visible notification',()=>{
  const a=app();a.ui.toast('__control_toast');
  const container=a.document.body.children.find(x=>x.className==='toast-container');
  assert.ok(container);assert.equal(container.children.at(-1).textContent,'__control_toast');
  assert.ok(container.children.at(-1).classList.contains('is-visible'));
});
function pairs(counts){
  const decisions=[['include','include'],['include','exclude'],['exclude','include'],['exclude','exclude']];
  return counts.flatMap((n,j)=>Array.from({length:n},(_,i)=>record('pair_'+j+'_'+i,{
    r1:{d:decisions[j][0]},r2:{d:decisions[j][1]}})));
}
test('S11 kappa SE and interval match an analytic balanced table',()=>{
  const a=app();set(a,pairs([40,10,10,40]),{mode:'dual'});
  const k=a.api.kappa();
  assert.ok(Math.abs(k.kappa-0.6)<1e-12);assert.ok(Math.abs(k.se-0.08)<1e-12);
  assert.ok(Math.abs(k.ci95[0]-(0.6-1.959963984540054*0.08))<1e-12);
  assert.ok(Math.abs(k.ci95[1]-(0.6+1.959963984540054*0.08))<1e-12);
  assert.match(k.method,/Fleiss-Cohen-Everitt/);
  set(a,pairs([4,1,1,4]),{mode:'dual'});
  assert.match(a.el('kappa').innerHTML,/Small sample/);
  assert.match(a.el('kappa').innerHTML,/95% CI/);
  set(a,pairs([2,0,0,0]),{mode:'dual'});
  assert.equal(a.api.kappa().kappa,null);assert.equal(a.api.kappa().se,null);
});
test('S12 maybe pairs are omitted from final-decision kappa',()=>{
  const a=app(),records=pairs([2,1,0,1]);
  records.push(record('maybe',{r1:{d:'maybe'},r2:{d:'exclude'}}));
  set(a,records,{mode:'dual'});
  const k=a.api.kappa();assert.equal(k.n,4);
  assert.deepEqual(plain(k.categories),['include','exclude']);
  assert.match(a.el('kappa').innerHTML,/Maybe is not a final decision/);
  assert.equal(a.api.flow().pendingScreen,2);
});
test('S17 Enter on a focused control is not consumed by global navigation',()=>{
  const a=app();set(a,[record('one'),record('two')]);
  for(const tagName of ['BUTTON','A','SUMMARY','SPAN']){
    let prevented=false;
    a.ui.onKey({key:'Enter',target:{tagName,closest:()=>({})},preventDefault(){prevented=true;}});
    assert.equal(prevented,false);assert.equal(a.api.state().cursor,0);
  }
  a.ui.onKey({key:'Enter',defaultPrevented:true,preventDefault(){assert.fail('handled twice');}});
  assert.equal(a.api.state().cursor,0);
});
test('S18 decisions focus the successor heading and the card is not a live region',()=>{
  const a=app();set(a,[record('one'),record('two')]);
  a.ui.decide('include');
  assert.equal(a.api.state().cursor,1);assert.equal(a.document.activeElement.tagName,'H2');
  assert.ok(a.document.activeElement.classList.contains('ctitle'));
  assert.doesNotMatch(html,/<div id="card-host"[^>]*aria-live/);
  assert.match(a.el('card-host').innerHTML,/class="ctitle" tabindex="-1"/);
});

test('S06 old automatic removals are rechecked when restoring a project',()=>{
  const a=app(),title='__control_old_duplicate';
  const records=[record('old_a',{title,doi:'10.1/a'}),
    record('old_b',{title,doi:'10.1/b',dup:true,dupOf:'__control_old_a'})];
  a.api.restoreProject({_schema:'screen-v1',stage:'ft',records});
  assert.equal(a.api.flow().duplicates,0);assert.equal(a.api.state().stage,'ta');
  assert.ok(a.api.state().audit.some(e=>e.action==='dedup-recheck'));
});
test('S11 asymmetric kappa uncertainty includes both estimated marginals',()=>{
  const a=app();set(a,pairs([4,1,2,3]),{mode:'dual'});
  const k=a.api.kappa();
  assert.ok(Math.abs(k.kappa-0.4)<1e-12);
  // Independent FCE closed form: variance = 252/3125.
  assert.ok(Math.abs(k.se-Math.sqrt(252/3125))<1e-12);
});
test('S06 no DOI bridge can combine conflicting publications',()=>{
  const a=app(),title='__control_bridge';
  set(a,[record('bridge_a',{title,doi:'10.1/a'}),record('bridge_b',{title}),
    record('bridge_c',{title,doi:'10.1/c'})]);
  assert.ok(a.ui.confirmDuplicate,'candidate confirmation is available');
  assert.equal(a.ui.confirmDuplicate('__control_bridge_c','__control_bridge_b'),true);
  assert.equal(a.ui.confirmDuplicate('__control_bridge_b','__control_bridge_a'),false);
  assert.equal(a.api.flow().duplicates,1);
});

// Optional real-browser check. Host: set PERSONA_BROWSER=1 before the Node command.
// Requires the host's existing Playwright and Chromium; never downloads anything.
if(process.env.PERSONA_BROWSER==='1'){
  test('S17/S18 browser Enter activates once, focus follows, and export works',async()=>{
    let chromium;
    try{chromium=require('playwright').chromium;}catch{chromium=require('@playwright/test').chromium;}
    const browser=await chromium.launch({headless:true});
    try{
      const page=await browser.newPage();
      await page.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
      await page.goto(require('node:url').pathToFileURL(path.join(ROOT,'screen/index.html')).href);
      await page.evaluate(()=>{
        localStorage.clear();
        window.__almScreenpro.setState({records:[0,1,2].map(i=>({id:'__control_focus_'+i,title:'__control_heading_'+i}))});
      });
      await page.locator('[data-dec="include"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(()=>window.__almScreenpro.state().records[0].r1.d),'include');
      assert.equal(await page.evaluate(()=>window.__almScreenpro.state().cursor),1);
      assert.equal(await page.evaluate(()=>document.activeElement.className),'ctitle');
      assert.equal(await page.locator('#card-host').getAttribute('aria-live'),null);
      // A role=button reason chip must also advance exactly once.
      await page.locator('[data-reason="0"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(()=>window.__almScreenpro.state().records[1].r1.d),'exclude');
      assert.equal(await page.evaluate(()=>window.__almScreenpro.state().cursor),2);
      assert.equal(await page.evaluate(()=>document.activeElement.className),'ctitle');
      await page.locator('#btn-export-csv').focus();
      const pending=page.waitForEvent('download');
      await page.keyboard.press('Enter');
      assert.equal((await pending).suggestedFilename(),'screen-decisions.csv');
    }finally{await browser.close();}
  });
}
