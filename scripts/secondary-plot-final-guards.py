"""Temporary final adapter/test hardening; production estimators remain untouched."""
from pathlib import Path
import hashlib

def once(s,a,b):
    assert s.count(a)==1,(a[:90],s.count(a))
    return s.replace(a,b,1)

p=Path('IPD-Meta-Pro/src/secondary-plot-adapters.js')
raw=p.read_bytes()
assert hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()=='668e87d7fe24de7c4148ad6c716dab934ce5ae41'
s=raw.decode()
a=s.index('  function renderBayesian() {')
b=s.index('  function schedule() {',a)
s=s[:a]+"""  function setBayesianAvailability(available, message = '') {
    let status = byId('ipdBayesianPlotStatus');
    if (!status && byId('tracePlot')) {
      status = document.createElement('p'); status.id = 'ipdBayesianPlotStatus'; status.setAttribute('role','status');
      byId('tracePlot').parentElement.insertBefore(status, byId('tracePlot'));
    }
    if (status) { status.textContent = message; status.hidden = available; }
    for (const id of ['tracePlot','posteriorPlot']) if (byId(id)) byId(id).hidden = !available;
  }
  function renderBayesian() {
    const valid = bayes && bayes.owner === APP.bayesianResults && bayes.signature === dataSignature()
      && APP.bayesianResults?.chains?.length;
    setBayesianAvailability(!!valid, bayes
      ? 'The input data or Bayesian fit changed. Rerun MCMC before displaying these diagnostics.'
      : 'Run Bayesian analysis for the current input data to display trace and posterior plots.');
    if (!valid) return;
    const chains=APP.bayesianResults.chains.map(c=>c.muSamples);
    Plots.drawTrace(byId('tracePlot'),chains);Plots.drawDensity(byId('posteriorPlot'),chains);
  }
"""+s[b:]
s=once(s,"      if(canvas?.id==='tracePlot' && APP.bayesianResults) bayes={owner:APP.bayesianResults,signature:dataSignature()};", "      if(canvas?.id==='tracePlot' && APP.bayesianResults) {\n        bayes={owner:APP.bayesianResults,signature:dataSignature()};\n        setBayesianAvailability(true);\n      }")
p.write_text(s)

p=Path('tests/playwright/secondary-plot-fidelity.spec.mjs');s=p.read_text()
s=once(s,"import { test, expect } from '@playwright/test';", "import { test, expect } from '@playwright/test';\nimport { readFile } from 'node:fs/promises';")
s=once(s,"      const before=await page.evaluate(()=>JSON.stringify({fit:__networkFit,computed:__computedRanks,data:APP.data,config:APP.config}));", """      for (const [id, key] of [['rankogramPlot','probabilities'],['cumulativeRankPlot','cumulative']]) {
        const geometry = await page.locator('#'+id).evaluate(c=>c.__ipdRankGeometry);
        expect(geometry.length).toBe(drawn.rows.length ** 2);
        for (const mark of geometry) {
          const row=drawn.rows.find(r=>r.treatment===mark.treatment);
          expect(mark.probability).toBeCloseTo(row[key][mark.rank-1],12);
          expect(Number.isFinite(mark.x) && Number.isFinite(mark.y)).toBe(true);
        }
        await info.attach(id+'-visible', {body:await page.locator('#'+id).screenshot(),contentType:'image/png'});
      }
      const before=await page.evaluate(()=>JSON.stringify({fit:__networkFit,computed:__computedRanks,data:APP.data,config:APP.config}));""")
s=once(s,"      const download=page.waitForEvent('download');", "      const png=await page.locator('#survivalPlotLarge').evaluate(c=>c.toDataURL('image/png').split(',')[1]);\n      const download=page.waitForEvent('download');")
s=once(s,"      expect((await download).suggestedFilename()).toMatch(/survival.*\\.png$/);", "      const file=await download;\n      expect(file.suggestedFilename()).toMatch(/survival.*\\.png$/);\n      expect(await readFile(await file.path())).toEqual(Buffer.from(png,'base64'));")
s=once(s,"      expect(await page.evaluate(()=>JSON.stringify({results:APP.results,bayes:APP.bayesianResults,config:APP.config}))).toBe(before);", """      expect(await page.evaluate(()=>JSON.stringify({results:APP.results,bayes:APP.bayesianResults,config:APP.config}))).toBe(before);
      await page.evaluate(()=>{APP.data[0].__changedInput=1;IPDSecondaryPlots.schedule();});
      await expect(page.locator('#tracePlot')).toBeHidden();
      await expect(page.locator('#posteriorPlot')).toBeHidden();
      await expect(page.locator('#ipdBayesianPlotStatus')).toContainText('changed');
      expect(await page.evaluate(()=>__mcmcRefits)).toBe(0);""")
end="  });\n}\n"
assert s.endswith(end)
s=s[:-len(end)]+"""    test('IPD ranking clears on changed input rather than retaining the previous data',async({page})=>{
      await open(page);await network(page);
      await page.evaluate(()=>{APP.data[0].__changedInput=1;IPDSecondaryPlots.schedule();});
      await expect(page.locator('#rankogramPlot')).toBeHidden();
      await expect(page.locator('#cumulativeRankPlot')).toBeHidden();
      await expect(page.locator('#rankingTableBody tr')).toHaveCount(0);
      await expect(page.locator('#ipdRankingStatus')).toContainText('Input data changed');
    });
    test('IPD unsupported networks never receive substitute ranking curves',async({page})=>{
      await open(page);await page.locator('.nav-tab[data-panel="ranking"]').click();
      const reasons=await page.evaluate(()=>{
        const cases=[
          [[{study:'S1',treatment1:'A',treatment2:'B'},{study:'S2',treatment1:'C',treatment2:'D'}],['A','B','C','D'],'continuous'],
          [[{study:'Multi',treatment1:'A',treatment2:'B'},{study:'Multi',treatment1:'A',treatment2:'C'}],['A','B','C'],'binary'],
          [[{study:'S1',treatment1:'A',treatment2:'B'}],['A','B'],'survival']
        ];
        return cases.map(c=>IPDSecondaryPlots.rankingPrerequisite(...c));
      });
      expect(reasons[0]).toContain('disconnected');expect(reasons[1]).toContain('multi-arm');expect(reasons[2]).toContain('survival');
      for(const reason of reasons) {
        await page.evaluate(reason=>IPDSecondaryPlots.setRanking(null,reason),reason);
        await expect(page.locator('#rankogramPlot')).toBeHidden();
        await expect(page.locator('#cumulativeRankPlot')).toBeHidden();
        await expect(page.locator('#ipdRankingStatus')).toHaveText(reason);
      }
    });
"""+end
p.write_text(s)
print('Added cache invalidation and stronger geometry/export checks, without relaxing existing assertions.')
