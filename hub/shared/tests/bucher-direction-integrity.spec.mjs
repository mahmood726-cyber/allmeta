/**
 * Bucher fixed-effect/normal-Wald import integrity and direction.
 * Numerical comparator: bucher-tiny.R's A-C fixed-effect pool plus its
 * B-C trial, then direct independent-link Bucher arithmetic (not a fresh R
 * execution or a Bayesian/random-effects network comparison).
 */
import { test, expect } from '@playwright/test';
const url = '/bucher/index.html';
const fixture = [
  {study:'S1',treat1:'A',treat2:'B',TE:-0.30,seTE:0.10},
  {study:'S2',treat1:'A',treat2:'C',TE:-0.50,seTE:0.12},
  {study:'S3',treat1:'B',treat2:'C',TE:-0.22,seTE:0.09},
  {study:'S4',treat1:'A',treat2:'B',TE:-0.28,seTE:0.11},
  {study:'S5',treat1:'A',treat2:'C',TE:-0.48,seTE:0.14},
];
const expected = {
  AC:-0.4915294117647059, ACse:0.09111079228383559,
  BC:-0.22, BCse:0.09, AB:-0.2715294117647059,
  ABse:0.12806707801222075, lo:-0.5225362722739401,
  hi:-0.020522551255471755, p:0.03398813391948854
};
async function open(page) {
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(() => !!window.AlmBucherCore && !!window.__almBucherLoad && !!window._almLastBucher);
}
function last(page) {return page.evaluate(() => window._almLastBucher());}
function reverse(rows) {return rows.map(r => ({...r,treat1:r.treat2,treat2:r.treat1,TE:-r.TE}));}

test('specified A/B via C agrees with independent R fixed-effect inputs and Wald formula', async ({page}) => {
  await open(page);
  expect(await page.evaluate(r => window.__almBucherLoad(r),fixture)).toBe(true);
  const x = await last(page);
  expect(x.dAC).toBeCloseTo(expected.AC,11);
  expect(x.seAC).toBeCloseTo(expected.ACse,11);
  expect(x.dBC).toBeCloseTo(expected.BC,11);
  expect(x.seBC).toBeCloseTo(expected.BCse,11);
  expect(x.d_indirect_AB).toBeCloseTo(expected.AB,11);
  expect(x.se_indirect_AB).toBeCloseTo(expected.ABse,11);
  expect(x.lo_AB).toBeCloseTo(expected.lo,11);
  expect(x.hi_AB).toBeCloseTo(expected.hi,11);
  expect(x.p_AB).toBeCloseTo(expected.p,5);
  expect(x.crit_dist).toBe('normal');
  expect(x.df_AB).toBeNull();
  expect(x.excluded_direct_AB_rows).toBe(2);
  await expect(page.locator('#body')).toContainText('A vs B (indirect, Bucher)');
  await expect(page.locator('#import-status')).toContainText('2 direct A–B');
});

test('reversing trial-arm order and shuffling rows leave effect AND sign unchanged', async ({page}) => {
  await open(page);
  const z = await page.evaluate(({a,b}) => ({
    a:window.AlmBucherCore.compute(a,{A:'A',B:'B',C:'C'}),
    b:window.AlmBucherCore.compute(b,{A:'A',B:'B',C:'C'})
  }),{a:fixture,b:reverse(fixture).reverse()});
  expect(z.b.indirect.mu).toBeCloseTo(z.a.indirect.mu,13);
  expect(z.b.indirect.se).toBeCloseTo(z.a.indirect.se,13);
  expect(z.b.excludedDirectAB).toBe(2);
});

test('swapping the target direction reverses effect but preserves SE', async ({page}) => {
  await open(page);
  const r=await page.evaluate(rows=>({
    ab:window.AlmBucherCore.compute(rows,{A:'A',B:'B',C:'C'}),
    ba:window.AlmBucherCore.compute(rows,{A:'B',B:'A',C:'C'})
  }),fixture);
  expect(r.ba.indirect.mu).toBeCloseTo(-r.ab.indirect.mu,12);
  expect(r.ba.indirect.se).toBeCloseTo(r.ab.indirect.se,12);
});

test('shared trial IDs in both links are rejected as potentially multi-arm', async ({page}) => {
  await open(page);
  await page.evaluate(r => window.__almBucherLoad(r),fixture);
  expect(await last(page)).not.toBeNull();
  const bad=[{study:'shared',treat1:'A',treat2:'C',TE:-0.2,seTE:0.1},
             {study:'shared',treat1:'B',treat2:'C',TE:-0.1,seTE:0.1}];
  expect(await page.evaluate(r=>window.__almBucherLoad(r),bad)).toBe(false);
  expect(await last(page)).toBeNull();
  await expect(page.locator('#import-status')).toContainText('multi-arm dependence');
  await expect(page.locator('#plot')).toBeEmpty();
});

test('unsupported missing B-C link is refused, rather than silently choosing first two pairs', async ({page}) => {
  await open(page);
  const rows=fixture.filter(r=>r.treat1+r.treat2 !== 'BC');
  expect(await page.evaluate(r=>window.__almBucherLoad(r),rows)).toBe(false);
  expect(await last(page)).toBeNull();
  await expect(page.locator('#import-status')).toContainText('No B vs C direct trials');
});

test('invalid, empty, or unrepresentable numerical fields reject whole import', async ({page}) => {
  await open(page);
  const pairs=[
    [{study:'s1',treat1:'A',treat2:'C',TE:'0.2junk',seTE:0.1},
     {study:'s2',treat1:'B',treat2:'C',TE:0.2,seTE:0.1}],
    [{study:'s1',treat1:'A',treat2:'C',TE:0.2,seTE:0},
     {study:'s2',treat1:'B',treat2:'C',TE:0.2,seTE:0.1}],
    [{study:'s1',treat1:'A',treat2:'C',TE:0.2,seTE:1e-200},
     {study:'s2',treat1:'B',treat2:'C',TE:0.2,seTE:0.1}],
    [{study:'s1',treat1:'A',treat2:'D',TE:0.2,seTE:0.1},
     {study:'s2',treat1:'B',treat2:'C',TE:0.2,seTE:0.1}],
  ];
  for (const bad of pairs) {
    expect(await page.evaluate(r=>window.__almBucherLoad(r),bad)).toBe(false);
    expect(await last(page)).toBeNull();
  }
});

test('CSV upload uses exact headers; rejects fuzzy and malformed fields without publishing old result', async ({page})=>{
  await open(page);
  await page.evaluate(r=>window.__almBucherLoad(r),fixture);
  const csv='treat1,treat2,TE,seTEx,study\nA,C,-0.2,0.1,s1\nB,C,-0.1,0.1,s2';
  await page.locator('#alm-csv-mount textarea').fill(csv);
  await page.locator('#alm-csv-mount [data-action="parse-paste"]').click();
  expect(await last(page)).toBeNull();
  await expect(page.locator('#import-status')).toContainText('Import rejected');
});

test('valid pasted CSV imports complete columns and correct direction', async ({page})=>{
  await open(page);
  await page.locator('#alm-csv-mount textarea').fill(
    'study,treat1,treat2,TE,seTE\nS1,C,A,0.5,0.12\nS2,C,B,0.22,0.09');
  await page.locator('#alm-csv-mount [data-action="parse-paste"]').click();
  const out=await last(page);
  expect(out.dAC).toBeCloseTo(-0.5,12);
  expect(out.dBC).toBeCloseTo(-0.22,12);
  expect(out.d_indirect_AB).toBeCloseTo(-0.28,12);
  expect(out.excluded_direct_AB_rows).toBe(0);
});

test('manual editing invalidates provenance and stale results; explicit compute restores only current values', async ({page})=>{
  await open(page);
  await page.evaluate(r=>window.__almBucherLoad(r),fixture);
  await page.locator('#dAC').fill('0.25');
  expect(await last(page)).toBeNull();
  await expect(page.locator('#body')).toContainText('Inputs changed');
  await page.locator('#btn-run').click();
  const out=await last(page);
  expect(out.dAC).toBe(0.25);
  expect(out.n_studies).toBe(2);
  expect(out.excluded_direct_AB_rows).toBe(0);
});

test('invalid direct inputs clear export cache and plot',async({page})=>{
  await open(page);
  await page.locator('#seAC').fill('-0.01');
  await page.locator('#btn-run').click();
  expect(await last(page)).toBeNull();
  await expect(page.locator('#plot')).toBeEmpty();
});

test('imported full-precision effects survive JSON export without display rounding',async({page})=>{
  await open(page);
  await page.evaluate(r=>window.__almBucherLoad(r),fixture);
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#alm-export-mount [data-action="json"]').click(),
  ]);
  const {readFileSync}=await import('node:fs');
  const obj=JSON.parse(readFileSync(await download.path(),'utf8'));
  expect(obj._schema).toBe('bucher-results-v1');
  expect(obj.d_indirect_AB).toBeCloseTo(expected.AB,11);
  expect(obj.excluded_direct_AB_rows).toBe(2);
  expect(obj.inference).toContain('normal Wald');
});
