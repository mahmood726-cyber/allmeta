from pathlib import Path
p=Path('IPD-Meta-Pro/src/diagnostic-plots.js');t=p.read_text()
old="      if(!capture.images?.length)throw new Error('R returned no Net Heat graphic. The network may not have an estimable inconsistency design.');"
new="""      if(!capture.images?.length){
        const reason=capture.output.filter(x=>['warning','message','stderr','stdout'].includes(x.type)).map(x=>typeof x.data==='string'?x.data:(x.data?.message||JSON.stringify(x.data))).join('; ');
        throw new Error(reason || 'R returned no Net Heat graphic for this design.');
      }"""
assert t.count(old)==1;t=t.replace(old,new,1)
old='captureGraphics:{width:750,height:750}'
assert t.count(old)==1;t=t.replace(old,'captureGraphics:{width:750,height:750,capture:true}',1)
old='netmeta::netheat(nm, random=FALSE)';assert t.count(old)==1
t=t.replace(old,"withCallingHandlers(netmeta::netheat(nm, random=FALSE, showall=TRUE), warning=function(w) { cat('Net Heat warning: ',conditionMessage(w),'\\\\n',sep=''); invokeRestart('muffleWarning') })",1)
p.write_text(t)
p=Path('tests/playwright/remaining-plots.spec.mjs');t=p.read_text()
old="      const before = await page.evaluate(() => JSON.stringify({data:APP.data,results:APP.results,config:APP.config}));\n      await page.locator('#ipdNetHeatRun').click();"
new="""      // The built-in example does not supply enough informative designs.
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
      await page.locator('#ipdNetHeatRun').click();"""
assert t.count(old)==1;t=t.replace(old,new,1)
old="      await expect(page.locator('#netHeatPlot')).toHaveAttribute('data-plot-state','ready',{timeout:200000});"
new="""      await expect(page.locator('#ipdNetHeatRun')).toBeEnabled({timeout:200000});
      expect(await page.locator('#netHeatPlot').getAttribute('data-plot-state'), await page.locator('#netHeatPlotStatus').innerText()).toBe('ready');"""
assert t.count(old)==1;p.write_text(t.replace(old,new,1))
