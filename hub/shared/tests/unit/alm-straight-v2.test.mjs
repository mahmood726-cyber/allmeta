import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const S=require('../../../../shared/alm-straight.js');
const placements={
  "SP-REC-SMALLK": [
    "heterogeneity",
    "meta-regression",
    "influence",
    "limit-ma",
    "gosh",
    "cumulative-subgroup"
  ],
  "SP-PIT-I2ZERO": [
    "heterogeneity",
    "influence"
  ],
  "SP-PIT-NONSIG": [
    "heterogeneity",
    "pubbias-tests",
    "meta-regression",
    "influence",
    "limit-ma",
    "cumulative-subgroup",
    "mh-peto",
    "multilevel-ma",
    "nma",
    "component-nma",
    "dose-response-ma",
    "rve-meta"
  ],
  "SP-PIT-FUNNELSMALLK": [
    "pubbias-tests",
    "limit-ma"
  ],
  "SP-PIT-NMACONSIST": [
    "nma"
  ],
  "SP-UNC-SMALLK": [
    "heterogeneity",
    "pubbias-tests",
    "meta-regression",
    "influence",
    "limit-ma",
    "gosh",
    "cumulative-subgroup",
    "mh-peto",
    "multilevel-ma",
    "nma",
    "component-nma",
    "dose-response-ma",
    "rve-meta"
  ],
  "SP-UNC-WIDEPI": [
    "heterogeneity",
    "cumulative-subgroup",
    "multilevel-ma"
  ]
};
const cases={
 'SP-REC-SMALLK':[{k:4,randomEffects:true,estimator:'DL',hksj:false},{k:4,randomEffects:false,estimator:'DL',hksj:false}],
 'SP-PIT-I2ZERO':[{k:4,i2:0},{k:5,i2:0}],
 'SP-PIT-NONSIG':[{estimates:[{label:'main',lo:-.1,hi:.3,nullValue:0}]},{estimates:[{label:'main',lo:.1,hi:.3,nullValue:0}]}],
 'SP-PIT-FUNNELSMALLK':[{k:9,smallStudyTest:{shown:true}},{k:9,smallStudyTest:{shown:false}}],
 'SP-PIT-NMACONSIST':[{inconsistencyTests:[{label:'between designs',p:.5}]},{inconsistencyTests:[{label:'between designs',p:.01}]}],
 'SP-UNC-SMALLK':[{analysisType:'pairwise',k:4},{analysisType:'pairwise',k:5}],
 'SP-UNC-WIDEPI':[{k:4,estimates:[{label:'main',lo:.1,hi:.3,piLo:-.2,piHi:.6,nullValue:0}]},{k:4,estimates:[{label:'main',lo:.1,hi:.3,piLo:.01,piHi:.6,nullValue:0}]}]
};
for(const [id,apps] of Object.entries(placements)) for(const app of apps){
 test(id+' '+app+' planted trigger and control',()=>{
  let [hit,control]=cases[id];
  if(id==='SP-UNC-SMALLK' && ['nma','component-nma'].includes(app)) [hit,control]=[{analysisType:'network',minPerComparison:4},{analysisType:'network',minPerComparison:5}];
  const check=c=>S.evaluate(app,c).checked.find(r=>r.id===id+'@1');
  assert.equal(check(hit)?.fired,true,'placement must exist and fire');
  assert.equal(check(control)?.fired,false,'control must not fire');
  assert.equal(check({})?.reason,'not applicable');
 });
}
for(const app of ["heterogeneity","pubbias-tests","meta-regression","influence","limit-ma","gosh","cumulative-subgroup","mh-peto","multilevel-ma","nma","component-nma","dose-response-ma","rve-meta"]) test(app+' only supported placements',()=>{
 const expected=Object.entries(placements).filter(([,as])=>as.includes(app)).map(([id])=>id).sort();
 assert.deepEqual(S.RULES.filter(r=>r.apps.includes(app)).map(r=>r.id).sort(),expected);
});

const fixtures={
  "heterogeneity": {
    "getter": "_almLastFE",
    "value": {
      "k": 4,
      "estimator": "pm",
      "sum": {
        "I2": 0,
        "ciLoHKSJ": -0.2,
        "ciHiHKSJ": 0.3
      },
      "pi": {
        "lo": -0.5,
        "hi": 0.8
      }
    },
    "want": {
      "k": 4,
      "estimator": "PM",
      "hksj": true,
      "i2": 0
    }
  },
  "pubbias-tests": {
    "getter": "_almLastPubbias",
    "value": {
      "k": 4,
      "egger_p": 0.8
    },
    "want": {
      "k": 4
    }
  },
  "meta-regression": {
    "getter": "_almLastFitted",
    "value": {
      "tau2": 0.1
    },
    "extra": {
      "_almLastStudies": [
        {},
        {},
        {},
        {}
      ]
    },
    "want": {
      "k": 4,
      "estimator": "PM",
      "hksj": true
    }
  },
  "influence": {
    "getter": "_almLastInfluence",
    "value": {
      "I2": 0,
      "ciLo": -0.2,
      "ciHi": 0.4
    },
    "extra": {
      "_almStudies": [
        {},
        {},
        {}
      ]
    },
    "want": {
      "k": 3,
      "i2": 0,
      "hksj": false
    }
  },
  "limit-ma": {
    "getter": "_almLastLimit",
    "value": {
      "k": 4,
      "limit_ci_lo": -0.1,
      "limit_ci_hi": 0.5,
      "re_ci_lo": 0.1,
      "re_ci_hi": 0.6
    },
    "want": {
      "k": 4,
      "estimator": "DL"
    }
  },
  "gosh": {
    "getter": "_almLastGosh",
    "value": {
      "k": 4,
      "model": "DL",
      "median_i2": 0
    },
    "want": {
      "k": 4,
      "estimator": "DL",
      "randomEffects": true
    }
  },
  "cumulative-subgroup": {
    "getter": "_almLastCumSub",
    "value": {
      "k": 4,
      "view": "subgroup",
      "overall_lo": 0.1,
      "overall_hi": 0.4,
      "overall_pi_lo": -0.2,
      "overall_pi_hi": 0.8
    },
    "want": {
      "k": 4,
      "estimator": "PM"
    }
  },
  "mh-peto": {
    "getter": "_almLastMhPeto",
    "value": {
      "k": 4,
      "measure": "OR",
      "mh_lo": 0.5,
      "mh_hi": 1.5,
      "peto_lo": 0.6,
      "peto_hi": 1.7
    },
    "want": {
      "k": 4
    }
  },
  "multilevel-ma": {
    "getter": "_almLastMlma",
    "value": {
      "k": 20,
      "J": 4,
      "ci_lb_hk": -0.2,
      "ci_ub_hk": 0.6,
      "pi_lb": -0.4,
      "pi_ub": 0.8
    },
    "want": {
      "k": 4
    }
  },
  "dose-response-ma": {
    "getter": "_almLastDoseResponse",
    "value": {
      "k": 4,
      "model": "linear",
      "metaRegression": false
    },
    "want": {
      "k": 4
    }
  },
  "rve-meta": {
    "getter": "__almLastRVE",
    "value": {
      "fit": {
        "k_total": 20,
        "m_clusters": 4
      },
      "summary": [
        {
          "ci_lo": -0.1,
          "ci_hi": 0.3
        }
      ]
    },
    "want": {
      "k": 4
    }
  }
};
function adapter(app,f={}){
 const env={document:{readyState:'loading',querySelector:s=>s==='#coef-body tr'?{}:null,querySelectorAll:()=>[],getElementById:()=>null},addEventListener(){},AlmStraightUI:{attach(){}}};env.window=env;
 for(const [key,value] of Object.entries(f.extra||{}))env[key]=()=>value;
 if(f.getter)env[f.getter]=()=>f.value;
 runInNewContext(readFileSync(new URL('../../../../'+app+'/alm-straight.js',import.meta.url),'utf8'),env);
 return env;
}
for(const [app,f] of Object.entries(fixtures))test(app+' adapter reads current cached fields; no result control',()=>{
 const env=adapter(app,f),ctx=()=>env.AlmStraightAdapters[app].ctx();
 for(const [key,value] of Object.entries(f.want))assert.equal(ctx()[key],value,key);
 env[f.getter]=()=>null;
 assert.equal(ctx().k,undefined,'no stale k after results clear');
 assert.equal(ctx().estimates,undefined,'no stale estimates after results clear');
});
test('GOSH subset median is not full-analysis I2',()=>{assert.equal(adapter('gosh',fixtures.gosh).AlmStraightAdapters.gosh.ctx().i2,undefined);});
test('MH ratios use null=1, risk differences null=0',()=>{const e=adapter('mh-peto',fixtures['mh-peto']);assert.equal(e.AlmStraightAdapters['mh-peto'].ctx().estimates[0].nullValue,1);e._almLastMhPeto=()=>({...fixtures['mh-peto'].value,measure:'RD'});assert.equal(e.AlmStraightAdapters['mh-peto'].ctx().estimates[0].nullValue,0);});
test('uncertainty uses independent clusters, not effects',()=>{for(const app of ['multilevel-ma','rve-meta'])assert.equal(adapter(app,fixtures[app]).AlmStraightAdapters[app].ctx().k,4);});

for(const [app,f] of Object.entries(fixtures))test(app+' suppresses retained results when inputs are stale',()=>{
 const env=adapter(app,f);env.document.getElementById=id=>id==='analysis-stale'?{hidden:false}:null;
 const c=env.AlmStraightAdapters[app].ctx();assert.equal(c.k,undefined);assert.equal(c.estimates,undefined);
});
test('matching CI/PI stays on the MoM HK model, not the REML CI',()=>{
 const env=adapter('multilevel-ma',{...fixtures['multilevel-ma'],extra:{__almReml:{ciLo:1,ciHi:2}}});const es=env.AlmStraightAdapters['multilevel-ma'].ctx().estimates;
 assert.equal(es[0].lo,-.2);assert.equal(es[0].piLo,-.4);assert.equal(es[1].lo,1);assert.equal(es[1].piLo,undefined);
});
test('NMA counts unique studies per comparison, including quoted labels and reversed arms',()=>{
 const env=adapter('nma');let data='"Smith, 2020", A, B, .2, .1\n"Smith, 2020", B, A, -.2, .1\nJones, A, B, .3, .1';
 env.document.querySelector=s=>s==='#ref-host tbody tr'?{}:null;
 env.document.getElementById=id=>id==='f-data'?{value:data}:id==='f-scale'?{value:'log'}:null;
 const c=()=>env.AlmStraightAdapters.nma.ctx();assert.equal(c().minPerComparison,2);
 data+='\nC, A, B, .2, .1\nD, A, B, .2, .1\nE, A, B, .2, .1';assert.equal(c().minPerComparison,5);
});
test('component network counts whole arm combinations, never individual components',()=>{
 const env=adapter('component-nma',{getter:'_almLastCnma',value:{}});env.document.getElementById=id=>id==='src'?{value:'input'}:null;
 let rows=[{A:['a','b'],B:[]},{A:[],B:['b','a']},{A:['a'],B:[]}];env.parse=()=>rows;
 const c=()=>env.AlmStraightAdapters['component-nma'].ctx();assert.equal(c().minPerComparison,1);
 rows=Array.from({length:5},()=>({A:['a','b'],B:[]}));assert.equal(c().minPerComparison,5);
});
test('publication-bias optional CI is discarded when only the main analysis reruns',()=>{
 let main={k:4,egger_p:.4},plus={result:{full:{conditional:{status:'ok',values:{ciLo:-.1,ciHi:.2}}}}};
 const env=adapter('pubbias-tests');env._almLastPubbias=()=>main;env.AlmPubbiasPlusUI={snapshot:()=>plus};
 const c=()=>env.AlmStraightAdapters['pubbias-tests'].ctx();assert.equal(c().estimates[0].lo,-.1);
 main={k:6,egger_p:.6};assert.equal(c().estimates,undefined);
 plus={result:{full:{conditional:{status:'refused'}}}};assert.equal(c().estimates,undefined);
});
test('limit asymmetry advice requires a current successful displayed test',()=>{
 const f=fixtures['limit-ma'],env=adapter('limit-ma',f);let snapshot={limit:f.value,results:{Egger:{status:'ok',values:{p:.4}}}};
 env.AlmLimitPlusUI={snapshot:()=>snapshot};const c=()=>env.AlmStraightAdapters['limit-ma'].ctx();assert.equal(c().smallStudyTest.shown,true);
 snapshot={...snapshot,limit:{...f.value}};assert.equal(c().smallStudyTest.shown,false);
});

test('dose-response does not flag the identically-one reference dose as a main effect',()=>{
 const env=adapter('dose-response-ma',{getter:'_almLastDoseResponse',value:{k:6,model:'rcs',referenceDose:0,predictions:[{dose:0,lo:1,hi:1},{dose:10,lo:1.1,hi:1.5}]}});
 let es=env.AlmStraightAdapters['dose-response-ma'].ctx().estimates;assert.equal(es.length,1);assert.equal(es[0].lo,1.1);
 env._almLastDoseResponse=()=>({k:6,model:'rcs',referenceDose:0,predictions:[{dose:10,lo:.8,hi:1.5}]});
 es=env.AlmStraightAdapters['dose-response-ma'].ctx().estimates;assert.equal(es[0].lo,.8);
});

// Regression: index.html clears its main cache at k < 5; plus-ui still displays results.
test('publication-bias four-study optional results retain counts, CI and displayed Egger advice',()=>{
 const env=adapter('pubbias-tests');
 env._almLastPubbias=()=>null;
 env.AlmPubbiasPlusUI={snapshot:()=>plus};
 let plus={"result":{"k":4,"full":{"conditional":{"status":"ok","values":{"ciLo":-0.673,"ciHi":0.874}}},"loo":{"status":"ok","values":{"rows":[{"omit":null,"egger":{"status":"ok","values":{"p":0.4513}}}]}}}};
 const c=()=>env.AlmStraightAdapters['pubbias-tests'].ctx();
 assert.equal(c().k,4);
 assert.equal(c().estimates[0].lo,-.673);
 assert.equal(c().smallStudyTest.shown,true);
 assert.deepEqual(S.fired(S.evaluate('pubbias-tests',c())).sort(),['SP-PIT-FUNNELSMALLK@1','SP-PIT-NONSIG@1','SP-UNC-SMALLK@1']);
 plus={result:{k:4,full:{conditional:{status:'refused'},egger:{status:'refused'}},loo:{status:'refused'}}};
 assert.equal(c().estimates,undefined);
 assert.equal(c().smallStudyTest?.shown||false,false);
 plus=null;
 assert.equal(c().k,undefined);
});
test('publication-bias suppressed main table still exposes its actual study count',()=>{
 const env=adapter('pubbias-tests');
 let text='Pub-bias tests have very low power below k=10. Current k = 4.';
 env.document.getElementById=id=>id==='body'?{textContent:text}:null;
 const c=()=>env.AlmStraightAdapters['pubbias-tests'].ctx();
 assert.equal(c().k,4);assert.equal(c().smallStudyTest?.shown||false,false);
 text='Analysis unavailable: invalid input';assert.equal(c().k,undefined);
});

test('publication-bias invalidates optional results on main-only reruns even with a null main cache',()=>{
 const env=adapter('pubbias-tests');let plus={result:{k:4,full:{conditional:{status:'ok',values:{ciLo:-.1,ciHi:.2}}}}};
 env.AlmPubbiasPlusUI={snapshot:()=>plus};env._almLastPubbias=()=>null;
 const c=()=>env.AlmStraightAdapters['pubbias-tests'].ctx();
 assert.equal(c().estimates[0].lo,-.1);
 // Execute start through a fresh adapter and capture its DOM lifecycle listeners.
 const listeners={};env.document.readyState='complete';
 env.document.getElementById=id=>id==='alm-features'?{}:null;
 env.document.querySelector=()=>({});env.document.addEventListener=(type,fn,capture)=>{if(capture)listeners[type]=fn;};
 env.AlmStraightUI.attach=()=>({refresh(){}});
 runInNewContext(readFileSync(new URL('../../../../pubbias-tests/alm-straight.js',import.meta.url),'utf8'),env);
 assert.equal(c().k,4);
 listeners.click({target:{id:'btn-run'}});assert.equal(c().estimates,undefined);
 plus={result:{k:3,full:{conditional:{status:'ok',values:{ciLo:-.3,ciHi:.5}}}}};
 assert.equal(c().k,3);assert.equal(c().estimates[0].lo,-.3);
 listeners.input({target:{id:'src'}});assert.equal(c().estimates,undefined);
});

// Corpus rendering/restoration happens between event-loop turns. Advice must settle
// in the MutationObserver checkpoint, not in a later timer holding a fixture's state.
test('result observer publishes restored analysis before the next task',()=>{
 let observer, current={k:3}, reads=[];
 const target={}, env={document:{readyState:'complete',querySelector:s=>s==='#results'?target:null},
  setTimeout(){throw new Error('result refresh must not be deferred to another task');},
  clearTimeout(){}, MutationObserver:class {constructor(cb){observer=cb;}observe(){}},
  AlmStraight:{evaluate(app,c){reads.push(c.k);return {};}}};
 env.window=env;
 runInNewContext(readFileSync(new URL('../../../../shared/alm-straight-ui.js',import.meta.url),'utf8'),env);
 env.AlmStraightUI.attach({app:'cumulative-subgroup',ctx:()=>current,anchor:'#absent',watch:['#results']});
 current={k:20};observer();assert.equal(reads.at(-1),20);
 current={k:3};observer();assert.equal(reads.at(-1),3);
});

test('R evidence preserves page observations, raw inputs and missing interval values',async()=>{
 const writes=new Map();
 const source=readFileSync(new URL('../features-straight-v2.spec.mjs',import.meta.url),'utf8');
 const section=source.slice(source.indexOf('const evidenceRoot='),source.indexOf('async function check('))
  .replaceAll(['import','meta','url'].join('.'),JSON.stringify(new URL('../features-straight-v2.spec.mjs',import.meta.url).href));
 const env={URL,mkdir:async()=>{},writeFile:async(url,text)=>writes.set(url.pathname.split('/').at(-1),text)};
 runInNewContext(section+';this.exportEvidence=exportR;',env);
 const page={evaluate:async()=>({input:'"study, one",0.2,0.1\nB,0.4,0.2',
  controls:[['choice','quoted "value"']],values:{tau2:0,estimator:'PM'},
  fired:['SP-PIT-NONSIG@1']})};
 await env.exportEvidence(page,'heterogeneity','example',{k:2,es:[{lo:-.2,hi:.4,nul:0}],e:[]});
 assert.equal(writes.get('input.txt'),'"study, one",0.2,0.1\nB,0.4,0.2');
 assert.equal(writes.get('fired.txt'),'SP-PIT-NONSIG@1','must retain actual page rules, even when oracle differs');
 assert.equal(writes.get('controls.csv'),'"key","value"\n"choice","quoted ""value"""\n');
 assert.equal(writes.get('estimates.csv'),'"lo","hi","nul","piLo","piHi"\n"-0.2","0.4","0","",""\n');
 assert.match(writes.get('observed.csv'),/"tau2","0"/);
 assert.match(writes.get('observed.csv'),/"k","2"/);
 assert.doesNotMatch(writes.get('observed.csv'),/undefined|NaN/);
});
