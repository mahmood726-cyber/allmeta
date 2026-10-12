import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test.describe.configure({mode:'parallel'});
const rows=[{study:'Trial A',effect:.2,se:.1,year:2020},{study:'Trial B',effect:.5,se:.2,year:2021},{study:'Trial C',effect:-.1,se:.15,year:2022},{study:'Trial D',effect:.4,se:.12,year:2023}];
const network=[
 {study:'AB1',treatment:'A',n:100,events:20},{study:'AB1',treatment:'B',n:100,events:10},
 {study:'AC',treatment:'A',n:100,events:25},{study:'AC',treatment:'C',n:100,events:15},
 {study:'BC',treatment:'B',n:100,events:12},{study:'BC',treatment:'C',n:100,events:18},
 {study:'AB2',treatment:'A',n:100,events:18},{study:'AB2',treatment:'B',n:100,events:12}
];
async function open(page,section='meta-methods') {
 await page.addInitScript(()=>{localStorage.setItem('hta_tutorial_seen','true');localStorage.setItem('hta-tutorial-completed','true');});
 await page.goto('/HTA/index.html',{waitUntil:'load'});
 await page.waitForFunction(()=>!!window.advancedUI&&!!window.beginnerMode);
 await page.evaluate(section=>{app.loadDemoModel();app.navigateToSection(section);},section);
}
async function upload(page,kind,data,type='json') {
 const content=type==='json'?JSON.stringify(data):data;
 const chooser=page.waitForEvent('filechooser',{timeout:3000});
 await page.locator('#btn-import-'+kind+'-data').click();
 await (await chooser).setFiles({name:'audit.'+type,mimeType:type==='json'?'application/json':'text/csv',buffer:Buffer.from(content)});
 await expect.poll(()=>page.locator('#hta-'+kind+'-status').textContent()).not.toContain('Reading input');
}
async function populated(page,id) {
 const svg=page.locator('#'+id);await expect(svg).toBeVisible();
 expect(await svg.evaluate(s=>{const b=s.getBoundingClientRect(),p=s.parentElement.getBoundingClientRect();return b.width>100&&b.height>50&&b.left>=p.left-1&&b.right<=p.right+1;})).toBe(true);
 expect(await svg.locator('line,path,circle,polygon,rect[data-pscore]').count()).toBeGreaterThan(0);
 expect(await svg.evaluate(s=>[...s.querySelectorAll('*')].flatMap(e=>[...e.attributes]).filter(a=>/^(d|points|x|y|x1|x2|y1|y2|cx|cy|width|height)$/.test(a.name)&&/NaN|Infinity/.test(a.value)).map(a=>a.value))).toEqual([]);
 expect(await svg.evaluate(s=>!new DOMParser().parseFromString(new XMLSerializer().serializeToString(s),'image/svg+xml').querySelector('parsererror'))).toBe(true);
 return svg;
}
async function download(page,button) {
 const p=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();
 const d=await p;return {name:d.suggestedFilename(),content:await readFile(await d.path(),'utf8')};
}
function independentDL(data) {
 const w=data.map(s=>1/s.se**2),sum=w.reduce((a,b)=>a+b,0),fixed=w.reduce((a,x,i)=>a+x*data[i].effect,0)/sum;
 const q=w.reduce((a,x,i)=>a+x*(data[i].effect-fixed)**2,0),c=sum-w.reduce((a,b)=>a+b*b,0)/sum;
 const tau=Math.max(0,(q-(data.length-1))/c),wr=data.map(s=>1/(s.se*s.se+tau)),sw=wr.reduce((a,b)=>a+b,0);
 return {tau,effect:wr.reduce((a,x,i)=>a+x*data[i].effect,0)/sw,se:Math.sqrt(1/sw),weights:wr.map(x=>100*x/sw)};
}
for(const width of [1280,390]) test.describe(`Advanced HTA at ${width}px`,()=>{
 test.use({viewport:{width,height:900}});
 test('pairwise CSV imports drive fitted plots, chosen intervals and exact exports',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  const csv='study,effect,se,year\r\n'+rows.map(s=>`"${s.study}",${s.effect},${s.se},${s.year}`).join('\r\n');
  await upload(page,'ma',csv,'csv');await expect(page.locator('#hta-ma-status')).toContainText('Imported 4');
  await page.locator('#ma-tau-method').selectOption('DL');await page.locator('#ma-ci-level').selectOption('0.90');await page.locator('#ma-effect-measure').selectOption('MD');
  await page.locator('#btn-run-ma').click();const forest=await populated(page,'hta-advanced-ma-forest');
  const fit=await page.evaluate(()=>advancedUI.synthesis.fit.ma),expected=independentDL(rows),z=1.6448536269514722;
  expect(fit.result.random.effect).toBeCloseTo(expected.effect,12);expect(fit.result.random.se).toBeCloseTo(expected.se,12);expect(fit.result.heterogeneity.tauSquared).toBeCloseTo(expected.tau,12);
  expect(fit.result.random.ci_lower).toBeCloseTo(expected.effect-z*expected.se,6);
  const plotted=await forest.evaluate(s=>s.__plotData);expect(plotted.at(-1).lo).toBe(fit.result.random.ci_lower);expect(plotted.at(-1).hi).toBe(fit.result.random.ci_upper);
  for(let i=0;i<rows.length;i++){expect(plotted[i].effect).toBe(rows[i].effect);expect(plotted[i].weight).toBeCloseTo(expected.weights[i],10);expect(plotted[i].lo).toBeCloseTo(rows[i].effect-z*rows[i].se,6);}
  const payload=JSON.parse((await download(page,'Download fitted ma JSON')).content);expect(payload).toEqual(fit);
  const csvExport=(await download(page,'Download fitted ma CSV')).content;fit.result.weights.random.forEach(w=>expect(csvExport).toContain(String(w)));expect(csvExport).toContain('"0.9","normal","MD"');
  const xml=await forest.evaluate(s=>new XMLSerializer().serializeToString(s));const image=await download(page,'Download Forest plot (90% normal intervals) SVG');expect(image.content).toBe(xml);expect(image.name).toBe('hta-advanced-ma-forest.svg');
  await page.evaluate(()=>{window.__refits=0;const f=MetaAnalysisMethods.prototype.calculatePooledEffect;MetaAnalysisMethods.prototype.calculatePooledEffect=function(...args){__refits++;return f.apply(this,args);};});
  await page.locator('#section-meta-methods .tab[data-tab="cumulative"]').click();await populated(page,'hta-advanced-ma-cumulative');
  expect(await page.locator('#hta-advanced-ma-cumulative').evaluate(s=>s.__plotData.at(-1).effect)).toBeCloseTo(fit.result.random.effect,12);
  // Selecting this group's tab must not deactivate the NMA group's default tab.
  await expect(page.locator('#tab-node-split')).toHaveClass(/active/);
  await page.setViewportSize({width:width+35,height:950});await populated(page,'hta-advanced-ma-cumulative');
  expect(await page.evaluate(()=>__refits)).toBe(0);expect(await page.evaluate(()=>advancedUI.synthesis.fit.ma)).toEqual(fit);
  expect(await page.locator('#ma-loo-body tr').count()).toBe(4);expect(await page.locator('#ma-influence-body tr').count()).toBe(4);
  expect(errors).toEqual([]);await info.attach('advanced-forest',{body:await forest.screenshot(),contentType:'image/png'});
 });
 test('pairwise reanalysis clears stale data, settings and invalid imports',async({page})=>{
  await open(page);await upload(page,'ma',rows);await page.locator('#btn-run-ma').click();await populated(page,'hta-advanced-ma-forest');
  await page.locator('#ma-ci-level').selectOption('0.99');await expect(page.locator('#ma-results')).toBeHidden();await expect(page.locator('#hta-advanced-ma-forest')).toHaveCount(0);
  await page.locator('#btn-run-ma').click();await populated(page,'hta-advanced-ma-forest');expect(await page.evaluate(()=>advancedUI.synthesis.fit.ma.options.ciLevel)).toBe(.99);
  await page.locator('#ma-pred-int').selectOption('false');await page.locator('#btn-run-ma').click();await expect(page.locator('#ma-pred-interval')).toHaveText('Not requested');
  const replacement=rows.map((s,i)=>({...s,study:i===0?'New, "quoted" <img src=x onerror=alert(1)>':'New '+i,effect:s.effect+.5}));
  await upload(page,'ma','study,effect,se\n'+replacement.map(s=>`"${s.study.replaceAll('"','""')}",${s.effect},${s.se}`).join('\n'),'csv');
  await page.locator('#btn-run-ma').click();await populated(page,'hta-advanced-ma-forest');
  expect(await page.locator('#hta-advanced-ma-forest').evaluate(s=>s.__plotData[0].name)).toBe(replacement[0].study);await expect(page.locator('#ma-results img')).toHaveCount(0);
  await upload(page,'ma','study,effect,se\nBad,,0.1\nOther,0.2,0.2','csv');await expect(page.locator('#hta-ma-status')).toHaveAttribute('data-state','error');await expect(page.locator('#hta-advanced-ma-forest')).toHaveCount(0);
  expect(await page.evaluate(()=>advancedUI.synthesis.data.ma)).toBeNull();expect(await page.evaluate(()=>advancedUI.synthesis.fit.ma)).toBeNull();
  await upload(page,'ma',[rows[0],rows[0]]);await expect(page.locator('#hta-ma-status')).toContainText('Duplicate study');
 });
 test('network imports populate four actual-data plots with consistent reference/export',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page,'nma');await upload(page,'nma',network);
  await page.locator('#nma-reference').selectOption('A');await page.locator('#btn-run-nma').click();
  for(const id of ['hta-advanced-network','hta-advanced-nma-forest','hta-advanced-nma-pscore','hta-advanced-nma-funnel'])await populated(page,id);
  const fit=await page.evaluate(()=>advancedUI.synthesis.fit.nma);expect(fit.result.model).toBe('fixed');expect(fit.result.reference).toBe('A');
  // Independent two-parameter weighted least squares on explicitly computed log ORs.
  const contrasts=[];for(let i=0;i<network.length;i+=2){const a=network[i],b=network[i+1];contrasts.push({effect:Math.log(a.events/(a.n-a.events))-Math.log(b.events/(b.n-b.events)),v:1/a.events+1/(a.n-a.events)+1/b.events+1/(b.n-b.events),x:[(b.treatment==='B'?1:0)-(a.treatment==='B'?1:0),(b.treatment==='C'?1:0)-(a.treatment==='C'?1:0)]});}
  let aa=0,ab=0,bb=0,ya=0,yb=0;for(const c of contrasts){aa+=c.x[0]**2/c.v;ab+=c.x[0]*c.x[1]/c.v;bb+=c.x[1]**2/c.v;ya+=c.x[0]*c.effect/c.v;yb+=c.x[1]*c.effect/c.v;}
  const det=aa*bb-ab*ab,expected=[(bb*ya-ab*yb)/det,(aa*yb-ab*ya)/det];
  fit.result.effects.forEach((r,i)=>expect(r.mean).toBeCloseTo(expected[i],12));
  expect(await page.locator('#hta-advanced-network circle[data-treatment]').evaluateAll(cs=>cs.map(c=>c.dataset.treatment).sort())).toEqual(['A','B','C']);
  expect(await page.locator('#hta-advanced-nma-forest').evaluate(s=>s.__plotData.map(r=>r.effect))).toEqual(fit.result.effects.map(r=>r.mean));
  expect(await page.locator('#hta-advanced-nma-pscore rect[data-pscore]').evaluateAll(rs=>rs.map(r=>Number(r.dataset.pscore)))).toEqual(fit.scores.map(r=>r.pScore));
  expect(await page.locator('#hta-advanced-nma-funnel').evaluate(s=>s.__plotData.rows.map(r=>r.effect))).toEqual(fit.funnel.data.map(r=>r.adjustedEffect));
  expect(JSON.parse((await download(page,'Download fitted nma JSON')).content)).toEqual(fit);
  const xml=await page.locator('#hta-advanced-network').evaluate(s=>new XMLSerializer().serializeToString(s));expect((await download(page,'Download Observed treatment network SVG')).content).toBe(xml);
  await page.evaluate(()=>{window.__nmaRefits=0;const f=NetworkMetaAnalysis.prototype.run;NetworkMetaAnalysis.prototype.run=function(...args){__nmaRefits++;return f.apply(this,args);};});
  await page.setViewportSize({width:width+30,height:950});await populated(page,'hta-advanced-network');expect(await page.evaluate(()=>__nmaRefits)).toBe(0);expect(await page.evaluate(()=>advancedUI.synthesis.fit.nma)).toEqual(fit);
  await info.attach('advanced-network',{body:await page.locator('#hta-advanced-network').screenshot(),contentType:'image/png'});expect(errors).toEqual([]);
 });
 test('continuous network is labelled SMD; incompatible networks never retain old plots',async({page})=>{
  await open(page,'nma');await page.locator('#nma-outcome').selectOption('continuous');
  const arms=network.map((r,i)=>({study:r.study,treatment:r.treatment,n:r.n,mean:10+r.events/10,sd:1.2+i*.1}));
  await upload(page,'nma','study,treatment,n,mean,sd\n'+arms.map(r=>[r.study,r.treatment,r.n,r.mean,r.sd].join(',')).join('\n'),'csv');
  await page.locator('#btn-run-nma').click();await populated(page,'hta-advanced-network');await expect(page.locator('#hta-nma-status')).toContainText('standardized mean differences');
  await page.locator('#nma-outcome').selectOption('binary');await expect(page.locator('#hta-advanced-network')).toHaveCount(0);
  await upload(page,'nma',network.concat([{study:'AB1',treatment:'Extra',n:100,events:12}]));await expect(page.locator('#hta-nma-status')).toContainText('two-arm');expect(await page.evaluate(()=>advancedUI.synthesis.data.nma)).toBeNull();
  await upload(page,'nma',[...network.slice(0,2),{study:'DE',treatment:'D',n:100,events:5},{study:'DE',treatment:'E',n:100,events:7}]);
  await page.locator('#btn-run-nma').click();await expect(page.locator('#hta-nma-status')).toContainText('disconnected');await expect(page.locator('#hta-advanced-network')).toHaveCount(0);
  await upload(page,'nma',network);await page.evaluate(()=>{document.querySelector('#nma-model').value='random';});await page.locator('#btn-run-nma').click();await expect(page.locator('#hta-nma-status')).toContainText('no model substitution');expect(await page.evaluate(()=>advancedUI.synthesis.fit.nma)).toBeNull();
 });
 test('publication-bias assessment respects selected tests and current data',async({page})=>{
  await open(page);await upload(page,'ma',rows);await page.evaluate(()=>app.navigateToSection('pub-bias'));await page.locator('#btn-run-pub-bias').click();
  await populated(page,'hta-advanced-pb-funnel');await populated(page,'hta-advanced-trimfill');const fit=await page.evaluate(()=>advancedUI.synthesis.fit.pb);
  expect(await page.locator('#hta-advanced-trimfill').evaluate(s=>s.__plotData.center)).toBe(fit.trimFill.adjusted.effect);
  expect(await page.locator('#hta-advanced-trimfill').evaluate(s=>s.__plotData.rows.filter(r=>r.imputed).map(r=>({effect:r.effect,se:r.se})))).toEqual(fit.trimFill.imputedStudies.map(r=>({effect:r.effect,se:r.se})));
  expect(await page.locator('#hta-advanced-pb-funnel').evaluate(s=>s.__plotData.rows.map(r=>r.effect))).toEqual(rows.map(r=>r.effect));
  await page.locator('.pub-bias-test[value="trim-fill"]').uncheck();await expect(page.locator('#pub-bias-results')).toBeHidden();await page.locator('#btn-run-pub-bias').click();await populated(page,'hta-advanced-pb-funnel');await expect(page.locator('#hta-advanced-trimfill')).toHaveCount(0);await expect(page.locator('#trim-fill-chart')).toContainText('not selected');
  await page.evaluate(()=>app.navigateToSection('meta-methods'));await upload(page,'ma',rows.slice(0,2));await page.evaluate(()=>app.navigateToSection('pub-bias'));await page.locator('#btn-run-pub-bias').click();await expect(page.locator('#hta-pb-status')).toContainText('At least three');await expect(page.locator('#hta-advanced-pb-funnel')).toHaveCount(0);
 });
 test('DTA placeholder routes exact counts to real SROC plots and downloadable project',async({page})=>{
  await open(page);const data=await page.evaluate(()=>{const d=beginnerMode.getSampleDatasets().diabetes;d.name='Unicode β diagnostic input';d.studies[0].study='Étude α';beginnerMode.runDTAAnalysis(d);return d;});
  const project=JSON.parse((await download(page,'Download DTA project JSON')).content);expect(project.title).toBe(data.name);expect(project.data).toContain('Étude α,45,12,5,138');
  const popup=page.waitForEvent('popup');await page.locator('#hta-open-dta').click();const target=await popup;await target.waitForLoadState('load');
  await expect(target.locator('#svg-host svg')).toBeVisible();const result=await target.evaluate(()=>__almResults());expect(result.errors).toEqual([]);
  expect(result.rows.map(s=>({study:s.study,TP:s.TP,FP:s.FP,FN:s.FN,TN:s.TN}))).toEqual(data.studies);await target.close();
  await page.evaluate(()=>beginnerMode.runDTAAnalysis({name:'Invalid',studies:[{study:'A',TP:-1,FP:2,FN:3,TN:4},{study:'B',TP:1,FP:2,FN:3,TN:4}]}));await expect(page.locator('#hta-dta-route')).toHaveCount(0);await expect(page.locator('#hta-synthesis-error')).toContainText('nonnegative integer');
 });
});
