import {test, expect} from '@playwright/test';
const records = [
  {id:'fixture-a', title:'Synthetic cardiac eligibility record', abstract:'A test abstract.', r1:{d:'include'},r2:{d:'exclude',reason:'PRIVATE REASON'}},
  {id:'fixture-b', title:'Synthetic pulmonary eligibility record', abstract:'Another test abstract.', r1:{d:''},r2:{d:'include'}}
];
test('blind review hides peer badges, conflict panels, counts and peer ranking labels', async ({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(records=>window.__almScreenpro.setState({mode:'dual',blind:true,active:'r1',records}),records);
  await expect(page.locator('#card-host')).not.toContainText('R2:');
  await expect(page.locator('#conflict-panel')).toBeHidden();
  await expect(page.locator('#kappa')).not.toContainText('agreement');
  await expect(page.locator('#stats')).not.toContainText('Conflicts');
  await page.locator('#f-filter').selectOption('undecided');
  await expect(page.locator('.ctitle')).toContainText('pulmonary');
});
test('full-text review, reason, undo, audit and project backup survive reload', async ({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>window.__almScreenpro.setState({mode:'single',records:[{id:'fixture',title:'Synthetic eligibility record',r1:{d:'include'}}]}));
  await page.locator('#f-stage').selectOption('ft');
  await page.locator('#ft-retrieval').selectOption('retrieved');
  await page.locator('#ft-note').fill('Methods, page 2: population outside protocol.');
  await page.locator('#ft-save').click();
  await page.getByRole('button',{name:'Exclude e',exact:true}).click();
  await expect(page.locator('#workflow-status')).toContainText('reason');
  await page.locator('[data-reason="0"]').click();
  await expect(page.locator('#workflow-summary')).toContainText('Full text');
  await page.reload();
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('screen-v1')));
  expect(data.records[0].r1.d).toBe('include');
  expect(data.records[0].fullText.r1.d).toBe('exclude');
  expect(data.audit.some(e=>e.action==='decision'&&e.stage==='ft')).toBe(true);
});
test('PRISMA refuses unfinished work without overwriting an existing diagram', async ({page})=>{
  await page.goto('/screen/index.html');
  await page.evaluate(()=>{window.__almScreenpro.setState({records:[{id:'fixture',title:'Synthetic unfinished record'}]});localStorage.setItem('prisma-flow-v1','{"title":"Existing diagram"}');});
  await page.locator('#btn-prisma').click();
  await expect(page.locator('#workflow-status')).toContainText('Finish');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('prisma-flow-v1')).title)).toBe('Existing diagram');
});
