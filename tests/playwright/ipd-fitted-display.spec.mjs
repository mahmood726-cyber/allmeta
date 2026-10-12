import { test, expect } from '@playwright/test';

const APP = '/IPD-Meta-Pro/ipd-meta-pro.html';
// Deliberately synthetic study effects. No patient information or real trial claims.
async function fitFixture(page, options) {
  return page.evaluate(o => {
    Object.assign(APP.config, {outcomeType: 'continuous', effectMeasure: 'MD', reMethod: 'DL', confLevel: .9, useHKSJ: true}, o);
    APP.analysisSettings = {...APP.config};
    const y = [-.8, -.12, .4, .18, -.35, .9], v = [.025, .05, .035, .065, .10, .08];
    let pooled = APP.config.reMethod === 'FE' ? MetaAnalysis.fixedEffect(y, v) : MetaAnalysis.randomEffectsDL(y, v);
    if (APP.config.useHKSJ) pooled = MetaAnalysis.applyHKSJ(pooled, y, v);
    const total = pooled.weights.reduce((a,b) => a+b, 0);
    const studies = y.map((effect,i) => {
      const ci = MetaAnalysis.confidenceInterval(effect, Math.sqrt(v[i]), APP.config.confLevel);
      return {study:'Synthetic '+(i+1), effect, variance:v[i], se:Math.sqrt(v[i]), ...ci, n:100+i, events:0, p:.2, weight:pooled.weights[i]/total};
    });
    APP.results = normalizeResultsSchema({studies, pooled, pi:MetaAnalysis.predictionInterval(pooled, APP.config.confLevel)});
    APP.data=[];
    window.__forestDraws=[];
    if (!window.__originalForestDraw) {
      window.__originalForestDraw=Plots.drawForest;
      Plots.drawForest=function(c,s,p,...rest){__forestDraws.push({id:c.id,pooled:structuredClone(p)});return __originalForestDraw.call(this,c,s,p,...rest);};
    }
    updateResults();
    const ratio=APP.config.outcomeType==='survival'||(APP.config.outcomeType==='binary'&&APP.config.effectMeasure!=='RD');
    const transform=x=>ratio?Math.exp(x):x;
    return { pooled: {effect:transform(pooled.pooled),lower:transform(pooled.lower),upper:transform(pooled.upper)},
      result: JSON.parse(JSON.stringify(APP.results)), saved:{...APP.analysisSettings} };
  },options);
}
async function assertPlotAndText(page, expected) {
  await page.locator('.nav-tab[data-panel="results"]').click();
  await expect.poll(() => page.evaluate(() => __forestDraws.filter(x=>x.id==='forestPlot').at(-1)?.pooled)).toEqual(expected.pooled);
  await expect(page.locator('#forestPlot')).toBeVisible();
  await expect(page.locator('#pooledCI')).toHaveText(`${expected.pooled.lower.toFixed(2)}-${expected.pooled.upper.toFixed(2)}`);
  await expect(page.locator('#analysisSummaryCard')).toContainText(`${Math.round(expected.saved.confLevel*100)}% CI: ${expected.pooled.lower.toFixed(2)} to ${expected.pooled.upper.toFixed(2)}`);
  const pct=Math.round(expected.saved.confLevel*100);
  await expect(page.locator('#pooledCI').locator('..')).toContainText(`${pct}% CI`);
  expect(await page.evaluate(() => JSON.parse(JSON.stringify(APP.results)))).toEqual(expected.result);
}

test.describe.configure({mode:'parallel'});
for (const width of [1280,390]) {
 test.describe(`IPD fitted display ${width}px`, () => {
  test.use({viewport:{width,height:900}});
  test.beforeEach(async ({page}) => {
    await page.goto(APP,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => typeof window.updateResults==='function' && typeof APP !== 'undefined');
  });
  test('saved HKSJ bounds drive forest, headline and unchanged replays',async({page})=>{
    const expected=await fitFixture(page,{});
    await assertPlotAndText(page,expected);
    await page.locator('.nav-tab[data-panel="heterogeneity"]').click();
    await expect(page.locator('#ipdHetInterpretation')).toContainText(`I² = ${expected.result.pooled.I2.toFixed(1)}%`);
    await expect(page.locator('#ipdTauSummary')).toContainText(Math.sqrt(expected.result.pooled.tau2).toFixed(4));
    await expect(page.locator('#ipdPredictionInterval')).toContainText(`90% PI (MD): ${expected.result.pi.lower.toFixed(3)} to ${expected.result.pi.upper.toFixed(3)}`);
    await page.locator('.nav-tab[data-panel="pubbias"]').click();
    for(const id of ['eggerP','beggP'])await expect(page.locator('#ipdBiasInterpretation')).toContainText(await page.locator('#'+id).innerText());
    // Editing controls after fitting must not silently reinterpret saved results.
    await page.evaluate(()=>{Object.assign(APP.config,{outcomeType:'binary',effectMeasure:'OR',reMethod:'FE',confLevel:.99,useHKSJ:false});updateResults();});
    await page.setViewportSize({width:width+40,height:920});
    await assertPlotAndText(page,expected);
    expect(await page.evaluate(()=>APP.config.confLevel)).toBe(.99);
    expect(await page.evaluate(()=>APP.analysisSettings)).toEqual(expected.saved);
  });
  test('ratio-scale non-HKSJ intervals and prediction labels come from the saved fit',async({page})=>{
    const expected=await fitFixture(page,{outcomeType:'binary',effectMeasure:'OR',confLevel:.99,useHKSJ:false});
    await assertPlotAndText(page,expected);
    await expect(page.locator('#pooledEffect').locator('..')).toContainText('Pooled OR');
    await page.locator('.nav-tab[data-panel="heterogeneity"]').click();
    await expect(page.locator('#ipdPredictionInterval')).toContainText(`99% PI (OR): ${Math.exp(expected.result.pi.lower).toFixed(3)} to ${Math.exp(expected.result.pi.upper).toFixed(3)}`);
    expect(await page.evaluate(()=>JSON.parse(JSON.stringify(APP.results)))).toEqual(expected.result);
  });
  test('fixed-effect display never invents a heterogeneity SD or prediction interval',async({page})=>{
    const expected=await fitFixture(page,{reMethod:'FE',confLevel:.95,useHKSJ:true});
    await assertPlotAndText(page,expected);
    await page.locator('.nav-tab[data-panel="heterogeneity"]').click();
    await expect(page.locator('#ipdPredictionInterval')).toContainText('Not estimated for the fixed-effect model');
    await expect(page.locator('#ipdTauSummary')).toContainText('between-study SD is not estimated');
    await expect(page.locator('#panel-heterogeneity')).not.toContainText('0.08-0.31');
    expect(await page.evaluate(()=>JSON.parse(JSON.stringify(APP.results)))).toEqual(expected.result);
  });
  test('empty and nonfinite saved limits have prerequisites rather than stale demo charts',async({page})=>{
    await expect(page.locator('#hetI2')).toHaveText('—');
    await expect(page.locator('#eggerP')).toHaveText('—');
    await expect(page.locator('#ipdHetInterpretation')).toContainText('Run an analysis');
    const expected=await fitFixture(page,{});await assertPlotAndText(page,expected);
    await page.evaluate(()=>{Object.assign(APP.results.pooled,{lower:null,upper:null,lowerHKSJ:null,upperHKSJ:null});updateResults();});
    await expect(page.locator('#forestPlot')).toBeHidden();
    await expect(page.locator('#ipdForestStatus')).toContainText('Saved confidence limits are unavailable');
    await expect(page.locator('#pooledCI')).toHaveText('Saved CI unavailable');
    expect(await page.evaluate(()=>getIPDFittedDisplay(APP.results).ci)).toBeNull();
  });
 });
}
