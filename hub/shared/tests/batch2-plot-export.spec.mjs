import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {readTiff} from './plot-export-reader.mjs';

const apps = {
  'dta-sroc': [['sroc','SROC plot','#svg-host svg'],['fagan','Fagan plot','#fagan-host svg'],['deeks','Deeks plot','#deeks-host svg']],
  heterogeneity: [['baujat','Baujat plot','#svg-host svg']],
  'meta-regression': [['bubble','Bubble plot','#svg-host svg']],
  nma: [['network','Network graph','#svg-host svg']],
  influence: [['loo','Leave-one-out forest','#loo-plot'],['influence','Influence plot','#influence-plot'],['baujat','Baujat plot','#baujat-plot'],['radial','Radial plot','#radial-plot']],
  'dose-response-ma': [['curve','Dose-response curve','#curve-host svg'],['residuals','Residual plot','#resid-host svg']],
};
for (const [app, plots] of Object.entries(apps)) {
  test(`${app} Run analysis placement, edits, keyboard and results`, async ({page}) => {
    await page.setViewportSize({width:1366,height:768});
    await page.goto(`/${app}/index.html`);
    const input=page.locator(app==='influence'?'#src':'#f-data'), run=page.getByRole('button',{name:'Run analysis',exact:true});
    await expect(run).toHaveAttribute('id','btn-run');
    await expect(run).toHaveClass('primary');
    await expect(run).toBeVisible();
    const box=await run.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(768);
    await input.focus();await page.keyboard.press('Tab');await expect(run).toBeFocused();
    const plot=page.locator(plots[0][2]);
    const before=await plot.innerHTML();
    const data=await input.inputValue();
    const edited=app==='dose-response-ma' ? data.split('\n').filter(line=>!/^\s*6\s*,/.test(line)).join('\n') : data.trimEnd().split('\n').slice(0,-1).join('\n');
    await input.fill(edited);
    if(app==='influence') {
      await expect(page.locator('#analysis-stale')).toBeVisible();
      await expect(page.locator('#analysis-stale')).toHaveText('Results out of date — press Run analysis');
      expect(await plot.innerHTML()).toBe(before);
    } else {
      await expect(page.locator('#analysis-stale')).toBeHidden();
      await expect(page.locator('#analysis-status')).toBeVisible();
      expect(await plot.innerHTML()).not.toBe(before); // auto-run is retained
      // Set the original data without input events: the button must really run,
      // rather than merely announce that the earlier auto-run completed.
      await input.evaluate((el,value)=>{el.value=value;},data);
    }
    const pending=await plot.innerHTML();
    await run.click();
    expect(await plot.innerHTML()).not.toBe(pending);
    await expect(page.locator('#analysis-stale')).toBeHidden();
    await expect(page.locator('#analysis-status')).toBeVisible();
    await expect(page.locator('#analysis-status')).toHaveText('Analysis updated');
    await expect(page.locator('#analysis-status')).toHaveAttribute('aria-live','polite');
    for (const [key,value] of [['Enter',app==='influence'?data:edited],['Space',app==='influence'?edited:data]]) {
      const previous=await plot.innerHTML();
      await input.evaluate((el,v)=>{el.value=v;},value);
      await run.focus();await page.keyboard.press(key);
      expect(await plot.innerHTML()).not.toBe(previous);
      await expect(page.locator('#analysis-stale')).toBeHidden();
      await expect(page.locator('#analysis-status')).toBeVisible();
    }
  });
  test(`${app} every plot exports PNG SVG and decoded TIFF at 300/600 dpi`, async ({page}) => {
    test.setTimeout(120000);
    await page.goto(`/${app}/index.html`);
    const panel=page.getByRole('group',{name:'Download plots',exact:true});
    await expect(panel).toHaveCount(1);
    await expect(page.locator('.alm-dl, .alm-xbar, #btn-svg, #btn-png')).toHaveCount(0);
    await panel.getByLabel('Physical width',{exact:true}).selectOption('85');
    for (const [id,name,selector] of plots) {
      const ratio=await page.locator(selector).evaluate(svg=>{const v=svg.viewBox.baseVal;return (v.height+24)/(v.width+24);});
      for (const [format,dpi] of [['png',300],['svg',300],['tiff',300],['tiff',600]]) {
        await panel.getByLabel('Format',{exact:true}).selectOption(format);
        if(format!=='svg')await panel.getByLabel('Resolution',{exact:true}).selectOption(String(dpi));
        const [file]=await Promise.all([page.waitForEvent('download'),panel.getByRole('button',{name:'Download '+name,exact:true}).click()]);
        expect(file.suggestedFilename()).toMatch(new RegExp('-'+id+'\\.'+format+'$'));
        const bytes=readFileSync(await file.path()),width=Math.round(85/25.4*dpi),height=Math.round(width*ratio);
        if(format==='tiff') {
          const decoded=readTiff(bytes);
          expect(decoded.tags[256]).toEqual([width]);expect(decoded.tags[257]).toEqual([height]);
          expect(decoded.tags[282]).toEqual([dpi]);expect(decoded.tags[283]).toEqual([dpi]);expect(decoded.tags[296]).toEqual([2]);
          expect(decoded.bytes.length).toBe(width*height*3);
          expect(decoded.bytes.some(x=>x<240)).toBe(true);
        } else if(format==='png') {
          expect([...bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
          expect(bytes.readUInt32BE(16)).toBe(width);expect(bytes.readUInt32BE(20)).toBe(height);
        } else {
          expect(bytes.toString()).toContain('<svg');expect(bytes.toString()).toContain('viewBox=');
        }
      }
    }
  });
  test(`${app} selector exports one or all plots`,async({page})=>{
    await page.goto(`/${app}/index.html`);
    const panel=page.getByRole('group',{name:'Download plots',exact:true});
    await panel.getByLabel('Format',{exact:true}).selectOption('svg');
    const files=[];page.on('download',file=>files.push(file.suggestedFilename()));
    await panel.getByRole('button',{name:'Select none',exact:true}).click();
    await panel.getByRole('button',{name:'Download selected',exact:true}).click();
    await expect(panel.getByRole('status')).toHaveText('Select at least one plot.');expect(files).toEqual([]);
    await panel.getByRole('checkbox',{name:plots[0][1],exact:true}).check();
    await panel.getByRole('button',{name:'Download selected',exact:true}).click();
    await expect(panel.getByRole('status')).toHaveText('Downloaded 1 file(s)');
    expect(files.splice(0)).toHaveLength(1);
    await panel.getByRole('button',{name:'Select all',exact:true}).click();
    await panel.getByRole('button',{name:'Download selected',exact:true}).click();
    await expect(panel.getByRole('status')).toHaveText(`Downloaded ${plots.length} file(s)`);
    expect(files).toHaveLength(plots.length);expect(new Set(files).size).toBe(plots.length);
  });
}

test('screen Train & rank is visible near the top without a fake analysis or plot panel', async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/screen/index.html');
  const train=page.getByRole('button',{name:'Train & rank',exact:true});
  await expect(train).toHaveAttribute('id','btn-train');
  await expect(train).toHaveClass('primary');await expect(train).toBeVisible();
  const box=await train.boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(768);
  await expect(page.locator('#btn-run, #alm-plot-mount')).toHaveCount(0);
});
