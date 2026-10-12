import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'parallel' });
const APP_URL = '/IPD-Meta-Pro/ipd-meta-pro.html';
async function ink(page, id) {
  const canvas = page.locator('#' + id);
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(c => {
    if (!c.width || !c.height) return 0;
    const a = c.getContext('2d').getImageData(0,0,c.width,c.height).data, values = new Set();
    const step = Math.max(4, Math.floor(a.length / 8000 / 4) * 4);
    for(let i=0;i<a.length;i+=step) values.add(a.slice(i,i+4).join(','));
    return values.size;
  })).toBeGreaterThan(5);
}
async function open(page) {
  page.on('dialog',d=>d.dismiss());
  await page.goto(APP_URL,{waitUntil:'load'});
}
async function network(page) {
  await page.evaluate(() => loadExampleData('network_antidepressants'));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const study = document.getElementById('varStudy').value;
    const treatment = document.getElementById('varTreatment').value;
    const outcome = document.getElementById('varEvent').value;
    document.getElementById('outcomeType').value = 'continuous';
    APP.config.outcomeType = 'continuous';
    APP.data = [];
    const pairs = [['A','B',.4],['A','C',.8],['A','D',1.2],['B','C',.3],['B','D',.9],['C','D',.4]];
    for(let j=0;j<pairs.length;j++) for(let repeat=0;repeat<2;repeat++) for(let arm=0;arm<2;arm++) for(let i=0;i<20;i++) {
      const trt=pairs[j][arm];
      APP.data.push({[study]:'Synthetic_'+j+'_'+repeat,[treatment]:trt,treatment_name:trt,
        [outcome]:(arm ? pairs[j][2] : 0)+repeat*.1+(i-9.5)*.5});
    }
    window.__rankingCalls=0;
    const fn=BeyondR40.rankProbabilityData;
    BeyondR40.rankProbabilityData=function(...args) {
      window.__rankingCalls++;
      const result=fn.apply(this,args);
      window.__computedRanks=JSON.parse(JSON.stringify(result));
      return result;
    };
    window.__networkFit=runNetworkMetaAnalysis();
  });
  await page.locator('.nav-tab[data-panel="ranking"]').click();
}
for(const width of [1280,390]) {
  test.describe(`Secondary plot fidelity at ${width}px`,()=>{
    test.use({viewport:{width,height:900}});
    test('IPD ranking table and both plots use computed probabilities, not a SUCRA-shaped illustration',async({page},info)=>{
      test.setTimeout(65000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await open(page);await network(page);
      const computed=await page.evaluate(()=>__computedRanks);
      const rows=await page.locator('#rankingTableBody tr').allTextContents();
      // This assertion fails on the old real UI, whose best/worst percentages
      // were invented from the treatment's position in the sorted list.
      for(const r of computed.rankings) {
        const row=rows.find(text=>text.trim().startsWith(r.treatment));
        expect(row).toContain((100*r.probBest).toFixed(1)+'%');
        expect(row).toContain((100*r.probWorst).toFixed(1)+'%');
      }
      await ink(page,'rankogramPlot');await ink(page,'cumulativeRankPlot');
      const drawn=await page.evaluate(()=>IPDSecondaryPlots.getRankingView());
      for(const row of drawn.rows) {
        const expected=computed.rankings.find(r=>r.treatment===row.treatment);
        expect(row.probabilities).toEqual(expected.rankProbabilities);
        let cumulative=0;
        row.probabilities.forEach((p,i)=>{cumulative+=p;expect(row.cumulative[i]).toBeCloseTo(cumulative,12);});
        expect(row.meanRank).toBeCloseTo(expected.meanRank,12);
        expect(row.sucra).toBeCloseTo(expected.sucra,12);
      }
      const before=await page.evaluate(()=>JSON.stringify({fit:__networkFit,computed:__computedRanks,data:APP.data,config:APP.config}));
      const count=await page.evaluate(()=>__rankingCalls);
      await page.locator('.nav-tab[data-panel="data"]').click();
      await page.locator('.nav-tab[data-panel="ranking"]').click();
      await page.setViewportSize({width:width+80,height:920});
      await page.waitForTimeout(250);
      await ink(page,'rankogramPlot');await ink(page,'cumulativeRankPlot');
      expect(await page.evaluate(()=>__rankingCalls)).toBe(count);
      expect(await page.evaluate(()=>JSON.stringify({fit:__networkFit,computed:__computedRanks,data:APP.data,config:APP.config}))).toBe(before);
      expect(errors).toEqual([]);
      await info.attach('computed-ranking',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    });
    test('IPD equal SUCRAs do not collapse distinct rank distributions into identical plots',async({page})=>{
      await open(page);
      await page.locator('.nav-tab[data-panel="ranking"]').click();
      const snapshots=await page.evaluate(()=>{
        const make=matrix=>({probabilityMatrix:{treatments:['A','B','C'],matrix},nSimulations:100});
        const one=make([[.5,0,.5],[0,1,0],[.5,0,.5]]);
        const two=make([[.25,.5,.25],[.5,0,.5],[.25,.5,.25]]);
        IPDSecondaryPlots.setRanking(one);IPDSecondaryPlots.renderRanking();
        const a={view:IPDSecondaryPlots.getRankingView(),plot:document.getElementById('rankogramPlot').toDataURL()};
        IPDSecondaryPlots.setRanking(two);IPDSecondaryPlots.renderRanking();
        return {a,b:{view:IPDSecondaryPlots.getRankingView(),plot:document.getElementById('rankogramPlot').toDataURL()}};
      });
      expect(snapshots.a.view.rows.map(r=>r.sucra)).toEqual(snapshots.b.view.rows.map(r=>r.sucra));
      expect(snapshots.a.plot).not.toBe(snapshots.b.plot);
      await ink(page,'cumulativeRankPlot');
    });
    test('IPD rank direction reverses actual distributions without refitting; invalid input cannot retain old curves',async({page})=>{
      await open(page);await network(page);
      const old=await page.evaluate(()=>IPDSecondaryPlots.getRankingView());
      const count=await page.evaluate(()=>__rankingCalls);
      await page.locator('#ipdRankDirection').selectOption('lower');
      const reversed=await page.evaluate(()=>IPDSecondaryPlots.getRankingView());
      for(const row of reversed.rows) {
        const original=old.rows.find(r=>r.treatment===row.treatment);
        expect(row.probabilities).toEqual(original.probabilities.slice().reverse());
        expect(row.sucra).toBeCloseTo(1-original.sucra,12);
      }
      expect(await page.evaluate(()=>__rankingCalls)).toBe(count);
      await page.evaluate(()=>IPDSecondaryPlots.setRanking({probabilityMatrix:{treatments:['A','B'],matrix:[[.9,.9],[.1,.1]]}}));
      await expect(page.locator('#rankogramPlot')).toBeHidden();
      await expect(page.locator('#cumulativeRankPlot')).toBeHidden();
      await expect(page.locator('#ipdRankingStatus')).toContainText('valid rank-probability matrix');
      await expect(page.locator('#rankingTableBody tr')).toHaveCount(0);
    });
    test('IPD survival zoom displays the same computed curves and exports a real PNG',async({page},info)=>{
      test.setTimeout(65000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await open(page);
      await page.evaluate(()=>{
        window.__survivalCalls=[];
        const draw=Plots.drawSurvival;
        Plots.drawSurvival=function(canvas,curves,options){
          window.__survivalCalls.push({id:canvas.id,curves:JSON.parse(JSON.stringify(curves))});
          return draw.call(this,canvas,curves,options);
        };
        loadExampleData('survival');
      });
      await page.waitForTimeout(300);await page.evaluate(()=>runAnalysis());
      await page.waitForFunction(()=>!!APP.results?.pooled);
      await page.locator('.nav-tab[data-panel="results"]').click();
      await ink(page,'survivalPlot');
      const before=await page.evaluate(()=>JSON.stringify({data:APP.data,results:APP.results,config:APP.config}));
      // Exercise the shipped zoom entry point as well as its automatic binding.
      await page.evaluate(()=>addSurvivalPlotInteractivity());
      await page.locator('#survivalPlot').click();
      await expect(page.locator('#survivalPlotLarge')).toHaveCount(1);
      await ink(page,'survivalPlotLarge');
      const calls=await page.evaluate(()=>__survivalCalls);
      expect(calls.filter(x=>x.id==='survivalPlotLarge').at(-1).curves).toEqual(calls.filter(x=>x.id==='survivalPlot').at(-1).curves);
      const download=page.waitForEvent('download');
      await page.locator('#ipdSurvivalZoom button').filter({hasText:'Download PNG'}).click();
      expect((await download).suggestedFilename()).toMatch(/survival.*\.png$/);
      await page.setViewportSize({width:width+60,height:960});await ink(page,'survivalPlotLarge');
      expect(await page.evaluate(()=>JSON.stringify({data:APP.data,results:APP.results,config:APP.config}))).toBe(before);
      expect(errors).toEqual([]);
      await info.attach('survival-zoom',{body:await page.screenshot(),contentType:'image/png'});
    });
    test('IPD Bayesian trace and density repaint from existing samples, without rerunning MCMC',async({page})=>{
      test.setTimeout(65000);
      await open(page);await page.evaluate(()=>loadExampleData('continuous'));
      await page.waitForTimeout(300);await page.evaluate(()=>runAnalysis());
      await page.waitForFunction(()=>!!APP.results?.pooled);
      await page.locator('.nav-tab[data-panel="bayesian"]').click();
      await page.locator('#mcmcIter').fill('500');await page.locator('#mcmcBurnin').fill('100');
      await page.locator('#mcmcChains').fill('2');
      await page.evaluate(()=>runBayesian());
      await page.waitForFunction(()=>!!APP.bayesianResults?.chains);
      await ink(page,'tracePlot');await ink(page,'posteriorPlot');
      const before=await page.evaluate(()=>JSON.stringify({results:APP.results,bayes:APP.bayesianResults,config:APP.config}));
      await page.evaluate(()=>{
        window.__mcmcRefits=0;
        const run=BayesianMCMC.runMCMC;
        BayesianMCMC.runMCMC=function(...args){window.__mcmcRefits++;return run.apply(this,args);};
        for(const id of ['tracePlot','posteriorPlot']) {
          const c=document.getElementById(id),ctx=c.getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);ctx.restore();
        }
      });
      await page.locator('.nav-tab[data-panel="data"]').click();await page.locator('.nav-tab[data-panel="bayesian"]').click();
      await page.setViewportSize({width:width+50,height:930});
      await ink(page,'tracePlot');await ink(page,'posteriorPlot');
      expect(await page.evaluate(()=>__mcmcRefits)).toBe(0);
      expect(await page.evaluate(()=>JSON.stringify({results:APP.results,bayes:APP.bayesianResults,config:APP.config}))).toBe(before);
    });
  });
}
