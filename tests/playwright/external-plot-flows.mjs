// Explicit live-site audit. Does not run in ordinary local CI or send clinical data.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const out='artifacts/external-plot-flows';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[];
async function svg(page,selector){const e=page.locator(selector).first();await expect(e).toBeVisible({timeout:45000});await expect.poll(()=>e.locator('path,circle,line,rect,polygon,polyline').count(),{timeout:45000}).toBeGreaterThan(2);const bad=await e.evaluate(el=>[...el.querySelectorAll('*')].flatMap(m=>[...m.attributes].filter(a=>/^(d|points|cx|cy|r|x|y|x1|x2|y1|y2|width|height)$/.test(a.name)&&/NaN|Infinity/.test(a.value)).map(a=>a.value)));expect(bad).toEqual([]);}
async function plotly(page,id){await svg(page,'#'+id+' svg.main-svg');await expect.poll(()=>page.locator('#'+id).evaluate(e=>e.data?.length||0)).toBeGreaterThan(0);}
const cases=[
 ['adaptsim','adaptsim/e156-submission/assets/adaptsim.html',async(p,r)=>{
  await p.locator('#exDapaHF').click();await p.locator('#computeBtn').click();await p.locator('#tab-boundaries').click();await svg(p,'#boundaryChart');r.checked.push('boundaryChart');
  await p.locator('#tab-oc').click();await p.locator('#numSims').selectOption('10000');await p.locator('#runSimBtn').click();
  for(const id of ['powerChart','asnChart','stoppingChart']){await svg(p,'#'+id);r.checked.push(id);}
  await p.locator('#tab-ssr').click();await p.locator('#runSSRBtn').click();await svg(p,'#ssrChart');r.checked.push('ssrChart');
 }],
 ['al-mizan','al-mizan/e156-submission/assets/al-mizan.html',async(p,r)=>{
  await p.locator('#inputMode-examples').check();await p.locator('#exSteroids').click();await p.locator('#runAnalysisBtn').click();
  await p.locator('#tab-balance').click();for(const id of ['tsaSvgContainer','forestSvgContainer']){await svg(p,'#'+id+' svg');r.checked.push(id);}
  await p.locator('#tab-waste').click();await svg(p,'#wasteSvgContainer svg');r.checked.push('wasteSvgContainer');
 }],
 ['cardiooracle','cardiooracle/e156-submission/assets/CardioOracle.html',async(p,r)=>{
  await p.evaluate(()=>{if(typeof dismissTutorial==='function')dismissTutorial();});
  await p.locator('#tab-calibration').click();for(const id of ['calibPlotDiv','rocPlotDiv']){await plotly(p,id);r.checked.push(id);}
  await p.setViewportSize({width:r.width+30,height:950});for(const id of ['calibPlotDiv','rocPlotDiv'])await plotly(p,id);
 }],
 ['cardiosynth','cardiosynth/phase0/colchicine-stemi.html',async(p,r)=>{
  await p.evaluate(()=>loadDemoData());
  for(const [panel,id] of [['panelPrimary','primaryForest'],['panelCumulative','cumulativeChart'],['panelBias','biasFunnel']]){
   await p.locator('.nav-tab[data-panel="'+panel+'"]').click();await svg(p,'#'+id+' svg');r.checked.push(id);
  }
 }],
 ['screenr','rayyanreplacement/screenr.html',async(p,r)=>{
  await p.evaluate(()=>loadExampleDataset());await p.waitForTimeout(500);
  for(const [name,open,close,selector] of [
   ['forest','showMetaAnalysis','closeMetaModal','#metaContent svg'],
   ['prisma','showPRISMA','closePrismaModal','#prismaContent svg'],
   ['funnel','showFunnelPlot','closeFunnelModal','#funnelSvg'],
   ['sensitivity','showSensitivityAnalysis','closeSensitivityModal','#sensitivityModal svg']]){
   try{await p.evaluate(fn=>window[fn](),open);await svg(p,selector);r.checked.push(name);}
   catch(e){r.failures.push({name,error:e.message});}
   await p.evaluate(fn=>{if(typeof window[fn]==='function')window[fn]();else document.querySelectorAll('.modal-overlay.active').forEach(e=>e.classList.remove('active'));},close);
  }
 }]
];
async function run([name,path,flow],width){const r={name,width,checked:[],failures:[],errors:[]};const ctx=await browser.newContext({viewport:{width,height:950}}),p=await ctx.newPage();p.setDefaultTimeout(18000);p.on('dialog',d=>d.dismiss());p.on('pageerror',e=>r.errors.push(e.message));try{await p.goto('https://mahmood726-cyber.github.io/'+path,{waitUntil:'load',timeout:45000});await flow(p,r);}catch(e){r.failures.push({name:'workflow',error:e.message});}finally{r.url=p.url();r.body=await p.locator('body').innerText().catch(()=> '');r.plots=await p.evaluate(()=>[...document.querySelectorAll('svg,canvas,.js-plotly-plot')].map(e=>{const b=e.getBoundingClientRect();return {id:e.id,tag:e.tagName,width:b.width,height:b.height,data:e.data?.length||0};})).catch(()=>[]);await p.screenshot({path:out+'/'+name+'-'+width+'.png',fullPage:false}).catch(()=>{});await ctx.close();results.push(r);await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(r));}}
for(const width of [1280,390])for(let i=0;i<cases.length;i+=3)await Promise.all(cases.slice(i,i+3).map(c=>run(c,width)));
await browser.close();
