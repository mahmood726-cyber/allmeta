import {test, expect} from '@playwright/test';

const records = [
  {id:'__control_doi_a', title:'__control_alpha renal mechanism',doi:'10.1/control',authors:['Control Alpha'],year:'2019',journal:'__control_journal_a'},
  {id:'__control_doi_b', title:'__control_zeta metabolic experiment',doi:'10.1/control',authors:['Control Beta'],year:'2020',journal:'__control_journal_b'},
  {id:'__control_fuzzy_a', title:'__control_cardiac therapy outcomes across twelve hospitals',authors:['Control Gamma'],year:'2021'},
  {id:'__control_fuzzy_b', title:'__control_cardiac therapy outcomes across twelve hospitals today',authors:['Control Delta'],year:'2022'}
];
async function importRecords(page) {
  await page.goto('/screen/index.html');
  await page.waitForFunction(()=>!!window.__almScreenpro);
  await page.locator('#file-import').setInputFiles({
    name:'__control_duplicates.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(records))
  });
  await expect(page.locator('#duplicate-warning')).toBeVisible();
  await expect(page.locator('#duplicate-warning')).toContainText('2 suspected duplicate pairs found (1 exact). Nothing has been removed.');
  await page.locator('#duplicate-warning a').click();
  await expect(page.locator('.duplicate-pair')).toHaveCount(2);
}
const state=page=>page.evaluate(()=>window.__almScreenpro.state());
const flow=page=>page.evaluate(()=>window.__almScreenpro.flow());
const pair=(page,reason)=>page.locator('.duplicate-pair[data-reason="'+reason+'"]');

test('import warns, shows both records/reasons, and Keep/Remove/Undo persist on reload',async({page})=>{
  await importRecords(page);
  expect((await state(page)).records.filter(r=>r.dup)).toHaveLength(0);
  expect((await flow(page)).pendingScreen).toBe(4);
  const exact=pair(page,'exact-doi'),similar=pair(page,'similar-title');
  await expect(exact.locator('article')).toHaveCount(2);
  await expect(exact).toContainText('Same DOI 10.1/control');
  for(const text of ['Control Alpha','Control Beta','2019','2020','__control_journal_a','__control_journal_b','__control_duplicates.json']){
    await expect(exact).toContainText(text);
  }
  await expect(similar.locator('article')).toHaveCount(2);
  await expect(similar).toContainText(/Titles \d+% similar \(trigram Jaccard/);
  // Keyboard native activation must not trigger the global screening shortcuts.
  await exact.getByRole('button',{name:/Keep both:/}).focus();
  await page.keyboard.press('Enter');
  expect((await flow(page)).unresolvedDuplicatePairs).toBe(1);
  await similar.getByRole('button',{name:'Remove '+records[3].title+' [__control_fuzzy_b]',exact:true}).click();
  expect((await flow(page)).duplicates).toBe(1);
  expect((await flow(page)).pendingScreen).toBe(3);
  expect((await flow(page)).unresolvedDuplicatePairs).toBe(0);
  await expect(page.locator('#stats')).toContainText('Duplicates removed');
  await expect(page.locator('#duplicate-warning')).toBeHidden();
  await page.reload();
  expect((await flow(page)).duplicates).toBe(1);
  expect((await flow(page)).unresolvedDuplicatePairs).toBe(0);
  await page.locator('#duplicate-review-heading').click();
  await page.getByRole('button',{name:'Undo remove decision for '+records[3].title,exact:true}).click();
  expect((await flow(page)).duplicates).toBe(0);
  expect((await flow(page)).pendingScreen).toBe(4);
  expect((await flow(page)).unresolvedDuplicatePairs).toBe(1);
  await page.getByRole('button',{name:/Undo keep decision/}).click();
  expect((await flow(page)).unresolvedDuplicatePairs).toBe(2);
  expect((await state(page)).audit.filter(e=>e.action==='duplicate-undo')).toHaveLength(2);
});

test('bulk asks with the exact count/reasons; cancel is inert; confirm excludes only exact and Undo restores',async({page})=>{
  await importRecords(page);
  const bulk=page.getByRole('button',{name:'Remove all exact matches (1)',exact:true});
  page.once('dialog',async dialog=>{
    expect(dialog.message()).toContain('Remove 1 exact matches (1 records)');
    expect(dialog.message()).toContain('Same DOI 10.1/control');
    await dialog.dismiss();
  });
  await bulk.click();
  expect((await flow(page)).duplicates).toBe(0);
  page.once('dialog',dialog=>dialog.accept());
  await bulk.click();
  let s=await state(page);
  expect(s.records.filter(r=>r.dup).map(r=>r.id)).toEqual(['__control_doi_b']);
  expect(s.duplicateDecisions).toHaveLength(1);
  expect(s.duplicateDecisions[0].reason).toBe('exact-doi');
  expect(s.duplicateDecisions[0].bulk).toBe(true);
  expect((await flow(page)).unresolvedDuplicatePairs).toBe(1);
  await expect(pair(page,'similar-title').getByRole('button',{name:/Keep both:/})).toBeEnabled();
  await page.reload();
  await expect(page.locator('#duplicate-warning')).toBeVisible();
  expect((await flow(page)).duplicates).toBe(1);
  await page.locator('#duplicate-warning a').click();
  await page.getByRole('button',{name:'Undo remove decision for '+records[1].title,exact:true}).click();
  expect((await flow(page)).duplicates).toBe(0);
  expect((await flow(page)).pendingScreen).toBe(4);
  await expect(page.getByRole('button',{name:'Remove all exact matches (1)',exact:true})).toBeEnabled();
});

test('swap changes the labelled removal target and preserves screening history',async({page})=>{
  await importRecords(page);
  await page.evaluate(()=>{
    const r=window.__almScreenpro.recordById('__control_doi_a');
    r.r1={d:'include',reason:'own decision',at:'2026-01-01T00:00:00.000Z'};
  });
  const exact=pair(page,'exact-doi');
  await exact.getByRole('button',{name:/Swap records/}).click();
  await exact.getByRole('button',{name:'Remove '+records[0].title+' [__control_doi_a]',exact:true}).click();
  expect((await state(page)).records.find(r=>r.id==='__control_doi_a').dup).toBe(true);
  await page.getByRole('button',{name:'Undo remove decision for '+records[0].title,exact:true}).click();
  const restored=(await state(page)).records.find(r=>r.id==='__control_doi_a');
  expect(restored.dup).toBe(false);
  expect(restored.r1).toEqual({d:'include',reason:'own decision',at:'2026-01-01T00:00:00.000Z'});
  expect(restored.duplicateHistory).toHaveLength(1);
});
