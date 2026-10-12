import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const out='artifacts/confirmed-external-plots';await fs.mkdir(out,{recursive:true});const browser=await chromium.launch(),results=[];
async function svg(page,selector){const plot=page.locator(selector).first();await expect(plot).toBeVisible({timeout:90000});await expect.poll(()=>plot.locator('path,circle,rect,line,polygon,polyline').count(),{timeout:90000}).toBeGreaterThan(2);expect(await plot.evaluate(e=>[...e.querySelectorAll('*')].flatMap(m=>[...m.attributes].filter(a=>/^(d|points|cx|cy|r|x|y|x1|x2|y1|y2|width|height)$/.test(a.name)&&/NaN|Infinity/.test(a.value)).map(a=>a.value)))).toEqual([]);}
const cases=[
 ['adaptsim','adaptsim/e156-submission/assets/adaptsim.html',async(p,r)=>{
  // The example button already computes and opens Boundaries.
  await p.locator('#exDapaHF').click();await svg(p,'#boundaryChart');r.plots.push('boundary');
  await p.locator('#tab-oc').click();await p.locator('#numSims').selectOption('10000');await p.locator('#runSimBtn').click();
  for(const id of ['powerChart','asnChart','stoppingChart']){await svg(p,'#'+id);r.plots.push(id);}
  await p.locator('#tab-ssr').click();await p.locator('#runSSRBtn').click();await svg(p,'#ssrChart');r.plots.push('ssrChart');
 }],
 ['al-mizan','al-mizan/e156-submission/assets/al-mizan.html',async(p,r)=>{
  await p.locator('#inputMode-examples').check();await p.locator('#exSteroids').click();await p.locator('#runAnalysisBtn').click();await p.locator('#tab-balance').click();
  for(const id of ['tsaSvgContainer','forestSvgContainer']){await svg(p,'#'+id+' svg');r.plots.push(id);}
  await p.locator('#tab-waste').click();await svg(p,'#wasteSvgContainer svg');r.plots.push('wasteSvgContainer');
 }],
 ['cardiosynth','cardiosynth/phase0/colchicine-stemi.html',async(p,r)=>{
  await p.evaluate(()=>loadDemoData());
  for(const [panel,id] of [['panelPrimary','primaryForest'],['panelCumulative','cumulativeChart']]){await p.locator('.nav-tab[data-panel="'+panel+'"]').click();await svg(p,'#'+id+' svg');r.plots.push(id);}
  await p.locator('.nav-tab[data-panel="panelBias"]').click();await expect(p.locator('#biasFunnel')).toContainText('requires k >= 10');r.prerequisites=['five-study example correctly does not display a funnel plot'];
  const before=await p.evaluate(()=>JSON.stringify(STATE));
  await p.evaluate(()=>{
   const data=Array.from({length:12},(_,i)=>({id:'Synthetic_'+i,title:'Synthetic '+i,yi:-.3+i*.035,vi:.02+i*.003}));
   const host=document.createElement('div');host.id='synthetic-funnel-check';host.innerHTML=renderFunnelPlotSVG(data);document.getElementById('panelBias').appendChild(host);
  });
  await svg(p,'#synthetic-funnel-check svg');r.plots.push('funnel renderer with separate 12-study synthetic input');
  expect(await p.evaluate(()=>JSON.stringify(STATE))).toBe(before);
 }]
];
async function run(c,width){const[name,path,flow]=c,ctx=await browser.newContext({viewport:{width,height:950}}),p=await ctx.newPage(),r={name,width,plots:[],errors:[]};p.on('pageerror',e=>r.errors.push(e.message));p.on('dialog',d=>d.dismiss());p.setDefaultTimeout(15000);try{await p.goto('https://mahmood726-cyber.github.io/'+path,{waitUntil:'load'});await flow(p,r);expect(r.errors).toEqual([]);r.passed=true;}catch(e){r.passed=false;r.error=e.stack;}finally{await p.screenshot({path:out+'/'+name+'-'+width+'.png'}).catch(()=>{});results.push(r);await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));await ctx.close();}}
try{for(const width of [1280,390])await Promise.all(cases.map(c=>run(c,width)));}finally{await browser.close();}
console.log(JSON.stringify(results));if(results.some(r=>!r.passed))process.exitCode=1;
