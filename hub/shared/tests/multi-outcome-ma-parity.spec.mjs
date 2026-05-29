/**
 * R-parity for the bivariate (multi-outcome) random-effects MA engine vs
 * metafor::rma.mv(yi ~ out - 1, V, random = ~ out | study, struct="UN",
 * method="REML"), with the within-study correlation ρ_within baked into the
 * block-diagonal V. Two cases:
 *
 *  1. The built-in example (8 studies, two missing one outcome) — between-study
 *     τ→0, so the test asserts the pooled means and SEs (which drive inference):
 *     metafor μ=[-0.27367058,-0.37536381], se=[0.04523136,0.05280141].
 *  2. An interior-ρ_between heterogeneous case where Σ_RE is well identified —
 *     asserts μ, se, τ AND ρ_between all match metafor:
 *     μ=[0.30375631,0.38962708], se=[0.15542561,0.10901039],
 *     τ=[0.41719197,0.26834579], ρ_between=-0.65445236.
 *
 * (Near the ρ_between=±1 boundary the grid under-estimates τ by a few percent —
 * a documented limitation, not covered here; point estimates stay accurate.)
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/multi-outcome-ma/index.html';

const buildV = (se, rhoW) => {
  const V = [[NaN, NaN], [NaN, NaN]];
  if (isFinite(se[0])) V[0][0] = se[0] * se[0];
  if (isFinite(se[1])) V[1][1] = se[1] * se[1];
  if (isFinite(se[0]) && isFinite(se[1])) { V[0][1] = rhoW * se[0] * se[1]; V[1][0] = V[0][1]; }
  return V;
};
const mkStudies = (y1, y2, s1, s2, rhoW) => y1.map((_, i) => ({
  label: 'T' + i, y: [y1[i], y2[i]], se: [s1[i], s2[i]], V: buildV([s1[i], s2[i]], rhoW),
}));

test('multi-outcome-ma example (τ→0): pooled μ/SE match metafor::rma.mv', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const b = await page.evaluate(() => {
    const NA = NaN;
    const raw = [['T1',-0.30,0.12,-0.40,0.15],['T2',-0.22,0.10,-0.35,0.12],['T3',-0.45,0.18,-0.55,0.20],
      ['T4',-0.18,0.09,-0.28,0.11],['T5',-0.50,0.20,NA,NA],['T6',-0.25,0.11,-0.32,0.13],
      ['T7',-0.38,0.15,-0.48,0.17],['T8',NA,NA,-0.42,0.16]];
    const bv = (se) => { const V=[[NaN,NaN],[NaN,NaN]]; if(isFinite(se[0]))V[0][0]=se[0]*se[0]; if(isFinite(se[1]))V[1][1]=se[1]*se[1]; if(isFinite(se[0])&&isFinite(se[1])){V[0][1]=0.5*se[0]*se[1];V[1][0]=V[0][1];} return V; };
    const studies = raw.map(r => ({ label:r[0], y:[r[1],r[3]], se:[r[2],r[4]], V:bv([r[2],r[4]]) }));
    const r = window.AlmMultiOutcome.fitBivariate(studies, { rhoWithin: 0.5 });
    return { mu: r.mu, se: [Math.sqrt(r.cov[0][0]), Math.sqrt(r.cov[1][1])] };
  });
  console.log('  example:', JSON.stringify(b));
  expect(b.mu[0]).toBeCloseTo(-0.27367058, 5);
  expect(b.mu[1]).toBeCloseTo(-0.37536381, 5);
  expect(b.se[0]).toBeCloseTo(0.04523136, 5);
  expect(b.se[1]).toBeCloseTo(0.05280141, 5);
});

test('multi-outcome-ma interior ρ_between: μ/SE/τ/ρ match metafor::rma.mv', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  const b = await page.evaluate((mk) => {
    const y1=[0.10,0.80,-0.20,0.55,0.40,-0.30,0.90,0.20], y2=[0.50,0.20,0.60,-0.10,0.85,0.30,0.15,0.70];
    const s1=[0.14,0.12,0.15,0.13,0.16,0.14,0.12,0.15], s2=[0.16,0.13,0.17,0.14,0.18,0.15,0.13,0.16];
    const bv=(se)=>{const V=[[NaN,NaN],[NaN,NaN]];V[0][0]=se[0]*se[0];V[1][1]=se[1]*se[1];V[0][1]=V[1][0]=0.5*se[0]*se[1];return V;};
    const studies=y1.map((_,i)=>({label:'T'+i,y:[y1[i],y2[i]],se:[s1[i],s2[i]],V:bv([s1[i],s2[i]])}));
    const r=window.AlmMultiOutcome.fitBivariate(studies,{rhoWithin:0.5});
    return {mu:r.mu, se:[Math.sqrt(r.cov[0][0]),Math.sqrt(r.cov[1][1])], tau:[Math.sqrt(r.Sigma_RE[0][0]),Math.sqrt(r.Sigma_RE[1][1])], rho:r.rho_between};
  });
  console.log('  interior:', JSON.stringify(b));
  expect(b.mu[0]).toBeCloseTo(0.30375631, 4);
  expect(b.mu[1]).toBeCloseTo(0.38962708, 4);
  expect(b.se[0]).toBeCloseTo(0.15542561, 3);
  expect(b.se[1]).toBeCloseTo(0.10901039, 3);
  expect(b.tau[0]).toBeCloseTo(0.41719197, 3);
  expect(b.tau[1]).toBeCloseTo(0.26834579, 3);
  expect(b.rho).toBeCloseTo(-0.65445236, 2);
});
