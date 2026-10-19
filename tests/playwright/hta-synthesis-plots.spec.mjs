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
  // The app has two independent onboarding layers. Test returning-user plots.
  await page.addInitScript(()=>{localStorage.setItem('hta_tutorial_seen','true');localStorage.setItem('hta-tutorial-completed','true');});
  await page.goto('/HTA/index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.beginnerMode);
}
async function populated(page,id) {
  const svg=page.locator('#'+id);
  await expect(svg).toBeVisible();
  expect(await svg.evaluate(s=>{
    const a=s.getBoundingClientRect(),b=s.parentElement.getBoundingClientRect();
    return a.width>100 && a.left>=b.left-1 && a.right<=b.right+1;
  })).toBe(true); // A partially off-screen SVG is not a successful mobile plot.
  expect(await svg.evaluate(s=>{
    const xml=new XMLSerializer().serializeToString(s);
    return !new DOMParser().parseFromString(xml,'image/svg+xml').querySelector('parsererror');
  })).toBe(true);
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
    test('results modal keeps Copy Results and Generate Report wired to the fitted results',async({page})=>{
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await open(page);
      await page.evaluate(studies=>beginnerMode.runPairwiseAnalysis({name:'Export preservation',studies}),studies);
      await populated(page,'hta-beginner-forest');
      const result=await page.evaluate(()=>JSON.parse(JSON.stringify(lastResults)));
      const footer=page.locator('#results-modal .welcome-footer');
      for(const name of ['Copy Results','Export results CSV','Generate Report','Check publication bias']) await expect(footer.getByRole('button',{name,exact:true})).toBeVisible();
      // Capture exactly what the app hands to the clipboard API.
      await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedResultText=text;}}}));
      await footer.getByRole('button',{name:'Copy Results',exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>window.__copiedResultText||'')).toContain('Pooled Effect: '+result.random.effect.toFixed(4));
      const copied=await page.evaluate(()=>window.__copiedResultText);
      expect(copied).toContain(`95% CI: [${result.random.ci_lower.toFixed(4)}, ${result.random.ci_upper.toFixed(4)}]`);
      expect(copied).toContain('τ²: '+result.heterogeneity.tauSquared.toFixed(4));
      expect(copied).toContain('Dataset: Export preservation');
      // generateReport() writes a printable HTML report into a new window
      // (window.open + document.write); it does not trigger a download.
      const popupPromise=page.waitForEvent('popup');
      await footer.getByRole('button',{name:'Generate Report',exact:true}).click();
      const popup=await popupPromise;
      await expect(popup.locator('h1')).toHaveText('Meta-Analysis Report');
      const report=await popup.content();
      expect(report).toContain('Export preservation');
      expect(report).toContain(result.random.effect.toFixed(4));
      expect(report).toContain(`[${result.random.ci_lower.toFixed(4)}, ${result.random.ci_upper.toFixed(4)}]`);
      expect(report).toContain(result.heterogeneity.tauSquared.toFixed(4));
      // Report study weights are the same random-effects weights the plot uses.
      result.weights.random.forEach(w=>expect(report).toContain(w.toFixed(1)+'%'));
      for(const s of studies) expect(report).toContain(s.study);
      await popup.close();
      // Neither action refits or mutates the stored results.
      expect(await page.evaluate(()=>JSON.parse(JSON.stringify(lastResults)))).toEqual(result);
      const inside=await footer.evaluate(el=>{
        const r=el.getBoundingClientRect();
        return [...el.querySelectorAll('button')].every(b=>{const x=b.getBoundingClientRect();return x.width>0 && x.left>=r.left-1 && x.right<=r.right+1;});
      });
      expect(inside).toBe(true); // No footer action is pushed off-screen at phone width.
      expect(errors).toEqual([]);
    });
    test('prediction interval uses t(k-1) at every k, including k >= 10',async({page})=>{
      await open(page);
      // References: R 4.6.0 / metafor 5.0.1, rma(yi, sei, method="REML") then the
      // explicit Cochrane Handbook v6.5 formula mu +/- qt(.975, k-1) * sqrt(tau2 + se^2).
      // bcg13 = escalc("RR", data = dat.bcg) (Colditz 1994, 13 trials). The previous
      // z-based interval for bcg13 was [-1.8666922, 0.4376275].
      const bcgY=[-0.889311333920205,-1.585388657201431,-1.348073148299693,-1.441551190021305,-0.217547322211296,-0.786115585818864,-1.620898223598392,0.011952333523841,-0.469417648738149,-1.371344803472784,-0.339358828338391,0.445913400571379,-0.017313948216880];
      const bcgS=[0.570600354892951,0.441113501718258,0.644490469571091,0.141456819921302,0.226296646395016,0.083100050877895,0.472247019654243,0.062941077984236,0.237558856840255,0.270231000466321,0.111410116109623,0.729729981020482,0.267216503390016];
      const cases=[
        {y:[.2,.5,-.1,.4],se:[.1,.2,.15,.12],lo:-0.5038167313,hi:0.9822784012,df:3},
        {y:[.2,.2,.2],se:[.1,.2,.3],lo:-0.1687988054,hi:0.5687988054,df:2},
        {y:[-.6,.1,.4,.8],se:[.2,.2,.2,.2],lo:-1.8288253218,hi:2.1788253218,df:3},
        {y:[-.3,.15,1.2,.8,-.1],se:[.01,.08,.25,.7,.04],lo:-1.5437342646,hi:2.0587444780,df:4},
        {y:bcgY,se:bcgS,lo:-1.9953419585,hi:0.5662772742,df:12}
      ];
      const pis=await page.evaluate(cases=>cases.map(c=>new MetaAnalysisMethods({method:'REML',autoHKSJ:false,useHKSJ:false,predictionInterval:true}).calculatePooledEffect(c.y.map((effect,i)=>({effect,se:c.se[i]}))).heterogeneity.predictionInterval),cases);
      pis.forEach((pi,i)=>{
        expect(pi.lower).toBeCloseTo(cases[i].lo,7);
        expect(pi.upper).toBeCloseTo(cases[i].hi,7);
        expect(pi.method).toBe(`t-distribution (df=${cases[i].df})`);
      });
      // tau2 = 0: a prediction interval identical to the CI would be the z-based error.
      const homog=await page.evaluate(()=>new MetaAnalysisMethods({method:'REML',autoHKSJ:false,predictionInterval:true}).calculatePooledEffect([{effect:.2,se:.1},{effect:.2,se:.2},{effect:.2,se:.3}]));
      expect(homog.heterogeneity.predictionInterval.upper-homog.heterogeneity.predictionInterval.lower).toBeGreaterThan(homog.random.ci_upper-homog.random.ci_lower+0.1);
      expect(await page.evaluate(()=>new MetaAnalysisMethods({method:'REML',predictionInterval:true}).calculatePooledEffect([{effect:.3,se:.2},{effect:.7,se:.2}]).heterogeneity.predictionInterval)).toBeNull();
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
