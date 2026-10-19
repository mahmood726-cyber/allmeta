import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const refs = JSON.parse(await readFile(new URL('../../HTA/validation/advanced_synthesis_fixtures.json', import.meta.url), 'utf8'));
const data = refs.pairwise.find(c => c.name === 'heterogeneous').data;
function csv(rows) {
  const keys=Object.keys(rows[0]);
  return [keys,...rows.map(r=>keys.map(k=>r[k]))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
async function open(page) {
  await page.addInitScript(()=>{localStorage.setItem('hta_tutorial_seen','true');localStorage.setItem('hta-tutorial-completed','true');});
  await page.goto('/HTA/index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.advancedUI?.synthesis);
  await page.getByRole('button',{name:'Load demo model',exact:true}).click();
  expect(await page.evaluate(()=>(window.app||window.htaApp).validationResults.valid)).toBe(true);
}
async function navigate(page,section) { await page.locator(`[data-section="${section}"]`).first().click(); }
async function upload(page,kind,rows,format='csv') {
  const chooser=page.waitForEvent('filechooser');
  await page.locator(`#btn-import-${kind}-data`).click();
  await (await chooser).setFiles({name:`actual-data.${format}`,mimeType:format==='csv'?'text/csv':'application/json',buffer:Buffer.from(format==='csv'?csv(rows):JSON.stringify({studies:rows}))});
  await expect(page.locator(`#${kind}-analysis-message`)).toContainText('Imported');
}
async function populated(page,id) {
  const svg=page.locator('#'+id);await expect(svg).toBeVisible();
  expect(await svg.evaluate(s=>{
    const a=s.getBoundingClientRect(),b=s.parentElement.getBoundingClientRect();
    return a.width>100&&a.left>=b.left-1&&a.right<=b.right+1&&a.right<=innerWidth+1;
  })).toBe(true);
  expect(await svg.evaluate(s=>!!new DOMParser().parseFromString(new XMLSerializer().serializeToString(s),'image/svg+xml').querySelector('parsererror'))).toBe(false);
  expect(await svg.locator('line,circle,rect[data-pscore]').count()).toBeGreaterThan(0);
  expect(await svg.evaluate(s=>[...s.querySelectorAll('*')].flatMap(el=>[...el.attributes]).filter(a=>/^(d|points|x|y|x1|x2|y1|y2|cx|cy|width|height)$/.test(a.name)&&/NaN|Infinity/.test(a.value)).map(a=>a.value))).toEqual([]);
  return svg;
}
async function saved(page,kind) { return page.evaluate(kind=>JSON.parse(JSON.stringify(advancedUI.synthesis.fits[kind])),kind); }
async function download(page,button) {
  const event=page.waitForEvent('download');await button.click();return readFile(await (await event).path(),'utf8');
}
function checkMA(fit,c) {
  for(const key of ['effect','se','ci_lower','ci_upper','pValue']) expect(fit.results.random[key]).toBeCloseTo(c.expected[key],6);
  expect(fit.results.heterogeneity.tauSquared).toBeCloseTo(c.expected.tauSquared,6);
  expect(fit.settings.confidenceLevel).toBe(c.confidenceLevel);
  expect(fit.settings.method).toBe(c.method);
}

for(const width of [1280,390]) {
  test.describe(`advanced HTA at ${width}px`,()=>{
    test.use({viewport:{width,height:900}});
    for(const format of ['csv','json']) {
      test(`${format} pairwise import, settings, sensitivities and exports agree with independent numbers`,async({page},info)=>{
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await open(page);await navigate(page,'meta-methods');
        await page.locator('#ma-effect-measure').selectOption('HR');
        await upload(page,'ma',data,format);
        expect(await page.locator('#ma-effect-measure').inputValue()).toBe('HR');
        for(const method of ['REML','DL','PM']) for(const level of [.90,.95,.99]) {
          await page.locator('#ma-tau-method').selectOption(method);
          await page.locator('#ma-ci-level').selectOption(level.toFixed(2));
          await expect(page.locator('#hta-advanced-ma-forest')).toHaveCount(0);
          await page.locator('#btn-run-ma').click();
          const fit=await saved(page,'ma'),c=refs.pairwise.find(c=>c.name==='heterogeneous'&&c.method===method&&c.confidenceLevel===level);
          checkMA(fit,c);
          const forest=await populated(page,'hta-advanced-ma-forest');
          const rows=await forest.evaluate(s=>s.__plotData);
          expect(rows.at(-1).effect).toBe(fit.results.random.effect);
          expect(rows.at(-1).lo).toBe(fit.results.random.ci_lower);
          expect(rows.at(-1).hi).toBe(fit.results.random.ci_upper);
          data.forEach((d,i)=>{expect(rows[i].effect).toBe(d.effect);expect(rows[i].weight).toBe(fit.results.weights.random[i]);});
          await expect(page.locator('#ma-model-description')).toContainText(`${level*100}% normal-approximation`);
          await expect(page.locator('#ma-model-description')).toContainText('log(HR)');
          await page.locator('#section-meta-methods [data-tab="cumulative"]').click();
          await populated(page,'hta-advanced-ma-cumulative');
          const cumulative=await page.locator('#hta-advanced-ma-cumulative').evaluate(s=>s.__plotData);
          expect(cumulative.at(-1).effect).toBeCloseTo(c.expected.effect,6);
          expect(cumulative.at(-1).hi).toBeCloseTo(c.expected.ci_upper,6);
          if(level===.95) {
            fit.cumulative.results.forEach((r,i)=>expect(r.effect).toBeCloseTo(refs.sensitivity[method].cumulative[i].effect,6));
            fit.leaveOneOut.results.forEach((r,i)=>expect(r.effect).toBeCloseTo(refs.sensitivity[method].leaveOneOut[i].effect,6));
          }
        }
        const fit=await saved(page,'ma');
        const json=JSON.parse(await download(page,page.locator('#btn-export-ma-fit')));
        expect(json.settings).toEqual(fit.settings);expect(json.results).toEqual(fit.results);expect(json.data).toEqual(fit.data);
        const exported=await download(page,page.locator('#btn-export-ma-csv'));
        expect(exported).toContain('"'+String(fit.results.random.effect)+'"');
        expect(exported).toContain('"'+String(fit.results.random.ci_upper)+'"');
        expect(exported).toContain('"random","PM","normal approximation","0.99","log(HR)"');
        const svg=await populated(page,'hta-advanced-ma-forest');
        expect(JSON.parse(await svg.locator('metadata[data-hta-fit-metadata]').textContent()).settings).toEqual(fit.settings);
        const xml=await svg.evaluate(s=>new XMLSerializer().serializeToString(s));
        expect(await download(page,page.getByRole('button',{name:'Download Forest plot (99% CI; log(HR)) SVG',exact:true}))).toBe(xml);
        await info.attach('pairwise-actual-data',{body:await svg.screenshot(),contentType:'image/png'});
        await page.locator('#ma-pred-int').selectOption('false');
        await page.locator('#ma-i2-ci').selectOption('true');
        await page.locator('#btn-run-ma').click();
        await expect(page.locator('#ma-pred-interval')).toHaveText('Not requested');
        expect((await saved(page,'ma')).results.heterogeneity.predictionInterval).toBeNull();
        await expect(page.locator('#ma-heterogeneity-body')).toContainText('Approximate test-based 95% interval');
        expect(errors).toEqual([]);
      });
    }
    for(const outcome of ['binary','continuous']) {
      test(`${outcome} network import, references, orientation, P-scores and exports`,async({page},info)=>{
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await open(page);await navigate(page,'nma');
        const c=refs.network.find(c=>c.name===outcome+'-A');
        await page.locator('#nma-outcome').selectOption(outcome);
        await upload(page,'nma',c.data,outcome==='binary'?'csv':'json');
        for(const ref of ['A','B']) {
          await page.locator('#nma-reference').selectOption(ref);
          await page.locator('#btn-run-nma').click();
          const fit=await saved(page,'nma'),expected=refs.network.find(c=>c.name===outcome+'-'+ref).expected;
          expect(fit.results.model).toBe('fixed');expect(fit.fittedTauSquared).toBe(0);
          expected.effects.forEach(e=>{
            const actual=fit.results.effects.find(a=>a.treatment===e.treatment);
            for(const key of ['mean','se','ci_lower','ci_upper','pValue']) expect(actual[key]).toBeCloseTo(e[key],6);
          });
          for(const id of ['hta-advanced-nma-network','hta-advanced-nma-ranking','hta-advanced-nma-forest','hta-advanced-nma-funnel']) await populated(page,id);
          expect(await page.locator('#hta-advanced-nma-network circle[data-treatment]').evaluateAll(cs=>cs.map(c=>c.dataset.treatment).sort())).toEqual(expected.treatments.slice().sort());
          const forest=await page.locator('#hta-advanced-nma-forest').evaluate(s=>s.__plotData);
          expect(forest.map(r=>r.effect)).toEqual(fit.results.effects.map(e=>e.mean));
          expect(forest.map(r=>r.lo)).toEqual(fit.results.effects.map(e=>e.ci_lower));
          fit.scores.forEach(s=>expect(Math.abs(s.pScore-expected.scores.find(e=>e.treatment===s.treatment).pScore)).toBeLessThan(1e-5));
          await expect(page.locator('#nma-model-description')).toContainText('Frequentist fixed-effect');
          await expect(page.locator('#nma-league-table')).toContainText('Column vs row');
        }
        const upper=await saved(page,'nma');
        await page.locator('#nma-direction').selectOption('lower');await page.locator('#btn-run-nma').click();
        const lower=await saved(page,'nma');
        upper.scores.forEach(s=>expect(lower.scores.find(t=>t.treatment===s.treatment).pScore).toBeCloseTo(100-s.pScore,10));
        expect(lower.settings.rankingDirection).toBe('lower');
        const json=JSON.parse(await download(page,page.locator('#btn-export-nma-fit')));
        expect(json.results).toEqual(lower.results);expect(json.scores).toEqual(lower.scores);
        expect(json.results).not.toHaveProperty('sucra');expect(json.results).not.toHaveProperty('consistency');
        const exported=await download(page,page.locator('#btn-export-nma-csv'));
        lower.results.effects.forEach(e=>expect(exported).toContain('"'+String(e.mean)+'","'+String(e.se)+'"'));
        expect(exported).toContain('"0","fixed","frequentist","normal approximation","0.95"');
        const svg=await populated(page,'hta-advanced-nma-network');const xml=await svg.evaluate(s=>new XMLSerializer().serializeToString(s));
        expect(await download(page,page.getByRole('button',{name:'Download Observed treatment network SVG',exact:true}))).toBe(xml);
        await info.attach('network-actual-data',{body:await svg.screenshot(),contentType:'image/png'});
        for(const [id,value] of [['nma-model','random'],['nma-method','bayesian'],['nma-outcome','survival']]) expect(await page.locator(`#${id} option[value="${value}"]`).isDisabled()).toBe(true);
        expect(errors).toEqual([]);
      });
    }
    test('invalid pairwise imports, edits and unsupported settings remove previous results',async({page})=>{
      await open(page);await navigate(page,'meta-methods');await upload(page,'ma',data);await page.locator('#btn-run-ma').click();
      await populated(page,'hta-advanced-ma-forest');
      for(const invalid of [
        'study,effect,se\nBad,0.2,0',
        'study,effect,se\nBad,Infinity,0.1',
        'study,effect,se\nBad,0.2,',
        'study,effect,se\nBad,0.2,0.1\nBad,0.3,0.1',
        'study,effect,se\n"unclosed,0.2,0.1',
        '[{"study":"Bad","effect":0.2,"se":null}]'
      ]) {
        await page.locator('#ma-data-input').fill(invalid);
        await expect(page.locator('#hta-advanced-ma-forest')).toHaveCount(0);
        await expect(page.locator('#btn-export-ma-fit')).toBeDisabled();
        await page.locator('#btn-run-ma').click();expect(await saved(page,'ma')).toBeNull();
        await expect(page.locator('#ma-analysis-message')).not.toBeEmpty();
      }
      await upload(page,'ma',data);await page.locator('#btn-run-ma').click();
      await page.locator('#ma-file-input').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
      await expect(page.locator('#ma-analysis-message')).toContainText('Import failed');
      await expect(page.locator('#ma-data-input')).toHaveValue('');
      await expect(page.locator('#hta-advanced-ma-forest')).toHaveCount(0);
      for(const [id,value] of [['ma-tau-method','EB'],['ma-hksj','true'],['ma-small-study','knha'],['ma-pub-bias','peters']]) expect(await page.locator(`#${id} option[value="${value}"]`).isDisabled()).toBe(true);
      await upload(page,'ma',data.map(({year,...s})=>s),'json');await page.locator('#btn-run-ma').click();
      await page.locator('#section-meta-methods [data-tab="cumulative"]').click();
      await expect(page.locator('#ma-cumulative-note')).toContainText('input order');
    });
    test('disconnected, multi-arm, repeated and incompatible network inputs are rejected',async({page})=>{
      await open(page);await navigate(page,'nma');const rows=refs.network[0].data;
      await upload(page,'nma',rows);await page.locator('#btn-run-nma').click();await populated(page,'hta-advanced-nma-network');
      const invalid=[
        {rows:[...rows.slice(0,2),{...rows[2],treatment:'C'},{...rows[3],treatment:'D'}],message:'not fully connected'},
        {rows:[...rows,{...rows[0],treatment:'D'}],message:'exactly two arms'},
        {rows:[...rows,{...rows[0]}],message:'repeated within study'},
        {rows:rows.map((r,i)=>i===0?{...r,events:r.n+1}:r),message:'between zero and n'},
        {rows:rows.map((r,i)=>i===0?{...r,n:null}:r),message:'finite number'}
      ];
      for(const bad of invalid) {
        await page.locator('#nma-data-input').fill(JSON.stringify(bad.rows));
        await expect(page.locator('#hta-advanced-nma-network')).toHaveCount(0);
        await page.locator('#btn-run-nma').click();
        await expect(page.locator('#nma-analysis-message')).toContainText(bad.message);
        expect(await saved(page,'nma')).toBeNull();await expect(page.locator('#btn-export-nma-fit')).toBeDisabled();
      }
      await page.locator('#nma-outcome').selectOption('continuous');
      await page.locator('#nma-data-input').fill(JSON.stringify(rows));await page.locator('#btn-run-nma').click();
      await expect(page.locator('#nma-analysis-message')).toContainText('mean must be a finite number');
    });
    test('tab reveal and resize redraw saved values without refitting or clearing another panel tab',async({page})=>{
      await open(page);await navigate(page,'meta-methods');await upload(page,'ma',data);await page.locator('#btn-run-ma').click();
      await page.locator('#section-meta-methods [data-tab="cumulative"]').click();await populated(page,'hta-advanced-ma-cumulative');
      const fit=await saved(page,'ma');
      await page.evaluate(()=>{window.__refits=0;const f=MetaAnalysisMethods.prototype.calculatePooledEffect;MetaAnalysisMethods.prototype.calculatePooledEffect=function(...a){__refits++;return f.apply(this,a);};});
      await navigate(page,'nma');
      await upload(page,'nma',refs.network[0].data);await page.locator('#btn-run-nma').click();
      await page.locator('#section-nma [data-tab="heterogeneity"]').click();
      await navigate(page,'meta-methods');await expect(page.locator('#tab-cumulative')).toHaveClass(/active/);
      await page.setViewportSize({width:width+50,height:950});await populated(page,'hta-advanced-ma-cumulative');
      expect(await page.evaluate(()=>__refits)).toBe(0);expect(await saved(page,'ma')).toEqual(fit);
    });
    test('publication-bias controls display actual observed/imputed points and clear stale diagnostics',async({page})=>{
      await open(page);await navigate(page,'meta-methods');await upload(page,'ma',data);await page.locator('#btn-run-ma').click();
      await navigate(page,'pub-bias');await page.locator('#btn-run-pub-bias').click();
      await populated(page,'hta-advanced-pb-funnel');await populated(page,'hta-advanced-pb-trimfill');
      const fit=await saved(page,'pb'),plot=await page.locator('#hta-advanced-pb-trimfill').evaluate(s=>s.__plotData);
      expect(plot.center).toBe(fit.trimFill.adjusted.effect);
      expect(plot.rows.filter(r=>!r.imputed).map(r=>r.effect)).toEqual(data.map(d=>d.effect));
      expect(plot.rows.filter(r=>r.imputed).map(r=>r.effect)).toEqual(fit.trimFill.imputedStudies.map(d=>d.effect));
      await expect(page.locator('#pub-bias-summary')).toContainText('exploratory fixed-effect adjustment');
      expect(await page.locator('.pub-bias-test[value="selection"]').isDisabled()).toBe(true);
      await navigate(page,'meta-methods');await page.locator('#ma-data-input').fill(csv(data.slice(0,2)));
      await navigate(page,'pub-bias');await page.locator('#btn-run-pub-bias').click();
      await expect(page.locator('#hta-advanced-pb-funnel')).toHaveCount(0);
      await expect(page.locator('#pb-analysis-message')).toContainText('at least 3 studies');
    });
    test('beginner diagnostic sample explicitly states that no DTA model was fitted',async({page})=>{
      await open(page);
      await page.evaluate(data=>{beginnerMode.runPairwiseAnalysis({name:'Previous data',studies:data});beginnerMode.runPublicationBias();},data);
      await expect(page.locator('#bias-modal')).toBeVisible();
      await page.evaluate(()=>beginnerMode.loadSampleDataset('diabetes'));
      await expect(page.locator('#hta-synthesis-error')).toContainText('Diagnostic test accuracy is not implemented in the beginner workflow');
      await expect(page.locator('#hta-synthesis-error')).toContainText('No bivariate or HSROC model has been fitted');
      await expect(page.locator('#hta-synthesis-error svg')).toHaveCount(0);
      await expect(page.locator('#bias-modal,#results-modal,#hta-nma-results')).toHaveCount(0);
      expect(await page.evaluate(()=>({ma:lastResults,nma:lastNMAEngine,dataset:currentDataset}))).toEqual({ma:null,nma:null,dataset:null});
    });
    test('returning-user cache migration replaces stale HTA scripts and preserves other app caches',async({page})=>{
      await page.goto('/HTA/manifest.json');
      await page.evaluate(async()=>{
        const old=await caches.open('hta-pro-v1.0.0');
        await old.put('/HTA/src/ui/advancedUI.js',new Response('window.__staleAdvancedUI=true;',{headers:{'Content-Type':'application/javascript'}}));
        const other=await caches.open('allmeta-other-app-regression');
        await other.put('/unrelated-fixture',new Response('preserved'));
      });
      await open(page);
      await page.evaluate(()=>navigator.serviceWorker.ready);
      await expect.poll(()=>page.evaluate(()=>caches.keys())).not.toContain('hta-pro-v1.0.0');
      expect(await page.evaluate(()=>caches.keys())).toContain('allmeta-other-app-regression');
      await page.reload();await page.waitForFunction(()=>!!window.advancedUI?.synthesis);
      expect(await page.evaluate(()=>window.__staleAdvancedUI)).toBeUndefined();
      await page.getByRole('button',{name:'Load demo model',exact:true}).click();
      await navigate(page,'meta-methods');await upload(page,'ma',data);await page.locator('#btn-run-ma').click();
      await populated(page,'hta-advanced-ma-forest');
    });
  });
}
