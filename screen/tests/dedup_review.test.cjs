// Host: node --test screen/tests/dedup_review.test.cjs
// Only synthetic __control_* records. No packages or network needed for VM tests.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = process.env.DEDUP_ROOT || path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'screen/index.html'), 'utf8');
const read = p => fs.readFileSync(path.join(ROOT,p), 'utf8');
function app(storage=new Map()) {
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
  const confirmations=[];
  const context={document,console,Blob,URL:{createObjectURL:b=>b,revokeObjectURL(){}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    location:{search:''},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
    requestAnimationFrame:fn=>fn(),confirm:message=>{confirmations.push(message);return true;},addEventListener(){},
    alm:{analysisLifecycle(fn){fn.refresh=()=>{};return fn;}}};
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  for(const f of ['screen/workflow.js','shared/build-info.js','shared/toast.js','shared/rct-classifier-v1.js','screen/assets/rct-classifier-weights-v1.js'])vm.runInContext(read(f),context,{filename:f});
  let script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('var LS_KEY = "screen-v1"'));
  assert.ok(script,'inline Screen application found');
  script=script.replace('// ---- boot ----','window.__persona={dedupCore,addRecords,exportJSON,exportBundle,exportCSV,exportRIS,pushPrisma,decide,confirmDuplicate:typeof confirmDuplicate==="function"?confirmDuplicate:null};\n// ---- boot ----');
  vm.runInContext(script,context,{filename:'screen/index.html'});
  return {api:context.__almScreenpro,ui:context.__persona,el:id=>document.getElementById(id),
    document,downloads,storage,context,confirmations};
}
const record=(id,extra={})=>({id:'__control_'+id,title:'__control_'+id,...extra});
const plain=x=>JSON.parse(JSON.stringify(x));
function download(a,name) {const d=a.downloads.find(d=>d.name===name);assert.ok(d,'download '+name);return d.blob.text();}
async function jsonDownload(a,name){return JSON.parse(await download(a,name));}
function set(a,records,extra={}){a.api.setState({records,...extra});}


const base='__control_cardiac therapy outcomes across twelve hospitals';
const exactRecords=()=>[
  record('doi_a',{title:'__control_alpha renal mechanism',doi:'10.1/control'}),
  record('doi_b',{title:'__control_zeta metabolic experiment',doi:'https://doi.org/10.1/CONTROL',
    r1:{d:'include',reason:'own note'},fullText:{r1:{d:'exclude',reason:'own full-text reason'},retrieval:'retrieved',note:'own evidence'}}),
  record('fuzzy_a',{title:base}),
  record('fuzzy_b',{title:base+' today'})
];
function pair(a,reason){return a.api.suspectedPairs().find(p=>p.reason===reason);}
function decide(a,p,action='remove',target=p.secondId){assert.equal(a.api.decideDuplicate(p.id,action,target),true);}
function last(a){return a.api.state().duplicateDecisions.at(-1);}

test('all five machine and readable reasons; detection never mutates record status',()=>{
  const a=app();
  const cases=[
    ['exact-doi',{title:'__control_alpha',doi:'10.1/control'},{title:'__control_omega',doi:'doi:10.1/CONTROL'},/Same DOI 10\.1\/control/],
    ['exact-pmid',{title:'__control_renal',pmid:'123'},{title:'__control_neural',pmid:'123'},/Same PubMed ID 123/],
    ['exact-title',{title:'__control_Étude: café!'},{title:'__CONTROL_ETUDE CAFE'},/Identical title after normalising case, accents and punctuation/],
    ['similar-title',{title:base},{title:base+' today'},/Titles \d+% similar \(trigram Jaccard 0\.\d+\)/],
    ['similar-title+author-year',{title:base,authors:['McMurray JJV'],year:'2019'},
      {title:base.replace('twelve','thirteen'),authors:['McMurray J'],year:'2019'},/Titles \d+% similar, same first author \(McMurray\) and year \(2019\)/]
  ];
  for(const [reason,x,y,text] of cases){
    const records=[record('a',x),record('b',y)],before=JSON.stringify(records);
    const result=a.ui.dedupCore(records,{});
    assert.equal(JSON.stringify(records),before,'detection is read-only');
    assert.equal(result.pairs.length,1);assert.equal(result.pairs[0].reason,reason);
    assert.match(result.pairs[0].reasonText,text);
    assert.equal(result.pairs[0].exact,reason.startsWith('exact-'));
    set(a,records);assert.equal(a.api.flow().duplicates,0);
    assert.equal(a.api.flow().pendingScreen,2);assert.equal(a.api.counts().possibleDuplicates,1);
  }
});

test('conflicting DOIs block every reason, even identical PMID/title; assist needs author and year',()=>{
  const a=app();
  set(a,[record('a',{title:base,doi:'10.1/a',pmid:'123',authors:['McMurray'],year:'2019'}),
    record('b',{title:base,doi:'10.1/b',pmid:'123',authors:['McMurray'],year:'2019'})]);
  assert.deepEqual(plain(a.api.suspectedPairs()),[]);assert.equal(a.api.flow().duplicates,0);
  for(const extra of [{authors:['Different'],year:'2019'},{authors:['McMurray'],year:'2020'},{}]){
    set(a,[record('a',{title:base,authors:['McMurray'],year:'2019'}),
      record('b',{title:base.replace('twelve','thirteen'),...extra})]);
    assert.equal(a.api.suspectedPairs().length,0);
  }
  // Empty/stopword-only titles are not exact title matches.
  set(a,[record('empty_a',{title:''}),record('empty_b',{title:''})]);
  assert.equal(a.api.suspectedPairs().length,0);
});

test('blocked and brute detection find exact identifiers beyond title neighbourhood and never remove',()=>{
  const a=app(),records=Array.from({length:80},(_,i)=>record('noise_'+i,{title:'__control_noise_'+i,doi:'10.9/noise'+i}));
  records.push(record('doi_a',{title:'aaa',doi:'10.1/distant'}),record('doi_b',{title:'zzz',doi:'10.1/distant'}),
    record('pmid_a',{title:'bbb',pmid:'456'}),record('pmid_b',{title:'yyy',pmid:'456'}),
    record('title_a',{title:'__control_Café'}),record('title_b',{title:'__control_CAFE!'}));
  for(const opts of [{},{brute:true}]){
    const before=JSON.stringify(records),info=a.ui.dedupCore(records,opts);
    assert.equal(JSON.stringify(records),before);
    for(const reason of ['exact-doi','exact-pmid','exact-title'])assert.ok(info.pairs.some(p=>p.reason===reason));
  }
});

test('bulk requires confirmation, removes exact only, audits each choice, and undo restores own history',()=>{
  const a=app();set(a,exactRecords());
  assert.equal(a.api.suspectedPairs().length,2);assert.equal(a.api.flow().duplicates,0);
  const before=plain(a.api.recordById('__control_doi_b'));
  a.context.confirm=()=>false;
  assert.equal(a.api.removeAllExactMatches(),false);assert.equal(a.api.flow().duplicates,0);
  a.context.confirm=message=>{a.confirmations.push(message);return true;};
  assert.equal(a.api.removeAllExactMatches(),true);
  assert.equal(a.confirmations.length,1);assert.match(a.confirmations[0],/Remove 1 exact matches \(1 records\)/);
  assert.match(a.confirmations[0],/Same DOI 10\.1\/control/);
  assert.equal(a.api.flow().duplicates,1);assert.equal(a.api.flow().unresolvedDuplicatePairs,1);
  assert.equal(a.api.recordById('__control_fuzzy_b').dup,false);
  const d=last(a);assert.equal(d.bulk,true);assert.equal(d.reason,'exact-doi');
  const audit=a.api.state().audit.find(e=>e.action==='duplicate-confirmed');
  assert.equal(audit.actor,'r1');assert.ok(Date.parse(audit.at));assert.equal(audit.after.pairId,d.pairId);
  assert.equal(audit.after.reasonText,d.reasonText);assert.equal(audit.after.action,'remove');
  assert.equal(a.api.undoDuplicateDecision(d.id),true);
  const restored=a.api.recordById('__control_doi_b');
  assert.equal(restored.dup,false);assert.deepEqual(plain(restored.r1),before.r1);
  assert.deepEqual(plain(restored.fullText),before.fullText);
  assert.ok(restored.duplicateHistory.includes(d.id));assert.equal(a.api.flow().duplicates,0);
  assert.equal(a.api.flow().unresolvedDuplicatePairs,2);
  assert.equal(a.api.undoDuplicateDecision(d.id),false);
  assert.ok(a.api.state().audit.some(e=>e.action==='duplicate-undo'));
});

test('Keep both persists across re-detection and reload; undo reopens the pair',()=>{
  const a=app();set(a,exactRecords());const p=pair(a,'exact-doi');
  decide(a,p,'keep');const d=last(a);
  a.api.dedupCount();assert.equal(a.api.flow().duplicates,0);
  assert.equal(a.api.flow().unresolvedDuplicatePairs,1);
  const reload=app(a.storage);
  assert.equal(reload.api.flow().duplicates,0);assert.equal(reload.api.flow().unresolvedDuplicatePairs,1);
  assert.equal(reload.api.state().duplicateDecisions[0].action,'keep');
  assert.equal(reload.api.undoDuplicateDecision(d.id),true);
  assert.equal(reload.api.flow().unresolvedDuplicatePairs,2);
  assert.ok(reload.api.state().audit.some(e=>e.action==='duplicate-kept'));
});

test('swapped per-pair Remove can remove first record, and JSON/bundle keep decisions and removed records',async()=>{
  const a=app();set(a,exactRecords());const p=pair(a,'exact-doi');
  decide(a,p,'remove',p.firstId);
  assert.equal(a.api.recordById(p.firstId).dup,true);assert.equal(a.api.recordById(p.secondId).dup,false);
  a.ui.exportJSON();a.ui.exportBundle();
  const json=await jsonDownload(a,'screen-project.json'),bundle=await jsonDownload(a,'screen-bundle.json');
  for(const data of [json,bundle.screen]){
    assert.equal(data.records.length,4);assert.equal(data.duplicateDecisions.length,1);
    assert.equal(data.duplicateDecisions[0].removedId,p.firstId);
    const restored=app();restored.api.restoreProject(data);
    assert.equal(restored.api.flow().duplicates,1);assert.equal(restored.api.flow().unresolvedDuplicatePairs,1);
    assert.equal(restored.api.undoDuplicateDecision(data.duplicateDecisions[0].id),true);
    assert.equal(restored.api.flow().duplicates,0);
  }
});

test('PRISMA counts only confirmed removals and reports unresolved pairs separately',()=>{
  const a=app();const records=exactRecords().map(r=>({...r,r1:{d:'exclude'}}));
  set(a,records);a.ui.pushPrisma();
  let p=JSON.parse(a.storage.get('prisma-flow-v1'));
  assert.equal(p.removed,0);assert.equal(p.unresolvedDuplicatePairs,2);assert.equal(p.screened,4);
  decide(a,pair(a,'similar-title'));
  a.ui.pushPrisma();p=JSON.parse(a.storage.get('prisma-flow-v1'));
  assert.equal(p.removed,1);assert.equal(p.unresolvedDuplicatePairs,1);assert.equal(p.screened,3);
  assert.match(p.removedBreakdown,/User-confirmed/);
  assert.equal(a.api.undoDuplicateDecision(last(a).id),true);
  a.ui.pushPrisma();assert.equal(JSON.parse(a.storage.get('prisma-flow-v1')).removed,0);
});

test('CSV/RIS retain unresolved records, exclude only confirmed duplicates, and carry review decisions',async()=>{
  const a=app();set(a,exactRecords().map(r=>({...r,r1:{d:'include'},fullText:{r1:{d:'include'},retrieval:'retrieved'}})));
  a.ui.exportCSV();a.ui.exportRIS();
  let csv=await download(a,'screen-decisions.csv'),ris=await download(a,'screen-includes.ris');
  assert.equal(a.context.ScreenWorkflow.csvRows(csv).length,5);
  assert.equal((ris.match(/TY  - JOUR/g)||[]).length,4);
  a.downloads.length=0;decide(a,pair(a,'exact-doi'));decide(a,pair(a,'similar-title'),'keep');
  a.ui.exportCSV();a.ui.exportRIS();
  csv=await download(a,'screen-decisions.csv');ris=await download(a,'screen-includes.ris');
  const rows=a.context.ScreenWorkflow.csvRows(csv),head=rows[0];
  assert.equal(rows.length,4);assert.ok(head.includes('duplicate_review'));
  assert.ok(rows.slice(1).every(r=>r[0]!=='__control_doi_b'));
  assert.match(rows[1][head.indexOf('duplicate_review')],/exact-doi/);
  assert.match(csv,/keep/);assert.match(ris,/Duplicate review:/);assert.match(ris,/exact-doi/);
  assert.equal((ris.match(/TY  - JOUR/g)||[]).length,3);
});

test('legacy exact automatic flags are released on load; explicit manual choices remain',()=>{
  const a=app(),records=exactRecords();records[1].dup=true;records[1].dupOf=records[0].id;
  a.api.restoreProject({_schema:'screen-v1',records,stage:'ft'});
  assert.equal(a.api.flow().duplicates,0);assert.equal(a.api.state().stage,'ta');
  assert.equal(a.api.flow().unresolvedDuplicatePairs,2);
  assert.match(a.el('duplicate-warning').innerHTML,/Nothing has been removed/);
  assert.ok(a.api.state().audit.some(e=>e.action==='dedup-recheck'));
  records[1].dupManual=true;a.api.restoreProject({_schema:'screen-v1',records});
  assert.equal(a.api.flow().duplicates,1);
});

test('overlapping pairs stay unresolved without silent decisions; bulk undo and DOI bridges remain safe',()=>{
  const a=app();set(a,[record('a',{title:'__control_same'}),record('b',{title:'__control_same'}),record('c',{title:'__control_same'})]);
  assert.equal(a.api.suspectedPairs().length,3);
  assert.equal(a.api.removeAllExactMatches(),true);
  assert.match(a.confirmations[0],/Remove 2 exact matches/);
  assert.equal(a.api.flow().duplicates,2);assert.equal(a.api.flow().unresolvedDuplicatePairs,1);
  const unresolved=a.api.suspectedPairs().find(p=>!a.api.state().duplicateDecisions.some(d=>d.pairId===p.id && !d.undoneAt));
  assert.equal(a.api.decideDuplicate(unresolved.id,'keep'),false);
  assert.equal(a.api.flow().unresolvedDuplicatePairs,1);
  for(const d of a.api.state().duplicateDecisions)assert.equal(a.api.undoDuplicateDecision(d.id),true);
  assert.equal(a.api.flow().duplicates,0);assert.equal(a.api.flow().unresolvedDuplicatePairs,3);
  set(a,[record('a',{title:base,doi:'10.1/a'}),record('b',{title:base}),record('c',{title:base,doi:'10.1/c'})]);
  assert.equal(a.api.suspectedPairs().length,2);
  assert.equal(a.ui.confirmDuplicate('__control_c','__control_b'),true);
  assert.equal(a.ui.confirmDuplicate('__control_b','__control_a'),false);
  assert.equal(a.api.flow().duplicates,1);
});
