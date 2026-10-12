import { test, expect } from '@playwright/test';
test.describe.configure({mode:'parallel'});
async function shiny(page,path){
 await page.goto(path,{waitUntil:'domcontentloaded'});
 let frame;
 await expect.poll(async()=>{frame=page.frames().find(f=>f.url().includes('index.html?_shinylive-worker')||f.url().includes('websocket'));for(const f of page.frames()){if(await f.locator('.main-sidebar').count()){frame=f;return true;}}return false;},{timeout:100000}).toBe(true);
 await frame.waitForFunction(()=>!!window.Shiny?.shinyapp?.isConnected(),null,{timeout:60000});
 await page.waitForTimeout(700);
 return frame;
}
async function tab(page,frame,value){await frame.locator(`a[data-value="${value}"]`).first().evaluate(e=>e.click());await page.waitForTimeout(300);}
async function image(frame,id){
 const host=frame.locator('#'+id);await expect(host).toBeVisible();
 await expect.poll(()=>host.evaluate(e=>{const img=e.querySelector('img');return !!img&&img.complete&&img.naturalWidth>100&&img.naturalHeight>60;}),{timeout:40000}).toBe(true);
 await expect(host).not.toHaveClass(/shiny-output-error/);
}
for(const width of [1280,390])test.describe(`R and clustering ${width}px`,()=>{
 test.use({viewport:{width,height:950}});
 test('Mean-single-group: all nine plot panels render after R is connected',async({page},info)=>{
  test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const f=await shiny(page,'/r-shiny/mean-single-group/');
  // The preview is real reactive sample data, not an empty upload placeholder.
  await expect(f.locator('#data_table tbody tr')).toHaveCount(4,{timeout:40000});
  for(const [section,ids] of [['tab_forest',['forest_plot','funnel_plot']],['tab_diag',['baujat_plot']],['tab_extra',['cum_forest','fixed_effect_forest']],['tab_advanced',['effect_dist','forest_sorted','density_plot']],['tab_subgroup',['subgroup_forest']]]){
   await tab(page,f,section);for(const id of ids)await image(f,id);
  }
  await tab(page,f,'tab_forest');await image(f,'forest_plot');
  await page.setViewportSize({width:width+30,height:970});await image(f,'forest_plot');await image(f,'funnel_plot');
  expect(errors).toEqual([]);await info.attach('r-forest-funnel',{body:await page.screenshot(),contentType:'image/png'});
 });
 test('Annualised plots: all seven R graphic tabs render',async({page},info)=>{
  test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const f=await shiny(page,'/r-shiny/annualised-plot/');await tab(page,f,'plot');
  for(const [label,id] of [['Bar+Scatter','barScatterPlot'],['Boxplot+Scatter','boxScatterPlot'],['Violin+Scatter','violinScatterPlot'],['Scatter Only','scatterPlot'],['Histogram','histPlot'],['Density Plot','densityPlot'],['ECDF Plot','ecdfPlot']]){
   await f.getByText(label,{exact:true}).first().click();await image(f,id);
  }
  expect(errors).toEqual([]);await info.attach('r-annualised',{body:await page.screenshot(),contentType:'image/png'});
 });
 test('DTA R: six actual plots and four metric tables render without DataTables errors',async({page},info)=>{
  test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const f=await shiny(page,'/r-shiny/dta-diagnostic/');
  const csv='status,test_value\n'+Array.from({length:80},(_,i)=>`${i%2},${(i%2?0.4:0.1)+(i%17)/25}`).join('\n');
  await f.locator('#file_dta').setInputFiles({name:'synthetic-dta.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await expect(f.locator('#threshold')).toHaveClass(/shiny-bound-input/);
  await f.locator('#analyze_btn').click();
  for(const [section,ids,tables] of [['std_metrics',['roc_plot'],['summary_table','conf_matrix_table']],['adv_metrics',['pr_curve_plot'],['advanced_metrics_table','ci_table']],['plots',['boxplot_test','hist_test','density_plot','calibration_plot'],[]]]){
   await tab(page,f,section);for(const id of ids)await image(f,id);for(const id of tables)await expect.poll(()=>f.locator('#'+id+' table tbody tr').count()).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);await info.attach('r-dta-plots',{body:await page.screenshot(),contentType:'image/png'});
 });
 test('IPD clustering: known solution, deterministic restarts and invalid-input guards',async({page})=>{
  await page.goto('/IPD-Meta-Pro/ipd-meta-pro.html',{waitUntil:'load'});
  const results=await page.evaluate(()=>{
   const rows=[[0,0],[0,2],[10,10],[10,12],[20,0],[20,2]],before=JSON.stringify(rows);
   const a=IPDClustering.fit(rows,3,{restarts:10}),b=IPDClustering.fit(rows,3,{restarts:10}),single=IPDClustering.fit(rows,3,{restarts:1});
   let rejected=false;try{IPDClustering.fit([[0,0],[NaN,2],[1,1]],2);}catch{rejected=true;}
   return {a,b,single,rejected,unchanged:JSON.stringify(rows)===before,legacyActive:typeof window.addExceedRButtons!=='undefined',publicWrapper:kMeans.toString().length};
  });
  expect(results.a).toEqual(results.b);expect(results.a.inertia).toBeCloseTo(6,10);expect(results.a.restartsCompleted).toBe(10);
  for(const [i,j] of [[0,1],[2,3],[4,5]])expect(results.a.labels[i]).toBe(results.a.labels[j]);
  expect(new Set(results.a.labels).size).toBe(3);expect(results.a.inertia).toBeLessThanOrEqual(results.single.inertia);
  expect(results.rejected).toBe(true);expect(results.unchanged).toBe(true);expect(results.legacyActive).toBe(false);expect(results.publicWrapper).toBeLessThan(500);
 });
 test('IPD clustering: actual covariate plot survives resize without mutating data or fitted results',async({page},info)=>{
  await page.goto('/IPD-Meta-Pro/ipd-meta-pro.html',{waitUntil:'load'});
  await page.evaluate(()=>loadExampleData('survival'));await page.waitForTimeout(400);
  const before=await page.evaluate(()=>JSON.stringify({data:APP.data,results:APP.results}));
  await page.evaluate(()=>runPatientClustering());
  const plot=page.locator('#clusterPlot');await expect(plot).toHaveAttribute('data-plot-state','ready');
  await expect(page.locator('#ipdClusterRows tr')).toHaveCount(3);await expect(page.locator('#ipdClusterStatus')).toContainText('Descriptive groups only');
  const count=await page.evaluate(()=>APP.data.length);await expect(plot).toHaveAttribute('data-rows',String(count));
  await page.setViewportSize({width:width+30,height:970});await expect(plot).toBeVisible();
  expect(await plot.evaluate(c=>c.width>0&&c.height>0&&c.clientWidth>0)).toBe(true);
  expect(await page.evaluate(()=>JSON.stringify({data:APP.data,results:APP.results}))).toBe(before);
  await info.attach('ipd-clustering',{body:await page.screenshot(),contentType:'image/png'});
 });
});
