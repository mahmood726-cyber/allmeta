from pathlib import Path
p=Path('IPD-Meta-Pro/src/diagnostic-plots.js');t=p.read_text()
old="      if(!capture.images?.length)throw new Error('R returned no Net Heat graphic. The network may not have an estimable inconsistency design.');"
new="""      if(!capture.images?.length){
        const reason=capture.output.filter(x=>['warning','message','stderr','stdout'].includes(x.type)).map(x=>typeof x.data==='string'?x.data:(x.data?.message||JSON.stringify(x.data))).join('; ');
        throw new Error(reason || 'R returned no Net Heat graphic for this design.');
      }"""
assert t.count(old)==1;t=t.replace(old,new,1)
# Explicit capture flag also supports graphics-device option differences between WebR releases.
old='captureGraphics:{width:750,height:750}'
assert t.count(old)==1;t=t.replace(old,'captureGraphics:{width:750,height:750,capture:true}',1)
p.write_text(t)
p=Path('tests/playwright/remaining-plots.spec.mjs');t=p.read_text()
old="      await expect(page.locator('#netHeatPlot')).toHaveAttribute('data-plot-state','ready',{timeout:200000});"
new="""      await expect(page.locator('#ipdNetHeatRun')).toBeEnabled({timeout:200000});
      expect(await page.locator('#netHeatPlot').getAttribute('data-plot-state'), await page.locator('#netHeatPlotStatus').innerText()).toBe('ready');"""
assert t.count(old)==1;p.write_text(t.replace(old,new,1))
