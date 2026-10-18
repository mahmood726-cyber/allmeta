import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
const corpus=JSON.parse(readFileSync(new URL('../../../gosh/validate/plus/corpus.json',import.meta.url),'utf8'));
const options={threshold:0.2,maxDiffPixelRatio:0.005,animations:'disabled',caret:'hide'};
test.use({viewport:{width:1280,height:900},deviceScaleFactor:1,reducedMotion:'reduce',colorScheme:'light'});
test.beforeEach(async({page})=>{
 await page.goto('/gosh/index.html',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished)));
 await page.evaluate(()=>document.fonts.ready);
});
// Explicit corpus IDs and controls; no generated statistical expectations.
const configs=[
  {
    "id": "dat.aloe2013::001",
    "model": "DL",
    "het": "I2",
    "study": "1"
  },
  {
    "id": "dat.aloe2013::001",
    "model": "DL",
    "het": "H2",
    "study": "2"
  },
  {
    "id": "dat.aloe2013::001",
    "model": "DL",
    "het": "Q",
    "study": "3"
  },
  {
    "id": "dat.aloe2013::001",
    "model": "DL",
    "het": "tau2",
    "study": "4"
  },
  {
    "id": "dat.aloe2013::001",
    "model": "DL",
    "het": "tau",
    "study": "5"
  },
  {
    "id": "dat.anker2025::001",
    "model": "FE",
    "het": "I2",
    "study": "2"
  },
  {
    "id": "dat.anker2025::001",
    "model": "FE",
    "het": "H2",
    "study": "2"
  },
  {
    "id": "dat.anker2025::001",
    "model": "FE",
    "het": "Q",
    "study": "2"
  },
  {
    "id": "dat.anand1999::001",
    "model": "DL",
    "het": "I2",
    "study": "3"
  },
  {
    "id": "dat.anand1999::001",
    "model": "DL",
    "het": "tau2",
    "study": "3"
  }
];
async function render(page,config){
 const c=corpus.find(c=>c.id===config.id);expect(c).toBeTruthy();
 await page.waitForFunction(()=>typeof AlmGoshPlus!=='undefined');
 await page.evaluate(({c,model})=>AlmGoshPlus.render(AlmGoshPlus.capture(c.te.map((x,i)=>`${x}, ${c.se[i]}, ${c.source_rows[i]}`).join('\n'),model,5000)),{c,model:config.model});
 await page.locator('#plus-study').selectOption(config.study);
 await page.locator('#plus-het').selectOption(config.het);
}
const plots=['plus-plot'];

for(const [i,config] of configs.entries())test(`pixels ${i} ${config.id} ${JSON.stringify(config)}`,async({page,browser})=>{
 console.log('PIXEL BROWSER',browser.version());
 await render(page,config);
 for(const id of plots)await expect(page.locator('#'+id)).toHaveScreenshot(`${i}-${id}.png`,options);
});
test('negative altered render fails pixel comparison',async({page})=>{
 // Dense sampled plot makes the negative comfortably exceed the 0.5% budget.
 await render(page,configs[8]);
 const plot=page.locator('#'+plots[0]);
 await expect(plot).toHaveScreenshot(`8-${plots[0]}.png`,options);
 await plot.evaluate(svg=>svg.style.filter='opacity(0)');
 test.fail(true,'Deliberately hidden plot must fail the real screenshot matcher');
 await expect(plot).toHaveScreenshot(`8-${plots[0]}.png`,{...options,timeout:2000});
});
