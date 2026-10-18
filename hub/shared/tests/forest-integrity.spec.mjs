import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const homogeneous = 'A,0.20,0.20\nB,0.21,0.20\nC,0.19,0.20';
async function open(page) {
  await page.goto('/forest-plot/index.html');
  await page.waitForFunction(() => typeof window._almLastRE === 'function' && typeof window.__almResults === 'function');
}
async function input(page, text) { await page.locator('#f-data').fill(text); }
async function result(page) { return page.evaluate(() => window.__almResults()); }
async function exportedR(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-report').click()]);
  const html = readFileSync(await download.path(), 'utf8');
  return page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return [...doc.querySelectorAll('pre')].map(x => x.textContent).join('\n');
  }, html);
}

test('Forest model metadata distinguishes floored HK from raw knha', async ({ page }) => {
  await open(page); await input(page, homogeneous);
  const r = await page.evaluate(() => window._almForestState());
  expect(r.opts.test).toBe('adhoc');
  expect(r.re.qStar).toBeLessThan(1);
  expect(r.re.se).toBeCloseTo(Math.sqrt(0.04 / 3), 12);
  expect(r.re.lo).toBeCloseTo(0.2 - 4.30265272974946 * Math.sqrt(0.04/3), 10);
  await expect(page.locator('#forest-method-note')).toContainText('variance floor 1');
});

test('model I2 and Q I2 remain distinct and explicitly exported', async ({ page }) => {
  await open(page); await input(page, 'A,-0.5,0.10\nB,0.1,0.4\nC,1.2,0.2');
  const out = await result(page);
  const rows = [-0.5,0.1,1.2], v = [0.01,0.16,0.04];
  const w=v.map(x=>1/x), sw=w.reduce((a,b)=>a+b), sw2=w.reduce((a,b)=>a+b*b,0);
  const vt=2/(sw-sw2/sw);
  expect(out.I2).toBeCloseTo(100*out.tau2/(out.tau2+vt), 9);
  expect(out.I2_Q).toBeCloseTo(Math.max(0,100*(out.Q-2)/out.Q), 9);
  expect(Math.abs(out.I2 - out.I2_Q)).toBeGreaterThan(0.01);
  expect(out.I2_definition).toContain('v_typical');
  expect(out.studies.map(x=>x.est)).toEqual(rows);
});

test('auto-domain contains the entire two-study prediction interval', async ({ page }) => {
  await open(page); await input(page, 'A,-0.5,0.1\nB,0.5,0.1');
  const line=page.locator('#svg-host svg line[stroke-dasharray="4 3"]').first();
  expect(Number(await line.getAttribute('x1'))).toBeGreaterThanOrEqual(240);
  expect(Number(await line.getAttribute('x2'))).toBeLessThanOrEqual(600);
});

test('x-axis is below rather than through the prediction-interval row', async ({ page }) => {
  await open(page); await input(page, 'A,-0.5,0.1\nB,0.5,0.1');
  const plot = await page.evaluate(() => {
    const svg=document.querySelector('#svg-host svg');
    const pi=svg.querySelector('line[stroke-dasharray="4 3"]');
    const axis=[...svg.querySelectorAll('line')].find(x=>x.getAttribute('x1')==='240' && x.getAttribute('x2')==='600' && x.getAttribute('stroke')==='#15181d');
    return {pi:Number(pi.getAttribute('y1')),axis:Number(axis.getAttribute('y1'))};
  });
  expect(plot.axis).toBeGreaterThan(plot.pi+4);
});

test('one-sided axis limit does not coerce the automatic endpoint to zero', async ({ page }) => {
  await open(page); await input(page, 'A,-0.9,0.1\nB,-1.1,0.1\nC,-1.0,0.1');
  const max=page.locator('#alm-axis-mount input[data-edge="max"]');
  await max.fill('2'); await max.dispatchEvent('change');
  const lines=await page.locator('#svg-host svg line[stroke="#15181d"]').evaluateAll(xs => xs.filter(x=>x.getAttribute('y1')===x.getAttribute('y2')).map(x=>Number(x.getAttribute('x1'))));
  expect(lines.every(x=>x>=240)).toBe(true);
  await expect(page.locator('#alm-axis-mount input[data-edge="log"]')).toBeDisabled();
});

for (const [name, bad] of [
  ['trailing numeric junk','A,0.2garbage,0.1\nB,0.3,0.1'],
  ['missing first effect','A,,0.1\nB,0.3,0.1'],
  ['zero standard error','A,0.2,0\nB,0.3,0.1'],
  ['underflowing variance','A,0.2,1e-200\nB,0.3,0.1'],
  ['unrecognised first row','A,not a number,0.1\nB,0.3,0.1']
]) test('invalid input blocks the full fit: '+name, async ({ page }) => {
  await open(page); await input(page, homogeneous); await input(page, bad);
  expect((await result(page)).k).toBe(0);
  expect(await page.evaluate(()=>window._almLastRE())).toBeNull();
  expect(await page.evaluate(()=>window._almForestState())).toBeNull();
  await expect(page.locator('#warn-banner')).toContainText('Analysis blocked');
  expect(await page.locator('#svg-host polygon').count()).toBe(0);
});

test('recognised headers after comments are not mistaken for broken study rows', async ({ page }) => {
  await open(page);
  await input(page, '# source\n# comparator\n\n# notes\nlabel,estimate,se\n'+homogeneous);
  expect((await result(page)).k).toBe(3);
});

test('invalid data never overwrite the previous shared study bus', async ({ page }) => {
  await open(page);
  await page.evaluate(()=>localStorage.setItem('ma-studies-v1', 'sentinel-do-not-replace'));
  await input(page, 'A,broken,0.1\nB,0.2,0.1');
  await page.locator('#btn-bus-save').click();
  expect(await page.evaluate(()=>localStorage.getItem('ma-studies-v1'))).toBe('sentinel-do-not-replace');
});

test('report exports the actual floor model and does not round tiny variances to zero', async ({ page }) => {
  await open(page);
  await input(page, 'A,0.1,0.000001\nB,0.100001,0.000001\nC,0.099999,0.000001');
  const script=await exportedR(page);
  expect(script).toContain("test='adhoc'");
  expect(script).toContain('1e-12');
  expect(script).not.toContain('vi = c(0.0000000000');
});

test('JSON download retains model configuration, full precision and both heterogeneity definitions', async ({ page }) => {
  await open(page); await input(page, homogeneous);
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#alm-export-mount [data-action="json"]').click()]);
  const out=JSON.parse(readFileSync(await dl.path(),'utf8'));
  expect(out.re_test).toBe('adhoc'); expect(out.k).toBe(3);
  expect(out.studies[0].se).toBe(0.2);
  expect(out.re_se_hksj).toBeCloseTo(Math.sqrt(0.04/3),12);
  expect(typeof out.I2_Q).toBe('number');
});

test('fresh pinned R agrees on affected estimates, intervals, heterogeneity and prediction intervals', async ({ page }) => {
  test.setTimeout(240000);
  await open(page);
  const cases=[
    {name:'homogeneous-floor',text:homogeneous},
    {name:'two-study-PI',text:'A,-0.5,0.1\nB,0.5,0.1'},
    {name:'unequal-variance-I2',text:'A,-0.5,0.10\nB,0.1,0.4\nC,1.2,0.2'},
    {name:'equal-effects',text:'A,0.2,0.1\nB,0.2,0.2\nC,0.2,0.4'},
    {name:'eight-study',text:'A,0.10,0.20\nB,0.30,0.25\nC,0.50,0.18\nD,0.20,0.30\nE,0.90,0.22\nF,0.40,0.28\nG,1.10,0.35\nH,0.05,0.15'}
  ];
  const records=[];
  for (const c of cases) {
    await input(page,c.text);
    const compared=await page.evaluate(async () => {
      const s=window._almForestState();
      const r=await window.AlmWebR.runMetafor({studies:s.studies,method:s.opts.method,test:s.opts.test});
      const script='suppressPackageStartupMessages(library(metafor))\nf<-rma(yi=c('+s.studies.map(x=>x.est).join(',')+'),vi=c('+s.studies.map(x=>x.se*x.se).join(',')+'),method="PM",test="adhoc",control=list(tol=1e-15,maxiter=10000))\np<-predict(f)\ncat(sprintf("PIJSON:[%.17g,%.17g]\\n",p$pi.lb,p$pi.ub))';
      const pi=await window.AlmWebR.runR({packages:['metafor'],script:script});
      return {js:s.re,r:r,pi:pi};
    });
    expect(compared.r.ok,JSON.stringify(compared.r)).toBe(true);
    expect(compared.pi.ok,JSON.stringify(compared.pi)).toBe(true);
    expect(compared.r.versions.metafor).toBe('4.8-0');
    expect(compared.r.versions.webR).toBe('0.5.5');
    for (const [js,rs] of [['mu','mu'],['se','se'],['lo','ci_lb'],['hi','ci_ub'],['tau2','tau2'],['Q','QE'],['I2','I2']]) {
      const d=Math.abs(compared.js[js]-compared.r.result[rs]);
      expect(d, c.name+' '+js).toBeLessThan(1e-8*Math.max(1,Math.abs(compared.r.result[rs])));
    }
    const pi=JSON.parse(compared.pi.stdout.split('\n').find(x=>x.startsWith('PIJSON:')).slice(7));
    expect(compared.js.piLo).toBeCloseTo(pi[0],7); expect(compared.js.piHi).toBeCloseTo(pi[1],7);
    records.push({name:c.name,versions:compared.r.versions,js:compared.js,r:compared.r.result,referencePI:pi});
  }
  console.log('FOREST_FRESH_R_EVIDENCE '+JSON.stringify(records));
});
