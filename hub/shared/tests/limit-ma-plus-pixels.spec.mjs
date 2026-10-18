import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
const corpus=JSON.parse(readFileSync(new URL('../../../limit-ma/validate/plus/corpus.json',import.meta.url),'utf8'));
const options={threshold:0.2,maxDiffPixelRatio:0.005,animations:'disabled',caret:'hide'};
test.use({viewport:{width:1280,height:900},deviceScaleFactor:1,reducedMotion:'reduce',colorScheme:'light'});
test.beforeEach(async({page})=>{
 await page.goto('/limit-ma/index.html',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished)));
 await page.evaluate(()=>document.fonts.ready);
});
// Explicit corpus IDs and controls; no generated statistical expectations.
const configs=[
  {
    "id": "dat.aloe2013::001",
    "mask": 15
  },
  {
    "id": "dat.aloe2013::001",
    "mask": 0
  },
  {
    "id": "dat.aloe2013::002",
    "mask": 1
  },
  {
    "id": "dat.aloe2013::003",
    "mask": 2
  },
  {
    "id": "dat.anand1999::001",
    "mask": 4
  },
  {
    "id": "dat.anker2025::001",
    "mask": 8
  },
  {
    "id": "dat.anker2025::002",
    "mask": 3
  },
  {
    "id": "dat.assink2016::001",
    "mask": 12
  },
  {
    "id": "dat.axfors2021::001",
    "mask": 5
  },
  {
    "id": "dat.anker2025::004",
    "mask": 10
  }
];
async function render(page,config){
 await page.evaluate(()=>AlmLimitPlusReady);
 const c=corpus.find(c=>c.id===config.id);expect(c).toBeTruthy();
 await page.evaluate(({c,mask})=>{
  __almLimitValidationRun(c.te.map((x,i)=>x+','+c.se[i]).join('\n'),true);
  ['limit','fill','reg','contour'].forEach((id,i)=>document.getElementById('plus-'+id+'-toggle').checked=!!(mask&(1<<i)));
  const limit=_almLastLimit();AlmLimitPlusUI.render(AlmLimitPlus.compute(c,limit),c,limit);
 },{c,mask:config.mask});
}
const plots=['plus-forest','plus-funnel'];

for(const [i,config] of configs.entries())test(`pixels ${i} ${config.id} ${JSON.stringify(config)}`,async({page,browser})=>{
 console.log('PIXEL BROWSER',browser.version());
 await render(page,config);
 for(const id of plots)await expect(page.locator('#'+id)).toHaveScreenshot(`${i}-${id}.png`,options);
});
test('negative altered render fails pixel comparison',async({page})=>{
 await render(page,configs[0]);
 const plot=page.locator('#'+plots[0]);
 await expect(plot).toHaveScreenshot(`0-${plots[0]}.png`,options);
 await plot.evaluate(svg=>svg.style.filter='opacity(0)');
 test.fail(true,'Deliberately hidden plot must fail the real screenshot matcher');
 await expect(plot).toHaveScreenshot(`0-${plots[0]}.png`,{...options,timeout:2000});
});
