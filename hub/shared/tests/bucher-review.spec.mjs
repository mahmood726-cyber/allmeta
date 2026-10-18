import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const reference = JSON.parse(readFileSync(new URL('../../../bucher/tests/fixtures/bucher-reference.json', import.meta.url), 'utf8'));
const seed = {
  _schema: 'ma-comparisons-v1', effectMeasure: 'OR', studies: [
    {id:'synthetic1',arms:[{treatment:'C',events:20,n:100},{treatment:'A',events:40,n:100}]},
    {id:'synthetic2',arms:[{treatment:'C',events:20,n:100},{treatment:'B',events:30,n:100}]},
  ],
};
async function open(page) {
  await page.goto(new URL('/bucher/', test.info().project.use.baseURL).href);
  await page.waitForFunction(() => !!window._almLastBucher && !!window.MaComparisons);
}
async function last(page) { return page.evaluate(() => window._almLastBucher()); }
async function paste(page, csv) {
  await page.locator('#alm-csv-mount textarea').fill(csv);
  await page.locator('#alm-csv-mount [data-action="parse-paste"]').click();
}
async function refused(page) {
  expect(await last(page)).toBeNull();
  await expect(page.locator('#plot')).toBeEmpty();
}
for (const c of reference.cases) {
  test('Bucher actual CSV workflow matches fresh pinned R: ' + c.name, async ({page}) => {
    await open(page);
    await page.locator('#scale').selectOption('raw');
    for (const key of ['A','B','C']) await page.locator('#treat'+key).fill(c.options[key]);
    const headers = ['study','treat1','treat2','TE','seTE'];
    const csv = headers.join(',')+'\n'+c.rows.map(r=>headers.map(h=>r[h]).join(',')).join('\n');
    await paste(page,csv);
    const r=await last(page);
    for (const [actual,expected] of [['d_indirect_AB','mu'],['se_indirect_AB','se'],['lo_AB','lo'],['hi_AB','hi']])
      expect(r[actual]).toBeCloseTo(c.expected[expected],10);
    expect(Math.abs(r.p_AB-c.expected.p)).toBeLessThan(2e-7);
    if(c.name==='tail') expect(r.p_AB).toBeGreaterThan(0);
    await expect(page.locator('#body')).toContainText(c.options.A+' vs '+c.options.B);
  });
}
for (const suffix of [',extra', ',"unfinished', '"junk', ',"extra"']) {
  test('Bucher CSV refuses damaged record: '+suffix, async ({page}) => {
    await open(page);
    await paste(page,'treat1,treat2,TE,seTE\nA,C,.2,.1\nB,C,-.1,.2'+suffix);
    await refused(page);
    await page.locator('#scale').selectOption('raw');
    await refused(page);
    await page.locator('#btn-run').click();
    expect(await last(page)).not.toBeNull();
  });
}
for (const token of ['0x10','true','1e','2junk']) {
  test('Bucher CSV refuses nondecimal token: '+token, async ({page}) => {
    await open(page);
    await paste(page,'treat1,treat2,TE,seTE\nA,C,'+token+',.1\nB,C,-.1,.2');
    await refused(page);
  });
}
test('Bucher malformed native number is refused and can be corrected', async ({page})=>{
  await open(page);
  await page.locator('#dAC').fill('');
  await page.locator('#dAC').pressSequentially('1e');
  expect(await page.locator('#dAC').evaluate(el=>el.validity.badInput)).toBe(true);
  await page.locator('#btn-run').click();
  await refused(page);
  await page.locator('#dAC').fill('0.3');
  await page.locator('#btn-run').click();
  expect((await last(page)).dAC).toBe(.3);
});
for (const values of [
  {dAC:'700',dBC:'700',seAC:'10',seBC:'10'},
  {dAC:'-800',dBC:'-800',seAC:'1',seBC:'1'},
  {dAC:'1e308',dBC:'0',seAC:'1e308',seBC:'1'},
]) {
  test('Bucher refuses unrepresentable direct or indirect interval '+values.dAC,async({page})=>{
    await open(page);
    for(const [id,value] of Object.entries(values)) await page.locator('#'+id).fill(value);
    await page.locator('#btn-run').click();
    await refused(page);
  });
}
test('Bucher valid network preserves direction and sets ratio scale before analysis',async({page})=>{
  await open(page);
  await page.locator('#scale').selectOption('raw');
  await page.evaluate(s=>window.MaComparisons.write(s),seed);
  await page.locator('#btn-bus-load').click();
  const r=await last(page);
  expect(r.d_indirect_AB).toBeCloseTo(Math.log(14/9),10);
  expect(r.scale).toBe('log');
  expect(r.missing_study_ids).toBe(false);
  await expect(page.locator('#import-status')).toContainText('0.5');
});
for (const kind of ['empty','unsupported','invalid count','missing study','multi-arm','duplicate ID']) {
  test('Bucher rejects entire network and removes prior output: '+kind,async({page})=>{
    await open(page);
    expect(await last(page)).not.toBeNull();
    const s=structuredClone(seed);
    if(kind==='empty') s.studies=[];
    if(kind==='unsupported') s.effectMeasure='MD';
    if(kind==='invalid count') s.studies.push({id:'bad',arms:[{treatment:'A',events:101,n:100},{treatment:'C',events:20,n:100}]});
    if(kind==='missing study') s.studies.push(null);
    if(kind==='multi-arm') s.studies[0].arms.push({treatment:'B',events:30,n:100});
    if(kind==='duplicate ID') s.studies[1].id=s.studies[0].id;
    // Raw stored envelope exercises the reader's boundary, without the writer's normalization.
    await page.evaluate(s=>localStorage.setItem('ma-comparisons-v1',JSON.stringify(s)),s);
    await page.locator('#btn-bus-load').click();
    await refused(page);
    await page.locator('#scale').selectOption('raw');
    await refused(page);
    await expect(page.locator('#import-status')).toContainText('Import rejected');
  });
}
test('Bucher file upload preserves quoted labels and complete record structure',async({page})=>{
  await open(page);
  await page.locator('#treatA').fill('Drug, "A"');
  const csv='study,treat1,treat2,TE,seTE\r\ns1,"Drug, ""A""",C,.2,.1\r\ns2,B,C,-.1,.2\r\n';
  await page.locator('#alm-csv-mount input[type=file]').setInputFiles({
    name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(csv),
  });
  await expect(page.locator('#body')).toContainText('Drug, "A" vs B');
  expect((await last(page)).d_indirect_AB).toBeCloseTo(.3,12);
});

test('Bucher legacy saved link cannot silently relabel unidentified estimates',async({page})=>{
  const snap={v:1,dAC:-.290950,seAC:.073994,dBC:-.491529,seBC:.091111,scale:'raw'};
  const url=new URL('/bucher/',test.info().project.use.baseURL);
  url.hash=Buffer.from(JSON.stringify(snap)).toString('base64');
  await page.goto(url.href);
  await page.waitForFunction(()=>!!window._almLastBucher);
  await refused(page);
  await expect(page.locator('#import-status')).toContainText('saved inputs lack treatment names');
  await page.locator('#btn-run').click();
  await refused(page);
  // These old numbers described AB and AC, so the supplied direction below is C-B via A.
  await page.locator('#treatA').fill('C');
  await page.locator('#treatB').fill('B');
  await page.locator('#treatC').fill('A');
  await page.locator('#dAC').fill('0.491529');
  await page.locator('#seAC').fill('0.091111');
  await page.locator('#dBC').fill('0.290950');
  await page.locator('#seBC').fill('0.073994');
  await page.locator('#btn-run').click();
  await expect(page.locator('#body')).toContainText('C vs B (indirect, Bucher)');
  expect((await last(page)).d_indirect_AB).toBeCloseTo(.200579,9);
});

test('Bucher named saved link preserves its estimand across reload',async({page})=>{
  await open(page);
  await page.locator('#treatA').fill('Drug A');
  await paste(page,'study,treat1,treat2,TE,seTE\ns1,Drug A,C,.2,.1\ns2,B,C,-.1,.2');
  const before=await last(page);
  await page.reload();
  await page.waitForFunction(()=>!!window._almLastBucher);
  const restored=await last(page);
  expect(restored.A).toBe('Drug A');
  expect(restored.d_indirect_AB).toBeCloseTo(before.d_indirect_AB,12);
  expect(restored.missing_study_ids).toBe(true);
  expect(restored.n_studies).toBeNull();
});

test('Bucher failed network mapping preserves previous raw inputs and scale',async({page})=>{
  await open(page);
  await page.locator('#scale').selectOption('raw');
  await page.locator('#treatC').fill('different control');
  await page.locator('#btn-run').click();
  const before=await page.locator('#dAC').inputValue();
  await page.evaluate(s=>window.MaComparisons.write(s),seed);
  await page.locator('#btn-bus-load').click();
  await refused(page);
  await expect(page.locator('#scale')).toHaveValue('raw');
  await expect(page.locator('#dAC')).toHaveValue(before);
});

test('Bucher failed ratio representation rolls back imported fields',async({page})=>{
  await open(page);
  const before=await page.locator('#dAC').inputValue();
  await paste(page,'study,treat1,treat2,TE,seTE\ns1,A,C,700,10\ns2,B,C,700,10');
  await refused(page);
  await expect(page.locator('#import-status')).toContainText('Import rejected');
  await expect(page.locator('#dAC')).toHaveValue(before);
});
