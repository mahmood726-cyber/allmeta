import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const out = new URL('./rchecks-out/p0share/', import.meta.url);
const note = 'Data too long for a link — use Export/Download to share the data';
const numbers = [[.25,.08],[.18,.10],[.40,.15],[.30,.09],[.12,.07],[.55,.20],[.22,.08],[.32,.12]];
const dataset = padding => numbers.map(([te,se], i) => [te,se,'S'+(i+1)+'x'.repeat(padding)].join(', ')).join('\n');
async function ready(page, app) {
  await page.waitForFunction(app => !!(app === 'gosh' ? window._almLastGosh?.() : window._almLastCopas?.()), app);
}
async function capture(page, app) {
  return page.evaluate(app => {
    const r = app === 'gosh' ? window._almLastGosh() : window._almLastCopas();
    return { src: document.getElementById('src').value, rows: r.studies || r.rows,
      estimate: app === 'gosh' ? r.median_est : r.fe_pooled,
      method: app === 'gosh' ? r.model : 'FE', k:r.k };
  }, app);
}
const csv = rows => rows.map(row => row.map(x => '"'+String(x).replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
async function save(name, value) {
  await mkdir(out, {recursive:true});
  await writeFile(new URL(name+'-source.csv',out), 'te,se,label\n'+value.src+'\n');
  await writeFile(new URL(name+'-rows.csv',out), csv([['te','se','label'], ...value.rows.map(r=>[r.te,r.se,r.label || ''])]));
  await writeFile(new URL(name+'-result.csv',out), csv([['method','k','estimate'],[value.method,value.k,value.estimate]]));
}
for (const app of ['gosh','copas']) for (const kind of ['short','past-cut','oversized']) {
  test(app+' '+kind+': full dataset or none, never a prefix', async ({page,browser}) => {
    test.setTimeout(120_000);
    await page.goto('/'+app+'/');
    await ready(page,app);
    const defaults = await page.locator('#src').inputValue();
    const src = dataset(kind === 'short' ? 0 : kind === 'past-cut' ? 100 : 600);
    if(kind !== 'short') expect(src.length).toBeGreaterThan(app==='gosh'?600:500);
    await page.locator('#src').fill(src);
    await page.evaluate(app => {window.__p0before = app==='gosh'?window._almLastGosh():window._almLastCopas();},app);
    await page.locator('#btn-run').click();
    await page.waitForFunction(app => {
      const r=app==='gosh'?window._almLastGosh():window._almLastCopas();
      return r && r!==window.__p0before;
    },app);
    const original = await capture(page,app);
    expect(original.k).toBe(numbers.length);
    expect(Number.isFinite(original.estimate)).toBe(true);
    const state = await page.evaluate(()=>window.alm.urlState.read());
    const omitted = kind==='oversized';
    if(omitted) {
      expect(Object.hasOwn(state,'src')).toBe(false);
      await expect(page.locator('#share-data-note')).toBeVisible();
      await expect(page.locator('#share-data-note')).toHaveText(note);
    } else {
      expect(state.src).toBe(src);
      await expect(page.locator('#share-data-note')).toHaveCount(0);
    }
    // Fresh storage proves this comes from the link, not autosave.
    const ctx=await browser.newContext();
    try {
      const restoredPage=await ctx.newPage();
      await restoredPage.goto(page.url());
      await ready(restoredPage,app);
      const restored=await capture(restoredPage,app);
      expect(restored.src).toBe(omitted ? defaults : src);
      if(!omitted) expect(restored.estimate).toBe(original.estimate);
      await save(app+'-'+kind+'-original',original);
      await save(app+'-'+kind+'-restored',restored);
      await writeFile(new URL(app+'-'+kind+'-flags.csv',out),csv([['omitted','note'],[Number(!Object.hasOwn(state,'src')),Number(await page.locator('#share-data-note').isVisible())]]));
      if(kind==='past-cut') {
        // Actual historical prefix: first numeric columns remain valid but later studies disappear.
        const truncated=src.substring(0,app==='gosh'?600:500);
        await writeFile(new URL(app+'-plant-source.csv',out),'te,se,label\n'+truncated+'\n');
        await writeFile(new URL(app+'-plant-result.csv',out),csv([['method','k','estimate'],[original.method,original.k,original.estimate]]));
      }
    } finally { await ctx.close(); }
    if(omitted) {
      await page.locator('#src').fill(dataset(0));
      await page.locator('#btn-run').click();
      await expect(page.locator('#share-data-note')).toHaveCount(0);
      expect(await page.evaluate(()=>window.alm.urlState.read().src)).toBe(dataset(0));
    }
  });
}

// Reproduce pixel scenario 8 without changing or generating pixel references.
test('GOSH Plus suspended capture preserves notice and plot geometry', async ({page}) => {
  const corpus=JSON.parse(await readFile(new URL('../../../gosh/validate/plus/corpus.json',import.meta.url),'utf8'));
  const c=corpus.find(c=>c.id==='dat.anand1999::001');
  expect(c).toBeTruthy();
  await page.goto('/gosh/index.html',{waitUntil:'domcontentloaded'});
  await ready(page,'gosh');
  await page.waitForFunction(()=>typeof AlmGoshPlus!=='undefined');
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('#share-data-note')).toHaveCount(0);
  await page.evaluate(c=>AlmGoshPlus.render(AlmGoshPlus.capture(c.te.map((x,i)=>[x,c.se[i],c.source_rows[i]].join(', ')).join('\n'),'DL',5000)),c);
  await page.locator('#plus-study').selectOption('3');
  await page.locator('#plus-het').selectOption('I2');
  await expect(page.locator('#share-data-note')).toHaveCount(0);
  const before=await page.locator('#plus-plot').boundingBox();
  expect(before).not.toBeNull();
  await page.evaluate(()=>document.getElementById('share-data-note')?.remove());
  expect(await page.locator('#plus-plot').boundingBox()).toEqual(before);
});

// Round-1 contract timed out before checking this planted source mutation.
// Keep the same 30-second budget and assertion; steps locate any repeated stall.
for (const planted of [false, true]) test('GOSH Plus FE count header '+(planted ? 'source plant is rejected' : 'correct source control'), async ({page}) => {
  const corpus=JSON.parse(await readFile(new URL('../../../gosh/validate/plus/corpus.json',import.meta.url),'utf8'));
  const refs=JSON.parse(await readFile(new URL('../../../gosh/validate/plus/reference.json',import.meta.url),'utf8'));
  const c=corpus[0], model='FE';
  if(planted) await page.route('**/gosh/plus.js',async route=>{
    const body=await (await route.fetch()).text();
    expect(body).toContain("'With: count'");
    await route.fulfill({contentType:'application/javascript',body:body.replace("'With: count'","'Wrong count'")});
  });
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
    const style=document.createElement('style');
    style.textContent='main, .panel { animation: none !important; }';
    document.head.append(style);
  },{once:true}));
  await test.step('load GOSH',()=>page.goto('/gosh/index.html'));
  await test.step('capture and render FE extras',()=>page.evaluate(({c,model})=>
    AlmGoshPlus.render(AlmGoshPlus.capture(c.te.map((x,i)=>[x,c.se[i],c.source_rows[i]].join(', ')).join('\n'),model,5000)),{c,model}));
  await test.step('select Q',()=>page.locator('#plus-het').selectOption('Q'));
  await test.step('verify independent source semantics',async()=>{
    const comparison=page.evaluate(({r,k,model})=>{
      const failures=[];
      AlmGoshPlusAdapter.compareDisplay(r,k,model,(q,a,b,kind)=>{
        if(!AlmValidate.compare(a,b,kind,1e-9).pass) failures.push(q);
      });
      return failures;
    },{r:refs.find(r=>r.key===c.id+'::'+model),k:c.k,model});
    if(planted) await expect(comparison).rejects.toThrow(/selector|table headers|sort declaration/);
    else expect(await comparison).toEqual([]);
  });
});
