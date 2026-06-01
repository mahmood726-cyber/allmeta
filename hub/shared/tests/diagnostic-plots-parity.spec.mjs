/**
 * R-parity for the three diagnostic-plot coordinate engines (shared/diagnostic-plots.js)
 * vs metafor on the BCG vaccine dataset (dat.bcg, 13 trials, measure=OR):
 *   baujat(yi,vi)  vs metafor::baujat(rma(...,method="DL"))  — x=(yi−μ̂)²/(vi+τ²), y=LOO influence
 *   radial(yi,vi)  vs metafor::radial — x=1/se, z=yi/se, through-origin slope = FE estimate
 *   labbe(rows)    vs metafor::labbe — per-study (control, treatment) event rates + pooled curve
 * Engines are wired into the influence app (Baujat + Radial) and mh-peto (L'Abbé); this
 * spec checks the math via the module loaded on the influence page, plus the UI accessors.
 */
import { test, expect } from '@playwright/test';
const INFLUENCE = 'http://localhost:8088/influence/index.html';
const MHPETO = 'http://localhost:8088/mh-peto/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

const tpos = [4, 6, 3, 62, 33, 180, 8, 505, 29, 17, 186, 5, 27], tneg = [119, 300, 228, 13536, 5036, 1361, 2537, 87886, 7470, 1699, 50448, 2493, 16886];
const cpos = [11, 29, 11, 248, 47, 372, 10, 499, 45, 65, 141, 3, 29], cneg = [128, 274, 209, 12619, 5761, 1079, 619, 87892, 7232, 1600, 27197, 2338, 17825];
const YI = [], VI = [];
for (let i = 0; i < tpos.length; i++) { YI.push(Math.log((tpos[i] * cneg[i]) / (tneg[i] * cpos[i]))); VI.push(1 / tpos[i] + 1 / tneg[i] + 1 / cpos[i] + 1 / cneg[i]); }

const BAUJAT_X = [0.05058462, 1.46949699, 0.51040009, 1.30025459, 0.66711119, 0.11802567, 1.32412844, 1.55719578, 0.17948785, 0.96765831, 0.43623830, 1.58322234, 1.21689459];
const BAUJAT_Y = [0.00256710, 0.10494940, 0.02474235, 0.24149154, 0.06525413, 0.00981819, 0.09074099, 0.20088672, 0.01843210, 0.09489918, 0.04763650, 0.06797017, 0.11210637];
const RADIAL_X = [1.67336200, 2.19194756, 1.51896929, 7.01613378, 4.38732488, 10.04770647, 2.09883267, 15.79764635, 4.18937984, 3.64126063, 8.93529330, 1.36824363, 3.73625932];
const RADIAL_Z = [-1.57077510, -3.65220271, -2.10573856, -10.21860279, -0.96144314, -9.62692903, -3.42902211, 0.18989721, -1.97632333, -5.10217132, -3.04559156, 0.61110506, -0.06479374];
const LABBE_PC = [0.07913669, 0.09570957, 0.05000000, 0.01927411, 0.00809229, 0.25637491, 0.01589825, 0.00564537, 0.00618387, 0.03903904, 0.00515766, 0.00128150, 0.00162429];
const LABBE_PT = [0.03252033, 0.01960784, 0.01298701, 0.00455949, 0.00651016, 0.11680727, 0.00314342, 0.00571325, 0.00386718, 0.00990676, 0.00367342, 0.00200160, 0.00159641];
const FE_LOGOR = -0.4361390761;

test('baujat + radial coordinates match metafor (dat.bcg)', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(INFLUENCE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AlmDiagPlots, { timeout: 10000 });
  const out = await page.evaluate(({ yi, vi }) => ({ bj: window.AlmDiagPlots.baujat(yi, vi), rad: window.AlmDiagPlots.radial(yi, vi) }), { yi: YI, vi: VI });
  for (let i = 0; i < BAUJAT_X.length; i++) {
    expect(out.bj.x[i], `baujat x[${i}]`).toBeCloseTo(BAUJAT_X[i], 6);
    expect(out.bj.y[i], `baujat y[${i}]`).toBeCloseTo(BAUJAT_Y[i], 6);
    expect(out.rad.x[i], `radial x[${i}]`).toBeCloseTo(RADIAL_X[i], 6);
    expect(out.rad.z[i], `radial z[${i}]`).toBeCloseTo(RADIAL_Z[i], 6);
  }
  expect(out.rad.slope, 'radial slope = FE estimate').toBeCloseTo(FE_LOGOR, 8);
  expect(errs, 'no console errors').toEqual([]);
});

test('labbe coordinates + pooled effect match metafor (dat.bcg, OR)', async ({ page }) => {
  await page.goto(INFLUENCE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AlmDiagPlots, { timeout: 10000 });
  const lb = await page.evaluate(({ tpos, tneg, cpos, cneg }) => {
    const rows = tpos.map((_, i) => ({ ai: tpos[i], bi: tneg[i], ci: cpos[i], di: cneg[i] }));
    return window.AlmDiagPlots.labbe(rows, { measure: 'OR', method: 'FE' });
  }, { tpos, tneg, cpos, cneg });
  for (let i = 0; i < LABBE_PC.length; i++) {
    expect(lb.points[i].pc, `labbe pc[${i}]`).toBeCloseTo(LABBE_PC[i], 6);
    expect(lb.points[i].pt, `labbe pt[${i}]`).toBeCloseTo(LABBE_PT[i], 6);
  }
  expect(lb.logEff, 'pooled FE logOR').toBeCloseTo(FE_LOGOR, 8);
});

test('influence app renders Baujat + Radial SVGs from input', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(INFLUENCE, { waitUntil: 'load' });
  await page.fill('#src', '0.42,0.20,A\n-0.18,0.35,B\n0.91,0.15,C\n0.05,0.40,D\n0.67,0.22,E');
  await page.click('#btn-run');
  await page.waitForFunction(() => window.__almBaujat && window.__almRadial, { timeout: 8000 });
  expect(await page.locator('#baujat-plot circle').count()).toBe(5);
  expect(await page.locator('#radial-plot circle').count()).toBe(5);
  expect(errs, 'no console errors').toEqual([]);
});

test('mh-peto app renders L\'Abbé plot from 2×2 input', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(MHPETO, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AlmDiagPlots, { timeout: 10000 });
  await page.click('#btn-run');
  await page.waitForFunction(() => window.__almLabbe && window.__almLabbe.points.length > 0, { timeout: 8000 });
  expect(await page.locator('#labbe circle').count()).toBeGreaterThan(0);
  expect(await page.locator('#labbe path').count()).toBeGreaterThan(0);
  expect(errs, 'no console errors').toEqual([]);
});
