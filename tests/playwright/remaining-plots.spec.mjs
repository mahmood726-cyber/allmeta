import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'parallel' });
const IPD = '/IPD-Meta-Pro/ipd-meta-pro.html';
async function ink(page, id) {
  const c = page.locator('#' + id);
  await expect(c).toBeVisible();
  await expect.poll(() => c.evaluate(e => {
    if (!e.width || !e.height || !e.clientWidth || !e.clientHeight) return 0;
    const a = e.getContext('2d').getImageData(0, 0, e.width, e.height).data;
    const values = new Set();
    const step = Math.max(4, Math.floor(a.length / 8000 / 4) * 4);
    for (let i = 0; i < a.length; i += step) values.add(a[i] + ',' + a[i+1] + ',' + a[i+2] + ',' + a[i+3]);
    return values.size;
  })).toBeGreaterThan(5);
}
async function ipd(page) {
  page.on('dialog', d => d.dismiss());
  await page.goto(IPD, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.IPDPlotCompletion);
}
for (const width of [1280, 390]) {
  test.describe(`Remaining plots at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('IPD Baujat and LOO render actual results, retain settings and repaint without refitting', async ({ page }, info) => {
      test.setTimeout(65000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await ipd(page);
      await page.evaluate(() => loadExampleData('survival'));
      await page.waitForTimeout(400);
      await page.evaluate(() => runAnalysis());
      await page.waitForFunction(() => !!APP.results?.pooled);
      const before = await page.evaluate(() => JSON.stringify({ results: APP.results, config: APP.config, settings: APP.analysisSettings }));
      await page.locator('.nav-tab[data-panel="heterogeneity"]').click();
      await ink(page, 'baujatPlot'); await ink(page, 'looPlot');
      const d = await page.evaluate(() => IPDPlotCompletion.getDiagnostics());
      expect(d.rows.length).toBeGreaterThan(2);
      expect(d.method).toBe(await page.evaluate(() => APP.analysisSettings.reMethod));
      for (const row of d.rows) {
        expect(row.influence).toBeCloseTo(row.change ** 2 / row.omitted.variance, 10);
        expect(Number.isFinite(row.pearsonSquared)).toBe(true);
        expect(row.omitted.lower).toBeLessThan(row.omitted.upper);
      }
      await expect(page.locator('#influenceTableBody tr')).toHaveCount(d.rows.length);
      await page.evaluate(() => {
        window.__diagnosticRefits = 0;
        for (const key of ['fixedEffect', 'randomEffectsDL', 'randomEffectsREML', 'randomEffectsPM', 'randomEffectsSJ', 'randomEffectsHE', 'randomEffectsML']) {
          const original = MetaAnalysis[key];
          MetaAnalysis[key] = (...args) => { window.__diagnosticRefits++; return original(...args); };
        }
      });
      await page.locator('.nav-tab[data-panel="data"]').click();
      await page.locator('.nav-tab[data-panel="heterogeneity"]').click();
      await page.setViewportSize({ width: width + 30, height: 920 });
      await ink(page, 'baujatPlot'); await ink(page, 'looPlot');
      expect(await page.evaluate(() => window.__diagnosticRefits)).toBe(0);
      expect(await page.evaluate(() => JSON.stringify({ results: APP.results, config: APP.config, settings: APP.analysisSettings }))).toBe(before);
      expect(errors).toEqual([]);
      await info.attach('ipd-secondary-plots', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
    test('IPD fixed-effect Baujat coordinates and omission intervals match independent arithmetic', async ({ page }) => {
      await ipd(page);
      const result = await page.evaluate(() => {
        const studies = [0.2,0.7,-0.1,0.4].map((effect,i) => ({study:'S'+(i+1),effect,variance:[.04,.01,.09,.03][i]}));
        const pooled = MetaAnalysis.fixedEffect(studies.map(s=>s.effect),studies.map(s=>s.variance));
        return IPDPlotCompletion.computeDiagnostics({studies,pooled},{reMethod:'FE',useHKSJ:false,confLevel:.95,outcomeType:'continuous',effectMeasure:'MD'});
      });
      const expected = [
        [0.5692307692307692,0.4061519082079567,0.7323096302535816,2.4767535608707343,0.42866888553531834],
        [0.248,0.012804321855193534,0.48319567814480646,3.431604407417358,4.941510346681002],
        [0.5578947368421053,0.4021325938697794,0.7136568798144313,4.199140016124698,0.29467649235962834],
        [0.5428571428571428,0.37486022989656675,0.7108540558177189,0.43895010301890186,0.10749798441279165]
      ];
      result.rows.forEach((r,i) => [r.omitted.estimate,r.omitted.lower,r.omitted.upper,r.pearsonSquared,r.influence].forEach((v,j) => expect(v).toBeCloseTo(expected[i][j],6)));
      expect(result.full.estimate).toBeCloseTo(0.5147540983606558,10);
    });
    test('IPD all seven estimators and HKSJ use the selected method in every omitted fit', async ({ page }) => {
      await ipd(page);
      const checks = await page.evaluate(() => {
        const methods = {FE:'fixedEffect',DL:'randomEffectsDL',REML:'randomEffectsREML',PM:'randomEffectsPM',SJ:'randomEffectsSJ',HE:'randomEffectsHE',ML:'randomEffectsML'};
        const studies = [.2,.7,-.1,.4,.6].map((effect,i) => ({study:'S'+i,effect,variance:[.04,.01,.09,.03,.07][i]}));
        const before=JSON.stringify(APP.config),checks=[];
        for(const [method,fn] of Object.entries(methods)) for(const hk of [false,true]) {
          const y=studies.map(s=>s.effect),v=studies.map(s=>s.variance);
          let pooled=MetaAnalysis[fn](y,v); if(hk)pooled=MetaAnalysis.applyHKSJ(pooled,y,v);
          const d=IPDPlotCompletion.computeDiagnostics({studies,pooled},{...APP.config,reMethod:method,useHKSJ:hk,confLevel:.90});
          for(let i=0;i<studies.length;i++) {
            const yy=y.filter((_,j)=>j!==i),vv=v.filter((_,j)=>j!==i);
            let expected=MetaAnalysis[fn](yy,vv); if(hk)expected=MetaAnalysis.applyHKSJ(expected,yy,vv);
            const se=hk?expected.seHKSJ:expected.se;
            const crit=hk?Stats.tQuantile(.95,yy.length-1):Stats.normalQuantile(.95);
            checks.push({method,hk,delta:d.rows[i].omitted.estimate-expected.pooled,seDelta:d.rows[i].omitted.se-se,lowerDelta:d.rows[i].omitted.lower-(expected.pooled-crit*se)});
          }
        }
        return {checks,unchanged:JSON.stringify(APP.config)===before};
      });
      expect(checks.unchanged).toBe(true);
      expect(checks.checks).toHaveLength(70);
      for(const x of checks.checks)for(const key of ['delta','seDelta','lowerDelta'])expect(Math.abs(x[key])).toBeLessThan(1e-10);
    });
    test('IPD missing data gives an actionable prerequisite instead of a blank chart', async ({ page }) => {
      await ipd(page);
      await page.locator('.nav-tab[data-panel="heterogeneity"]').click();
      await expect(page.locator('#baujatPlotStatus')).toContainText('Run a two-stage analysis');
      await expect(page.locator('#baujatPlot')).toBeHidden();
      await page.locator('.nav-tab[data-panel="consistency"]').click();
      await expect(page.locator('#netHeatPlotStatus')).toContainText('Load network data');
      await expect(page.locator('#netHeatPlot')).toBeHidden();
    });
    test('IPD Net Heat uses actual netmeta output and keeps fitted data unchanged', async ({ page }, info) => {
      test.setTimeout(240000);
      await ipd(page);
      await page.evaluate(() => loadExampleData('network_antidepressants'));
      await page.waitForTimeout(400);
      await page.locator('.nav-tab[data-panel="consistency"]').click();
      await expect(page.locator('#netHeatPlotStatus')).toContainText('disconnected components');
      const component=await page.locator('#ipdNetHeatComponent').evaluate(el=>[...el.options].find(o=>o.text.includes('Placebo')).value);
      await page.locator('#ipdNetHeatComponent').selectOption(component);
      const input = await page.evaluate(() => IPDPlotCompletion.networkInput());
      expect(input.componentNote).toContain('excluded by your selection');
      expect(input.rows.length).toBeGreaterThan(2);
      // The built-in example does not supply enough informative designs.
      await page.locator('#ipdNetHeatRun').click();
      await expect(page.locator('#ipdNetHeatRun')).toBeEnabled({timeout:200000});
      await expect(page.locator('#netHeatPlotStatus')).toContainText('Insufficient number of designs');
      await expect(page.locator('#netHeatPlot')).toBeHidden();
      // Separate synthetic continuous-outcome fixture: six two-arm designs,
      // each replicated. No published/example trial is altered or relabelled.
      await page.evaluate(() => {
        const studyKey=document.getElementById('varStudy').value;
        const treatmentKey=document.getElementById('varTreatment').value;
        const outcomeKey=document.getElementById('varEvent').value;
        document.getElementById('outcomeType').value='continuous';
        const pairs=[['A','B',1],['A','C',2],['A','D',3],['B','C',-1],['B','D',4],['C','D',.5]];
        APP.data=[];
        for(let j=0;j<pairs.length;j++)for(let repeat=0;repeat<2;repeat++)for(let arm=0;arm<2;arm++)for(let i=0;i<20;i++){
          const treatment=pairs[j][arm];
          const row={[studyKey]:'Synthetic_'+j+'_'+repeat,[treatmentKey]:treatment,treatment_name:treatment,
            [outcomeKey]:(arm?pairs[j][2]:0)+repeat*.1+(i-9.5)*.2};
          APP.data.push(row);
        }
        IPDPlotCompletion.schedule();
      });
      await expect(page.locator('#netHeatPlotStatus')).toContainText('Complete connected network');
      const before = await page.evaluate(() => JSON.stringify({data:APP.data,results:APP.results,config:APP.config}));
      await page.locator('#ipdNetHeatRun').click();
      await expect(page.locator('#ipdNetHeatRun')).toBeEnabled({timeout:200000});
      expect(await page.locator('#netHeatPlot').getAttribute('data-plot-state'), await page.locator('#netHeatPlotStatus').innerText()).toBe('ready');
      await ink(page,'netHeatPlot');
      expect(await page.locator('#netHeatPlot').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,1,1).data))).toEqual([255,255,255,255]);
      await expect(page.locator('#netHeatPlotStatus')).toContainText('netmeta');
      await expect(page.locator('#netHeatPlotStatus')).toContainText('common-effect Net Heat');
      await page.setViewportSize({width:width+30,height:920});
      await ink(page,'netHeatPlot');
      expect(await page.evaluate(() => JSON.stringify({data:APP.data,results:APP.results,config:APP.config}))).toBe(before);
      await info.attach('real-netheat', {body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    });
    test('WebR Studio captures every plot page, including commands outside the old regexp', async ({ page }, info) => {
      test.setTimeout(240000);
      await page.goto('/webr-studio/index.html',{waitUntil:'load'});
      await expect(page.locator('#btn-run')).toBeEnabled({timeout:100000});
      await page.locator('#r-code').fill('boxplot(1:10, main="Actual boxplot"); barplot(c(2,5,3), main="Actual barplot")');
      await page.locator('#btn-run').click();
      await expect(page.locator('#plot-host')).toHaveAttribute('data-plot-count','2',{timeout:150000});
      await expect(page.locator('#plot-host canvas')).toHaveCount(2);
      for(const c of await page.locator('#plot-host canvas').all())await expect(c).toBeVisible();
      await page.locator('#r-code').fill('plot(1:4, main="Replacement plot")');
      await page.locator('#btn-run').click();
      await expect(page.locator('#plot-host')).toHaveAttribute('data-plot-count','1',{timeout:60000});
      await expect(page.locator('#plot-host canvas')).toHaveCount(1);
      await info.attach('webr-captured-plot',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
      await page.locator('#r-code').fill('stop("deliberate-error-check")');
      await page.locator('#btn-run').click();
      await expect(page.locator('#r-output')).toContainText('deliberate-error-check',{timeout:60000});
      await expect(page.locator('#plot-host canvas')).toHaveCount(0);
      await expect(page.locator('#btn-run')).toBeEnabled();
    });
  });
}
