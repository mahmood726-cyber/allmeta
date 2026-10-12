import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.describe.configure({mode:'parallel'});
const studies=[
  {study:'Synthetic1',effect:.2,se:.1,year:2020},
  {study:'Synthetic2',effect:.5,se:.2,year:2021},
  {study:'Synthetic3',effect:-.1,se:.15,year:2022},
  {study:'Synthetic4',effect:.4,se:.12,year:2023}
];
async function open(page) {
  await page.addInitScript(()=>localStorage.setItem('hta_tutorial_seen','true'));
  await page.goto('/HTA/index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.beginnerMode);
}
async function populated(page,id) {
  const svg=page.locator('#'+id);
  await expect(svg).toBeVisible();
  expect(await svg.locator('line,path,circle,polygon,rect[data-pscore]').count()).toBeGreaterThan(0);
  expect(await svg.evaluate(s=>[...s.querySelectorAll('*')].flatMap(el=>[...el.attributes]).filter(a=>/^(d|points|x|y|x1|x2|y1|y2|cx|cy|width|height)$/.test(a.name) && /NaN|Infinity/.test(a.value)).map(a=>a.value))).toEqual([]);
  return svg;
}
for(const width of [1280,390]) {
  test.describe(`HTA synthesis at ${width}px`,()=>{
    test.use({viewport:{width,height:900}});
    test('manual entry produces forest, cumulative and funnel plots from the saved fit',async({page},info)=>{
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await open(page);await page.locator('#btn-enter-data').click();
      for(let i=0;i<studies.length;i++) for(const key of ['study','effect','se','year'])
        await page.locator('#data-grid-body tr').nth(i).locator(`[data-col="${key}"]`).fill(String(studies[i][key]));
      await page.locator('#data-entry-panel button').filter({hasText:'Run Analysis'}).click();
      for(const id of ['hta-beginner-forest','hta-beginner-cumulative','hta-beginner-funnel']) await populated(page,id);
      const state=await page.evaluate(()=>({results:window.lastResults,dataset:window.currentDataset}));
      const rows=await page.locator('#hta-beginner-forest').evaluate(s=>s.__plotData);
      for(let i=0;i<studies.length;i++) {
        expect(rows[i].effect).toBe(studies[i].effect);
        expect(rows[i].weight).toBeCloseTo(state.results.weights.random[i],12);
      }
      expect(rows.at(-1).lo).toBe(state.results.random.ci_lower);
      expect(rows.at(-1).hi).toBe(state.results.random.ci_upper);
      const cumulative=await page.locator('#hta-beginner-cumulative').evaluate(s=>s.__plotData);
      expect(cumulative.at(-1).effect).toBeCloseTo(state.results.random.effect,12);
      const original=await page.locator('#hta-beginner-forest').evaluate(s=>new XMLSerializer().serializeToString(s));
      const dl=page.waitForEvent('download');
      await page.getByRole('button',{name:'Download Forest plot SVG',exact:true}).click();
      const downloaded=await dl;
      expect(downloaded.suggestedFilename()).toBe('hta-beginner-forest.svg');
      expect(await readFile(await downloaded.path(),'utf8')).toBe(original);
      const csvDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export results CSV',exact:true}).click();
      const csv=await readFile(await (await csvDownload).path(),'utf8');
      state.results.weights.random.forEach(w=>expect(csv).toContain(w.toFixed(2)+'%'));
      expect(csv).toContain(String(state.results.heterogeneity.tauSquared));
      await page.evaluate(()=>{window.__redrawFits=0;const f=MetaAnalysisMethods.prototype.calculatePooledEffect;MetaAnalysisMethods.prototype.calculatePooledEffect=function(...args){__redrawFits++;return f.apply(this,args);};});
      await page.setViewportSize({width:width+60,height:950});
      for(const id of ['hta-beginner-forest','hta-beginner-cumulative','hta-beginner-funnel']) await populated(page,id);
      expect(await page.evaluate(()=>__redrawFits)).toBe(0);
      expect(await page.evaluate(()=>({results:lastResults,dataset:currentDataset}))).toEqual(state);
      expect(errors).toEqual([]);
      await info.attach('forest-actual-input',{body:await page.locator('#hta-beginner-forest').screenshot(),contentType:'image/png'});
    });
    test('reanalysis replaces old labels and invalid data never retain a prior plot',async({page})=>{
      await open(page);
      await page.evaluate(studies=>beginnerMode.runPairwiseAnalysis({name:'First',studies}),studies);
      await populated(page,'hta-beginner-forest');
      await page.evaluate(studies=>beginnerMode.runPairwiseAnalysis({name:'Second',studies:studies.map((s,i)=>({...s,study:'Replacement'+i,effect:s.effect+.3}))}),studies);
      await expect(page.locator('#results-modal')).toHaveCount(1);
      await expect(page.locator('#hta-beginner-forest')).toContainText('Replacement0');
      await expect(page.locator('#hta-beginner-forest')).not.toContainText('Synthetic1');
      await page.evaluate(()=>beginnerMode.runPairwiseAnalysis({name:'Invalid',studies:[{effect:Infinity,se:.1},{effect:.2,se:.1}]}));
      await expect(page.locator('#hta-beginner-forest')).toHaveCount(0);
      await expect(page.locator('#hta-synthesis-error')).toBeVisible();
      expect(await page.evaluate(()=>lastResults)).toBeNull();
    });
    test('publication-bias plots use actual observed/imputed points and explain insufficient data',async({page})=>{
      await open(page);await page.evaluate(studies=>beginnerMode.runPairwiseAnalysis({name:'Synthetic',studies}),studies);
      const reference=await page.evaluate(studies=>new MetaAnalysisMethods().trimAndFill(studies),studies);
      await page.getByRole('button',{name:'Check publication bias',exact:true}).click();
      await populated(page,'hta-bias-observed');await populated(page,'hta-bias-trimfill');
      const plotted=await page.locator('#hta-bias-trimfill').evaluate(s=>s.__plotData);
      expect(plotted.center).toBe(reference.adjusted.effect);
      expect(plotted.rows.filter(r=>r.imputed).map(r=>({effect:r.effect,se:r.se}))).toEqual(reference.imputedStudies.map(r=>({effect:r.effect,se:r.se})));
      expect(plotted.rows.filter(r=>!r.imputed).map(r=>r.effect)).toEqual(studies.map(r=>r.effect));
      await page.evaluate(studies=>beginnerMode.runPairwiseAnalysis({name:'Too few',studies:studies.slice(0,2)}),studies);
      await page.getByRole('button',{name:'Check publication bias',exact:true}).click();
      await expect(page.locator('#bias-modal')).toContainText('At least three studies');
      await expect(page.locator('#hta-bias-trimfill')).toHaveCount(0);
    });
    test('network example opens actual network, fitted contrasts, P-score and adjusted funnel plots',async({page},info)=>{
      test.setTimeout(65000);
      await open(page);
      await page.evaluate(async()=>{const dataset=beginnerMode.getSampleDatasets().smoking;await beginnerMode.runNMAAnalysis(dataset);});
      for(const id of ['hta-beginner-network','hta-beginner-nma-forest','hta-beginner-pscore','hta-beginner-nma-funnel']) await populated(page,id);
      const model=await page.evaluate(()=>({results:lastNMAEngine.results,network:lastNMAEngine.network,scores:lastNMAEngine.calculatePScores(),funnel:lastNMAEngine.generateFunnelPlot()}));
      const trts=await page.locator('#hta-beginner-network circle[data-treatment]').evaluateAll(cs=>cs.map(c=>c.dataset.treatment).sort());
      expect(trts).toEqual(model.network.nodes.map(n=>n.id).sort());
      const rows=await page.locator('#hta-beginner-nma-forest').evaluate(s=>s.__plotData);
      expect(rows.map(r=>r.effect)).toEqual(model.results.effects.map(r=>r.mean));
      const scores=await page.locator('#hta-beginner-pscore rect[data-pscore]').evaluateAll(xs=>xs.map(x=>({treatment:x.dataset.treatment,value:Number(x.dataset.pscore)})));
      expect(scores).toEqual(model.scores.map(r=>({treatment:r.treatment,value:r.pScore})));
      const funnel=await page.locator('#hta-beginner-nma-funnel').evaluate(s=>s.__plotData);
      expect(funnel.rows.map(r=>r.effect)).toEqual(model.funnel.data.map(r=>r.adjustedEffect));
      await info.attach('network-from-example',{body:await page.locator('#hta-beginner-network').screenshot(),contentType:'image/png'});
      await page.evaluate(async()=>beginnerMode.runNMAAnalysis({name:'Disconnected',studies:[{study:'S1',treatment:'A',n:20,events:4},{study:'S1',treatment:'B',n:20,events:8},{study:'S2',treatment:'C',n:20,events:5},{study:'S2',treatment:'D',n:20,events:9}]}));
      await expect(page.locator('#hta-beginner-network')).toHaveCount(0);
      await expect(page.locator('#hta-synthesis-error')).toBeVisible();
    });
    test('REML matches independent profile-likelihood fixtures rather than a spurious zero boundary',async({page})=>{
      await open(page);
      // Expected values from independent SciPy bounded profile-likelihood
      // minimisation with a 1000-point logarithmic grid and boundary comparison.
      const cases=[
        {y:[.2,.5,-.1,.4],se:[.1,.2,.15,.12],tau:.03965219268515327,mu:.23923083499133024},
        {y:[.2,.2,.2],se:[.1,.2,.3],tau:0,mu:.2},
        {y:[-.6,.1,.4,.8],se:[.2,.2,.2,.2],tau:.3091666667535109,mu:.175},
        {y:[-.3,.15,1.2,.8,-.1],se:[.01,.08,.25,.7,.04],tau:.3404324954851366,mu:.2575051067174364}
      ];
      const results=await page.evaluate(cases=>cases.map(c=>new MetaAnalysisMethods({method:'REML',autoHKSJ:false}).calculatePooledEffect(c.y.map((effect,i)=>({effect,se:c.se[i]})))),cases);
      results.forEach((r,i)=>{expect(r.heterogeneity.tauSquared).toBeCloseTo(cases[i].tau,7);expect(r.random.effect).toBeCloseTo(cases[i].mu,7);});
    });
  });
}
