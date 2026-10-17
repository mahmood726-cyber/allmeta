/**
 * R-parity for the Vevea-Hedges step-function selection model (shared/selmodel.js) vs
 * metafor::selmodel(rma(method="ML"), type="stepfun", steps=0.025). Ground truth:
 *   yi=c(.10,.30,.35,.65,.45,.80,.55,1.05,.70,1.20,.90,1.40)
 *   sei=c(.30,.28,.20,.35,.18,.40,.15,.45,.12,.50,.10,.55)
 *   → μ=0.59722923 se=0.11093960 τ²=0.02598154 δ₂=0.599915 LRT χ²=0.326738 p=0.567586
 * Engine verified to ~1e-6 in Node; browser asserted ≤1e-4. Also wired into pubbias-tests.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/pubbias-tests/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const YI = [0.10,0.30,0.35,0.65,0.45,0.80,0.55,1.05,0.70,1.20,0.90,1.40];
const SEI = [0.30,0.28,0.20,0.35,0.18,0.40,0.15,0.45,0.12,0.50,0.10,0.55];
const VI = SEI.map(s => s * s);

test('selection model matches metafor::selmodel(stepfun, steps=0.025)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  const r = await page.evaluate(({ yi, vi }) => window.AlmSelModel.fit(yi, vi, { steps: [0.025], method: 'REML' }), { yi: YI, vi: VI });
  expect(r.mu).toBeCloseTo(0.59722923, 4);
  expect(r.se).toBeCloseTo(0.11093960, 3);
  expect(r.tau2).toBeCloseTo(0.02598154, 4);
  expect(r.delta[1]).toBeCloseTo(0.599915, 4);
  expect(r.LRT).toBeCloseTo(0.326738, 3);
  expect(r.LRTp).toBeCloseTo(0.567586, 3);
  expect(errs, 'no console errors').toEqual([]);
});

test('pubbias-tests wires the selection model into its results', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window._almLastPubbias === 'function' && window._almLastPubbias(), { timeout: 10000 });
  const o = await page.evaluate(() => window._almLastPubbias());
  expect(o.sel_mu, 'selection-model μ present').not.toBeNull();
  expect(o.sel_delta2).toBeGreaterThan(0);
  expect(o.sel_LRTp).toBeGreaterThanOrEqual(0);
});

// Legacy callers must retain every bit of the base result, including NaNs.
// Keep this corpus regression alongside the independent R accuracy test above.
test('selmodel legacy matches pinned bytes and fixture across the complete plus corpus', async () => {
  test.setTimeout(180000);
  const {readFileSync}=await import('node:fs'),{createHash}=await import('node:crypto'),vm=await import('node:vm');
  const root=new globalThis.URL('../../../',import.meta.url);
  const read=p=>readFileSync(new globalThis.URL(p,root),'utf8').replace(/\r\n/g,'\n');
  const legacySHA='a220342e16b8b23f6eb75f41b3262470044a8283ab3cc77cf731e8077b91e343';
  expect(createHash('sha256').update(read('shared/selmodel.js')).digest('hex')).toBe(legacySHA);
  const fixture=JSON.parse(read('hub/shared/tests/fixtures/selmodel-legacy-plus.json'),(_,x)=>x&&typeof x==='object'&&'$number' in x?Number(x.$number):x);
  expect(fixture.sha256).toBe(legacySHA);
  function env(plus=false){const ctx=vm.createContext({});ctx.window=ctx;
    for(const p of ['shared/ma-core.js','shared/selmodel.js'])vm.runInContext(read(p),ctx);
    if(plus)for(const p of ['shared/trimfill.js','limit-ma/plus-opt.js','limit-ma/plus-selmodel.js','limit-ma/plus.js'])vm.runInContext(read(p),ctx);
    return ctx;
  }
  const b=env(),withPlus=env(true),corpus=JSON.parse(read('limit-ma/validate/plus/corpus.json'));
  expect(fixture.outputs.map(x=>x.id)).toEqual(corpus.map(x=>x.id));
  let leaves=0;
  function identical(x,y,path){if(x&&typeof x==='object'){
    expect(Object.keys(y),path).toEqual(Object.keys(x));for(const key of Object.keys(x))identical(x[key],y[key],path+'.'+key);
  }else{leaves++;expect(Object.is(x,y),path).toBe(true);}}
  for(const [i,c] of corpus.entries()){const vi=c.se.map(s=>s*s),opts={steps:[.025],method:'REML'},ref=fixture.outputs[i].result;
    identical(ref,b.AlmSelModel.fit(c.te,vi,opts),c.id);identical(ref,withPlus.AlmSelModel.fit(c.te,vi,opts),c.id+' with plus loaded');
  }
  console.log('SELMODEL EXACT',corpus.length,'configurations; two contexts;',leaves,'scalar comparisons');
});
