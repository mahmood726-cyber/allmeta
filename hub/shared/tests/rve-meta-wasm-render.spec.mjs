/**
 * Rendered-browser check of the default CR2 path. CR2 with any cluster of
 * two or more rows needs R's LAPACK (DSYEVR/DGEEV) from shared/rve-eigen.js,
 * which the page compiles asynchronously with WebAssembly under its CSP
 * ('wasm-unsafe-eval'). Each test types an R-referenced fixture with
 * multi-row clusters into the page, fits it with the Fit button, and checks
 * the rendered table against R at display precision, the same fit's exported
 * values against R at the unchanged 1e-9 gate, and the console for CSP,
 * CompileError and RangeError messages.
 *
 * R references: rve-meta/tests/fixtures (R 4.6.0, robumeta 2.1, Windows x64,
 * LC_COLLATE=C). numeric-ids.json has cluster IDs 1..K in shuffled order,
 * which the page types as numeric, as R's read.csv does.
 *
 *   npx playwright test rve-meta-wasm-render            (bundled Chromium)
 *   PW_CHANNEL=msedge npx playwright test rve-meta-wasm-render --workers=1
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const PAGE = (process.env.RVE_BASE || 'http://localhost:8088') + (process.env.RVE_PAGE || '/rve-meta/index.html');
const fixture = rel => JSON.parse(fs.readFileSync(new URL(`../../../rve-meta/tests/fixtures/${rel}`, import.meta.url), 'utf8'));
// Chromium and WebKit report this for every meta CSP (in their own wording);
// it is not a wasm or script refusal.
const BENIGN = /^The Content Security Policy directive 'frame-ancestors' is ignored when delivered via (a <meta>|an HTML meta) element\.$/;

const eigen = fixture('p15-eigen/eigen.json');
const CASES = [{ name: 'character labels (p15-eigen/eigen.json)', rows: eigen.input.rows, rho: eigen.input.rho, R: eigen.R }];
for (const d of fixture('p15/numeric-ids.json').designs)
  CASES.push({ name: `numeric IDs 1..${d.clusters}, seed ${d.seed}`, rows: d.numeric.rows, rho: d.rho, R: d.numeric.R });

const csvLabel = c => typeof c === 'number' ? String(c) : '"' + String(c).replace(/"/g, '""') + '"';
const fixed = (x, d) => x.toFixed(d);
const pText = p => p < 0.001 ? '<0.001' : fixed(p, 3);

for (const c of CASES) {
  test(`rendered CR2 fit matches R: ${c.name}`, async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));
    await page.goto(PAGE, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
    await expect.poll(() => page.evaluate(() => window.AlmRVEEigen && window.AlmRVEEigen.status())).toBe('ready');

    const clusters = new Set(c.rows.map(r => r.cluster));
    expect(clusters.size, 'multi-row clusters').toBeLessThan(c.rows.length);
    const text = c.rows.map(r => [csvLabel(r.cluster), r.yi, r.vi, ...r.X.slice(1)].join(',')).join('\n');
    await page.fill('#src', text);
    await page.fill('#f-rho', String(c.rho));
    await page.fill('#f-names', 'x');
    const centre = page.locator('#f-centre');
    if (await centre.isChecked()) await centre.click();
    await page.click('#btn-run');

    await expect(page.locator('#meta-row')).toContainText(`k = ${c.rows.length} effects, m = ${clusters.size} clusters`);
    await expect(page.locator('#meta-row')).toContainText(`τ²(CORR) = ${fixed(c.R.tau2, 4)}`);
    const shown = await page.$$eval('#coef-body tr', trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent)));
    expect(shown.length).toBe(c.R.table.length);
    c.R.table.forEach((r, j) => {
      expect(shown[j], `row ${j}`).toEqual([fixed(r['b.r'], 3), fixed(r.SE, 3), fixed(r.t, 2), fixed(r.dfs, 2),
        `${fixed(r['CI.L'], 3)}, ${fixed(r['CI.U'], 3)}`, pText(r.prob)]);
    });

    // The same UI fit at full precision, from the page's own result object.
    const res = await page.evaluate(() => window.__almLastRVE());
    expect(res.model.method).toBe('CR2');
    const gate = (x, y, absolute) => Math.abs(x - y) / (absolute ? 1 : Math.max(1, Math.abs(y)));
    expect(gate(res.model.tau2, c.R.tau2, false)).toBeLessThanOrEqual(1e-9);
    const coefs = res.coefficients;
    c.R.table.forEach((r, j) => {
      for (const [a, k, absolute] of [['estimate', 'b.r'], ['se', 'SE'], ['t', 't'], ['df', 'dfs'],
        ['p', 'prob', true], ['ci_lo', 'CI.L', true], ['ci_hi', 'CI.U', true]])
        expect(gate(coefs[j][a], r[k], absolute), `${a}[${j}] app=${coefs[j][a]} R=${r[k]}`).toBeLessThanOrEqual(1e-9);
    });

    expect(errors.filter(e => /Content Security Policy|CompileError|RangeError|WebAssembly/i.test(e)), 'CSP/compile errors').toEqual([]);
    expect(errors, 'no console errors').toEqual([]);
  });
}

// While rve-eigen.js is still compiling (held back here for 1.5 s), a direct
// CR2 call must refuse with an RVE message and the page's own load-time fit of
// the default example (39 numeric study IDs, multi-row clusters) must wait.
test('fits requested before the eigen backend is ready wait or refuse, never guess', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  const rows = eigen.input.rows, rho = eigen.input.rho;
  await page.addInitScript(([rows, rho]) => {
    const compile = WebAssembly.compile;
    WebAssembly.compile = bytes => new Promise(r => setTimeout(r, 1500)).then(() => compile.call(WebAssembly, bytes));
    window.__metaRowLog = [];
    new MutationObserver(() => {
      const el = document.getElementById('meta-row');
      if (el) window.__metaRowLog.push(el.textContent);
    }).observe(document, { subtree: true, childList: true, characterData: true });
    document.addEventListener('DOMContentLoaded', () => {
      window.__earlyStatus = window.AlmRVEEigen.status();
      try { window.__earlyFit = window.AlmRVE.fitCORR(rows, { rho }).beta; }
      catch (e) { window.__earlyFit = e.message; }
    });
  }, [rows, rho]);
  await page.goto(PAGE, { waitUntil: 'load' });
  await expect(page.locator('#meta-row')).toContainText('k = 172 effects, m = 39 clusters');
  await expect(page.locator('#coef-body tr')).toHaveCount(4);
  const early = await page.evaluate(() => ({ status: window.__earlyStatus, fit: window.__earlyFit, log: window.__metaRowLog }));
  expect(early.status).toBe('loading');
  expect(early.fit).toMatch(/^RVE: CR2 eigen backend is still loading/);
  expect(early.log.some(t => /Preparing the CR2 eigen backend/.test(t)), 'load-time fit waited').toBe(true);
  expect(early.log.some(t => /Fit failed/.test(t)), 'no failed fit was shown').toBe(false);
  expect(await page.evaluate(() => window.__almLastRVE().model.method)).toBe('CR2');
  expect(errors).toEqual([]);
});

// m1: with WebAssembly unavailable the page shows the RVE message to the user.
test('without WebAssembly the page shows the RVE refusal, not a number', async ({ page }) => {
  await page.addInitScript(() => { delete window.WebAssembly; });
  await page.goto(PAGE, { waitUntil: 'load' });
  await expect(page.locator('#meta-row [role="alert"]')).toHaveText('Fit failed: RVE: CR2 requires WebAssembly (blocked or unavailable)');
  await expect(page.locator('#coef-body tr')).toHaveCount(0);
});
