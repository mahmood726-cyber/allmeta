// Read-only diagnostic audit. A load or pixel count is not statistical validation.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const out='artifacts/remaining-entrypoints';await fs.mkdir(out,{recursive:true});
const local=process.env.ALM_BASE_URL||'http://127.0.0.1:8080';
const targets=[
 ['annualised-plot',local+'/r-shiny/annualised-plot/','r'],
 ['mean-single-group',local+'/r-shiny/mean-single-group/','r'],
 ['dta-diagnostic',local+'/r-shiny/dta-diagnostic/','r'],
 ['webr-validator',local+'/webr-validator/index.html','numeric'],
 ['screenr','https://mahmood726-cyber.github.io/rayyanreplacement/','external'],
 ['adaptsim','https://mahmood726-cyber.github.io/adaptsim/','external'],
 ['al-mizan','https://mahmood726-cyber.github.io/al-mizan/','external'],
 ['cardiooracle','https://mahmood726-cyber.github.io/cardiooracle/','external'],
 ['cardiosynth','https://mahmood726-cyber.github.io/cardiosynth/phase0/colchicine-stemi.html','external'],
 ['nice-cardiology','https://mahmood726-cyber.github.io/nice-cardiology-guidance/','external']
];
function snapshot(){
 const visible=e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden';};
 return {title:document.title,url:location.href,text:document.body.innerText.slice(0,15000),
  buttons:[...document.querySelectorAll('button,input[type="button"],input[type="submit"],a[data-toggle],a[data-bs-toggle]')].filter(visible).map(e=>({id:e.id,text:(e.innerText||e.value||'').trim().slice(0,100),onclick:e.getAttribute('onclick'),value:e.dataset.value,href:e.getAttribute('href')})),
  selects:[...document.querySelectorAll('select')].map(e=>({id:e.id,value:e.value,options:[...e.options].map(o=>({value:o.value,text:o.text}))})),
  plots:[...document.querySelectorAll('canvas,svg,img')].filter(visible).filter(e=>e.getBoundingClientRect().width>100&&e.getBoundingClientRect().height>60).map(e=>{const b=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,parent:e.parentElement.id,width:b.width,height:b.height,marks:e.querySelectorAll('path,circle,rect,line,polygon,polyline').length,src:e.tagName==='IMG'?e.getAttribute('src')?.slice(0,80):null,naturalWidth:e.naturalWidth,canvasWidth:e.width,canvasHeight:e.height};}),
  errors:[...document.querySelectorAll('.shiny-output-error,[role="alert"],.error-message')].filter(visible).map(e=>e.textContent)};
}
const results=[];const browser=await chromium.launch();
async function probe([name,url,type],width){
 const r={name,type,width,url,errors:[],failedRequests:[],console:[],actions:[],panels:[]};
 const ctx=await browser.newContext({viewport:{width,height:950}}),page=await ctx.newPage();
 page.on('pageerror',e=>r.errors.push(e.message));
 page.on('requestfailed',req=>r.failedRequests.push({url:req.url(),error:req.failure()?.errorText}));
 page.on('console',msg=>{if(['error','warning'].includes(msg.type()))r.console.push(msg.text().slice(0,2000));});
 page.on('dialog',d=>d.dismiss());
 page.setDefaultTimeout(12000);
 async function record(label,frame=page){r.panels.push({label,...await frame.evaluate(snapshot)});await page.screenshot({path:`${out}/${name}-${width}-${label.replace(/\W+/g,'-')}.png`,fullPage:false});}
 async function frameWith(selector,timeout=140000){const end=Date.now()+timeout;while(Date.now()<end){for(const f of page.frames()){try{if(await f.locator(selector).count())return f;}catch{}}await page.waitForTimeout(500);}throw Error('R app never exposed '+selector);}
 async function reveal(frame,value){const a=frame.locator(`a[data-value="${value}"]`).first();if(await a.count()){await a.evaluate(e=>e.click());r.actions.push('tab:'+value);await page.waitForTimeout(1600);}else throw Error('Missing app tab '+value);}
 async function waitPlot(frame,id){await frame.waitForFunction(id=>{const e=document.getElementById(id);const img=e?.querySelector('img');return !!img&&img.complete&&img.naturalWidth>0;},id,{timeout:30000});}
 try{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  if(type==='r'){
   const frame=await frameWith('.main-sidebar');
   if(name==='annualised-plot'){
    await reveal(frame,'plot');
    for(const [label,id] of [['Bar+Scatter','barScatterPlot'],['Boxplot+Scatter','boxScatterPlot'],['Violin+Scatter','violinScatterPlot'],['Scatter Only','scatterPlot'],['Histogram','histPlot'],['Density Plot','densityPlot'],['ECDF Plot','ecdfPlot']]){
     try{const a=frame.getByRole('tab',{name:label,exact:true});if(await a.count())await a.click();else await frame.getByText(label,{exact:true}).first().click();await waitPlot(frame,id);await record(id,frame);}catch(e){r.panels.push({label:id,error:e.message});}
    }
   }else if(name==='mean-single-group'){
    for(const [tab,ids] of [['tab_forest',['forest_plot','funnel_plot']],['tab_diag',['baujat_plot']],['tab_extra',['cum_forest','fixed_effect_forest']],['tab_advanced',['effect_dist','forest_sorted','density_plot']],['tab_subgroup',['subgroup_forest']]]){
     await reveal(frame,tab);for(const id of ids){try{await waitPlot(frame,id);r.actions.push('populated:'+id);}catch(e){r.panels.push({label:id,error:e.message});}}await record(tab,frame);
    }
   }else{
    const csv='status,test_value\n'+Array.from({length:80},(_,i)=>`${i%2},${(i%2?0.4:0.1)+(i%17)/25}`).join('\n');
    await frame.locator('#file_dta').setInputFiles({name:'synthetic-dta.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
    await page.waitForTimeout(1800);await frame.locator('#analyze_btn').click();
    for(const [tab,ids] of [['std_metrics',['roc_plot']],['adv_metrics',['pr_curve_plot']],['plots',['boxplot_test','hist_test','density_plot','calibration_plot']]]){
     await reveal(frame,tab);for(const id of ids){try{await waitPlot(frame,id);r.actions.push('populated:'+id);}catch(e){r.panels.push({label:id,error:e.message});}}await record(tab,frame);
    }
   }
  }else{
   await page.waitForTimeout(800);
   const launch=page.locator('a.card.app').first();
   if(type==='external'&&await launch.count()){r.actions.push('follow actual app link');await launch.click();await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(800);}
   await record('initial');
   await fs.writeFile(`${out}/${name}-${width}.html`,await page.content());
   // Only explicit built-in example/demo actions. Never send API queries or user information.
   for(const selector of ['button:has-text("Load Demo")','button:has-text("Load Example")','button:has-text("Load sample")']){
    const b=page.locator(selector).first();if(await b.count()&&await b.isVisible()&&await b.isEnabled()){await b.click();r.actions.push(selector);await page.waitForTimeout(800);await record('example');break;}
   }
  }
 }catch(e){r.fatal=e.message;for(const f of page.frames()){try{r.panels.push({label:'failure-frame',...await f.evaluate(snapshot)});}catch{}}await page.screenshot({path:`${out}/${name}-${width}-failed.png`}).catch(()=>{});}
 finally{await ctx.close();results.push(r);await fs.writeFile(out+'/observations.json',JSON.stringify(results,null,2));console.log(JSON.stringify({name,width,fatal:r.fatal,actions:r.actions,errors:r.errors,panels:r.panels.map(p=>({label:p.label,error:p.error,plots:p.plots?.length}))}));}
}
for(const width of [1280,390])for(let i=0;i<targets.length;i+=3)await Promise.all(targets.slice(i,i+3).map(t=>probe(t,width)));
await browser.close();
