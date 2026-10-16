import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
const root=new URL('../../../gosh/validate/',import.meta.url);
const corpus=JSON.parse(readFileSync(new URL('plus/corpus.json',root),'utf8'));
const refs=JSON.parse(readFileSync(new URL('plus/reference.json',root),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('MANIFEST-plus.json',root),'utf8'));
const url=process.env.GOSH_PLUS_PAGE || '/gosh/index.html';
const fields=['with_n','without_n','with_mean','without_mean','diff_mean','with_median','without_median','diff_median','with_i2','without_i2','diff_i2'];
async function render(page,c=corpus[0],model='DL') {
  await page.evaluate(({c,model})=>AlmGoshPlus.render(AlmGoshPlus.capture(c.te.map((x,i)=>`${x}, ${c.se[i]}, ${c.source_rows[i]}`).join('\n'),model,5000)),{c,model});
}
async function failures(page,c=corpus[0],model='DL') {
  return page.evaluate(({r,k,model})=>{const failures=[];AlmGoshPlusAdapter.compareDisplay(r,k,model,(q,a,b,kind)=>{if(!AlmValidate.compare(a,b,kind,1e-9).pass)failures.push(q);});return failures;},{r:refs.find(r=>r.key===c.id+'::'+model),k:c.k,model});
}
test('extras every quantity against pinned R corpus, offline',async({page,context})=>{
  test.setTimeout(300000);await page.goto(url);
  const before=await page.evaluate(()=>({snapshot:__almGoshValidationSnapshot(),href:location.href,storage:{...localStorage}}));
  await page.evaluate(()=>AlmGoshPlusValidation.prepare());await context.setOffline(true);
  const result=await page.evaluate(()=>AlmGoshPlusValidation.runCorpus());
  expect(result.checks).toBe(manifest.checks);expect(result.passed).toBe(result.checks);expect(result.failed).toEqual([]);
  expect(await page.evaluate(()=>({snapshot:__almGoshValidationSnapshot(),href:location.href,storage:{...localStorage}}))).toEqual(before);
  console.log('GOSH PLUS REPLAY',result.passed+'/'+result.checks);
});
test('extras selector, study counts, sorting, keyboard and isolated plot',async({page})=>{
  await page.goto(url);const original=await page.locator('#plot').innerHTML();await render(page);
  for(let i=1;i<=corpus[0].k;i++){
    await page.locator('#plus-study').selectOption(String(i));
    expect(await failures(page)).toEqual([]);
    const n=refs.find(r=>r.key===corpus[0].id+'::DL').rows[i-1].with_n;
    await expect(page.locator('#plus-plot circle[data-includes=true]')).toHaveCount(n);
  }
  for(const het of ['I2','H2','Q','tau2','tau']){await page.locator('#plus-het').selectOption(het);expect(await failures(page)).toEqual([]);}
  await page.getByRole('button',{name:'With: mean estimate',exact:true}).click();
  let order=await page.locator('[data-quantity=with_mean]').allTextContents();expect(order.map(Number)).toEqual(order.map(Number).sort((a,b)=>a-b));
  await page.getByRole('button',{name:'With: mean estimate',exact:true}).click();
  order=await page.locator('[data-quantity=with_mean]').allTextContents();expect(order.map(Number)).toEqual(order.map(Number).sort((a,b)=>b-a));
  await expect(page.locator('#plus-table thead th').nth(3)).toHaveAttribute('aria-sort','descending');
  const button=page.locator('#plus-table tbody tr[data-study="2"] button');await button.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#plus-study')).toHaveValue('2');await expect(page.locator('#plus-table tbody tr[data-study="2"]')).toHaveAttribute('aria-selected','true');
  await page.locator('#plus-table tbody tr[data-study="3"] td').first().click();
  await expect(page.locator('#plus-study')).toHaveValue('3');
  await expect(page.getByLabel('Highlight study',{exact:true})).toBeVisible();await expect(page.getByLabel('Highlight plot heterogeneity')).toBeVisible();
  expect(await page.locator('#plot').innerHTML()).toBe(original);
  await render(page,corpus[0],'FE');expect(await page.locator('#plus-het option').evaluateAll(os=>os.map(o=>o.value))).toEqual(['I2','H2','Q']);expect(await failures(page,corpus[0],'FE')).toEqual([]);
});
for(const q of fields)test('extras displayed mutation fails only '+q,async({page})=>{
  await page.goto(url);await render(page);
  await page.locator(`#plus-table tr[data-study="1"] [data-quantity="${q}"]`).evaluate(td=>td.textContent=String(Number(td.textContent)+1));
  expect(await failures(page)).toEqual(['study.1.'+q]);
});
for(const [attr,quantity] of [['cx','plot_x.0'],['cy','plot_y.0'],['data-includes','included.0'],['fill','colour.0']])test('extras graphical mutation fails only '+quantity,async({page})=>{
  await page.goto(url);await render(page);
  await page.locator('#plus-plot circle').first().evaluate((c,attr)=>c.setAttribute(attr,attr==='data-includes'?'tampered':attr==='fill'?'#000000':String(Number(c.getAttribute(attr))+1)),attr);
  expect(await failures(page)).toEqual([quantity]);
});
test('extras count mutation and evidence refusal',async({page})=>{
  await page.goto(url);await render(page);await page.locator('#plus-counts').evaluate(e=>e.textContent+='1');
  expect(await failures(page)).toEqual(['highlight_counts']);
  await render(page);await page.locator('#plus-table tbody').evaluate(body=>body.rows[1].replaceWith(body.rows[0].cloneNode(true)));
  await expect(failures(page)).rejects.toThrow('Extra quantity coverage mismatch');
  await render(page);await page.locator('#plus-table thead button').nth(3).evaluate(e=>e.textContent='Wrong quantity');
  await expect(failures(page)).rejects.toThrow('Invalid extra table headers');
  await render(page);await page.locator('#plus-table tbody th button').first().evaluate(e=>e.textContent='Wrong study');
  await expect(failures(page)).rejects.toThrow('Invalid extra study label');
  await page.route('**/validate/plus/corpus.json',r=>r.fulfill({contentType:'application/json',body:'[]'}));
  await expect(page.evaluate(()=>AlmGoshPlusValidation.runCorpus())).rejects.toThrow('SHA-256 mismatch');
});
test('extras reject invalid inputs and empty sampled groups',async({page})=>{
  await page.goto(url);
  for(const text of ['bad','1, 1\n2, 0\n3, 1',Array.from({length:101},()=>'.1,.2').join('\n')])await expect(page.evaluate(t=>AlmGoshPlus.capture(t),text)).rejects.toThrow('valid effect rows');
  const c=corpus.find(c=>c.k>15);await expect(page.evaluate(c=>AlmGoshPlus.capture(c.te.map((x,i)=>`${x}, ${c.se[i]}`).join('\n'),'DL',1),c)).rejects.toThrow('empty with/without');
});
for(const model of ['FE','DL'])test('extras live webR '+model+' @slow',async({page})=>{
  test.setTimeout(300000);await page.goto(url);
  const c=corpus[0];await page.locator('#src').fill(c.te.map((x,i)=>`${x}, ${c.se[i]}`).join('\n'));await page.locator('#model').selectOption(model);
  const r=await page.evaluate(()=>AlmGoshPlusValidation.runLive());expect(r.rows.filter(x=>!x.pass)).toEqual([]);expect(r.versions.metafor).toBe('4.8-0');
  console.log('GOSH PLUS LIVE',model,r.rows.length+'/'+r.rows.length);
});

for(const [i,quantity] of [[2,'xmin'],[3,'xmax'],[4,'ymin'],[5,'ymax']])test('extras axis mutation fails only '+quantity,async({page})=>{
  await page.goto(url);await render(page);
  await page.locator('#plus-plot text').nth(i).evaluate(e=>e.textContent=String(Number(e.textContent)+1));
  expect(await failures(page)).toEqual([quantity]);
});
test('extras live sampled DL uses the same memberships @slow',async({page})=>{
  test.setTimeout(300000);await page.goto(url);const c=corpus.find(c=>c.k>15);
  await page.locator('#src').fill(c.te.map((x,i)=>`${x}, ${c.se[i]}`).join('\n'));
  await page.locator('#model').selectOption('DL');await page.locator('#btn-run').click();await page.locator('#n-sample').fill('37');
  const r=await page.evaluate(()=>AlmGoshPlusValidation.runLive());expect(r.rows.filter(x=>!x.pass)).toEqual([]);expect(r.versions.metafor).toBe('4.8-0');
  console.log('GOSH PLUS LIVE SAMPLED DL',r.rows.length+'/'+r.rows.length);
});
