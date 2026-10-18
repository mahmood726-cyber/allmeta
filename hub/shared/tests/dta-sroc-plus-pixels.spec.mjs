import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
const corpus=JSON.parse(readFileSync(new URL('../../../dta-sroc/validate/corpus/plus-reference.json',import.meta.url),'utf8'));
// Windows Edge, fixed viewport/DPR and explicit pixel thresholds. Baselines are reviewed artefacts.
const options={threshold:0.2,maxDiffPixelRatio:0.0001,animations:'disabled',caret:'hide'};
const configs=[
 {id:'dat.kearon1998/year/reml/all',at:0,prevalence:0.1},
 {id:'dat.kearon1998/year/ml/single',at:-1,prevalence:0.01},
 {id:'dat.kearon1998/year/fixed/all',at:1,prevalence:0.5},
 {id:'dat.kearon1998/patients/reml/single',at:0,prevalence:0},
 {id:'dat.kearon1998/patients/ml/all',at:1,prevalence:1},
 {id:'dat.kearon1998/patients/fixed/single',at:-1,prevalence:0.1},
 {id:'dat.rivera2025/year/reml/none',at:0,prevalence:0.1},
 {id:'dat.rivera2025/year/ml/all',at:1,prevalence:0.5},
 {id:'dat.kearon1998/year/reml/all',at:0,prevalence:0.1,mobile:true},
 {id:'dat.rivera2025/year/fixed/none',at:-1,prevalence:0.01,mobile:true}
];
const targets={table:'#plus-results table',cards:'#plus-results dl',plot:'#plus-results svg'};
async function render(page,config){
 await page.setViewportSize(config.mobile?{width:390,height:844}:{width:1280,height:900});
 await page.goto('/dta-sroc/index.html',{waitUntil:'load'});
 await expect(page.locator('#plus-example option')).toHaveCount(28);
 const c=corpus.cases.find(c=>c.id===config.id);expect(c?.ok).toBe(true);
 const ok=await page.evaluate(({c,config})=>!!AlmDTAPlusUI.set({rows:c.rows,method:c.method,correction:c.correction,at:config.at,prevalence:config.prevalence}),{c,config});
 expect(ok).toBe(true);
}
async function capture(target,name,overrides={}){
 // Settle at the capture position: scrolling can change layout/compositing after
 // a one-off render-time font/animation wait (especially on the first capture).
 await target.scrollIntoViewIfNeeded();
 await target.evaluate(async element=>{
  element.getBoundingClientRect(); // Flush styles before querying fonts/animations.
  await document.fonts.ready;
  await Promise.all(document.getAnimations().filter(a=>a.playState!=='finished')
   .map(a=>a.finished));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 });
 await expect(target).toHaveScreenshot(name,{...options,...overrides});
}
for(const [i,config] of configs.entries())test(`DTA pixels ${i} ${config.id}`,async({page,browser})=>{
 console.log('PIXEL BROWSER',browser.version());await render(page,config);
 for(const [name,selector] of Object.entries(targets))await capture(page.locator(selector),`dta-sroc-${i}-${name}.png`);
});
for(const kind of ['table','cards','plot'])test(`DTA negative ${kind} presentation must fail pixels`,async({page})=>{
 await render(page,configs[0]);
 const target=page.locator(targets[kind]);
 await capture(target,`dta-sroc-0-${kind}.png`);
 // Renderer wrapper from REVIEW_133_r3: text and parsed numbers stay unchanged.
 await page.evaluate(kind=>{
  const original=AlmDTAPlusUI.set;
  AlmDTAPlusUI.set=s=>{const model=original(s);if(model){
   if(kind==='plot')document.querySelector('#plus-results [data-region="prediction"]').setAttribute('stroke','white');
   else for(const cell of document.querySelectorAll(kind==='table'?'#plus-results td':'#plus-results dd')){
    const bdo=document.createElement('bdo');bdo.dir='rtl';bdo.textContent=cell.textContent;cell.replaceChildren(bdo);
   }
  }return model;};
  AlmDTAPlusUI.set(AlmDTAPlusUI.input());
 },kind);
 test.fail(true,'Deliberately corrupted presentation must fail the real screenshot matcher');
 await capture(target,`dta-sroc-0-${kind}.png`,{timeout:2000});
});
