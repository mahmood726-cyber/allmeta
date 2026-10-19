// GOSH exact streamed all-subsets enumeration (gosh/exact-enum.js + gosh/exact-ui.js).
// Pinned references: gosh/validate/exact/ (MANIFEST-exact.json). Tolerance 1e-9 normalised, counts and grid cells exact.
// GOSH_EXACT_BASE (default /gosh/) lets the same spec run against another checkout (e.g. origin/main) to show it fails there.
import { test, expect } from '@playwright/test';

const BASE = process.env.GOSH_EXACT_BASE || '/gosh/';
const DIR = BASE + 'validate/exact/';

async function load(page) {
  await page.goto(BASE + 'index.html');
  await expect(page.locator('#m-n')).toHaveText('511');
}

async function input(page, id, model, mode) {
  const cfg = await page.evaluate(async ([dir, id]) => (await (await fetch(dir + 'corpus.json')).json()).configurations.find(c => c.id === id), [DIR, id]);
  const text = cfg.te.map((t, i) => `${t}, ${cfg.se[i]}, S${i + 1}`).join('\n');
  await page.fill('#src', text);
  await page.selectOption('#model', model);
  await page.click('#btn-run');
  if (mode) { await page.selectOption('#enum-mode', mode); await page.click('#btn-run'); }
  return cfg;
}

test.describe('GOSH exact enumeration', () => {
  test('replay: engine equals the independent R and the forced metafor::gosh references (pinned)', async ({ page }) => {
    test.setTimeout(900_000);
    await load(page);
    const r = await page.evaluate(async (dir) => {
      const manifest = await (await fetch(dir + 'MANIFEST-exact.json')).json();
      const loaded = {};
      for (const f of manifest.files) {
        const bytes = new Uint8Array(await (await fetch(dir + f.path, { cache: 'no-store' })).arrayBuffer());
        const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (sha !== f.sha256 || bytes.length !== f.bytes) return { error: 'hash mismatch ' + f.path };
        loaded[f.path] = JSON.parse(new TextDecoder().decode(bytes));
      }
      const byId = new Map(loaded['corpus.json'].configurations.map(c => [c.id, c]));
      const out = {}, cache = new Map();
      for (const ref of ['reference-r.json', 'reference-metafor.json']) {
        let checks = 0, passed = 0, max = 0; const fails = [];
        for (const x of loaded[ref].results) {
          const c = byId.get(x.id), key = x.id + x.model;
          if (!cache.has(key)) cache.set(key, AlmGoshExactEngine.run(c.te, c.se, x.model));
          const res = AlmGoshExactCompare.compare(cache.get(key), x);
          checks += res.checks; passed += res.passed; max = Math.max(max, res.maxNormDiff); fails.push(...res.failures.slice(0, 2));
        }
        out[ref] = { checks, passed, expected: manifest.checks[ref], max, fails: fails.slice(0, 5), results: loaded[ref].results.length };
      }
      return out;
    }, DIR);
    console.log('EXACT REPLAY', JSON.stringify(r));
    expect(r.error).toBeUndefined();
    for (const ref of ['reference-r.json', 'reference-metafor.json']) {
      expect(r[ref].fails).toEqual([]);
      expect(r[ref].passed).toBe(r[ref].checks);
      expect(r[ref].checks).toBe(r[ref].expected);
    }
  });

  test('planted negative controls fail: a dropped subset and a perturbed weight', async ({ page }) => {
    test.setTimeout(300_000);
    await load(page);
    const r = await page.evaluate(async (dir) => {
      const corpus = await (await fetch(dir + 'corpus.json')).json(), ref = await (await fetch(dir + 'reference-r.json')).json();
      const out = [];
      for (const id of ['dat.damico2009::001', 'dat.begg1989::001']) for (const model of ['FE', 'DL']) {
        const c = corpus.configurations.find(x => x.id === id), x = ref.results.find(y => y.id === id && y.model === model);
        const good = AlmGoshExactEngine.run(c.te, c.se, model);
        // drop the full-set subset from the streamed result
        const e = AlmGoshExactEngine.createEngine(c.te, c.se, model), k = c.k, [est, I2] = e.fit(2 ** k - 1);
        const drop = JSON.parse(JSON.stringify(good)), N = drop.n_subsets, g = drop.grid;
        drop.n_subsets = N - 1; drop.mean_est = (drop.mean_est * N - est) / (N - 1); drop.mean_i2 = (drop.mean_i2 * N - I2) / (N - 1);
        g.counts[Math.min(g.ny - 1, Math.floor(I2 * g.ny / 100)) * g.nx + Math.min(g.nx - 1, Math.max(0, Math.floor((est - g.x0) * (g.nx / (g.x1 - g.x0)))))] -= 1;
        const weight = AlmGoshExactEngine.run(c.te, c.se.map((s, i) => i === 3 ? s * (1 + 1e-6) : s), model);
        out.push({ id, model, good: AlmGoshExactCompare.compare(good, x).failures.length,
          drop: AlmGoshExactCompare.compare(drop, x).failures.map(f => f.quantity),
          weight: AlmGoshExactCompare.compare(weight, x).failures.map(f => f.quantity) });
      }
      return out;
    }, DIR);
    console.log('PLANTED', JSON.stringify(r.map(x => ({ id: x.id, model: x.model, good: x.good, drop: x.drop.length, weight: x.weight.length, dropSample: x.drop.slice(0, 4), weightSample: x.weight.slice(0, 4) }))));
    for (const x of r) {
      expect(x.good).toBe(0);
      expect(x.drop).toContain('n_subsets');
      expect(x.drop.some(q => q.startsWith('grid['))).toBe(true);
      expect(x.drop).toContain('mean_est');
      expect(x.weight.length).toBeGreaterThan(0);
    }
  });

  test('UI: k = 20 DL runs exactly in a Web Worker and replaces the sampled preview', async ({ page }) => {
    test.setTimeout(300_000);
    await load(page);
    await input(page, 'dat.begg1989::001', 'DL');
    await expect(page.locator('#enum-label')).toBeVisible();
    await expect(page.locator('#exact-status')).toHaveText(/^Exact: all 1,048,575 non-empty subsets of k = 20 studies \(DL\)/, { timeout: 240_000 });
    const ref = await page.evaluate(async (dir) => (await (await fetch(dir + 'reference-r.json')).json()).results.find(r => r.id === 'dat.begg1989::001' && r.model === 'DL'), DIR);
    await expect(page.locator('#m-n')).toHaveText('1,048,575');
    await expect(page.locator('#m-est')).toHaveText(ref.median_est.toFixed(3));
    await expect(page.locator('#m-i2')).toHaveText(ref.median_i2.toFixed(1) + '%');
    const plot = await page.evaluate(() => { const r = [...document.querySelectorAll('#plot rect.exact-cell')]; return { cells: r.length, total: r.reduce((s, x) => s + Number(x.dataset.count), 0), circles: document.querySelectorAll('#plot circle').length }; });
    expect(plot).toEqual({ cells: ref.grid_cells.length, total: 1048575, circles: 0 });
    await expect(page.locator('#exact-perstudy tbody tr')).toHaveCount(20);
    const exported = await page.evaluate(() => { const r = window._almLastGosh(); return { sampled: r.sampled, enumeration: r.enumeration, n: r.n_subsets, perStudy: r.exact.per_study.length }; });
    expect(exported).toEqual({ sampled: false, enumeration: 'exact-streamed', n: 1048575, perStudy: 20 });
    await expect(page.locator('#plot-note')).toHaveText(/^Exact enumeration: 1,048,575 subsets/);
  });

  test('UI: Cancel stops a running exact enumeration and keeps the labelled sampled result', async ({ page }) => {
    test.setTimeout(120_000);
    await load(page);
    await input(page, 'dat.collins1985a::003', 'DL', 'exact');
    await expect(page.locator('#exact-cancel')).toBeVisible();
    await expect(page.locator('#m-n')).toHaveText('5,000');
    await page.click('#exact-cancel');
    await expect(page.locator('#exact-status')).toHaveText('Exact enumeration cancelled; the sampled result is shown.');
    await expect(page.locator('#exact-progress')).toBeHidden();
    expect(await page.evaluate(() => window._almLastGosh().sampled)).toBe(true);
    await expect(page.locator('#m-n')).toHaveText('5,000');
  });

  test('UI: sampling-only mode and k <= 15 leave the existing paths unchanged', async ({ page }) => {
    await load(page);
    await expect(page.locator('#enum-label')).toBeHidden();
    await expect(page.locator('#exact-status')).toHaveText('Applies when more than 15 studies are entered.');
    await input(page, 'dat.fine1993::003', 'FE', 'sample');
    await expect(page.locator('#m-n')).toHaveText('5,000');
    await expect(page.locator('#exact-status')).toHaveText(/^Random sampling selected\./);
    expect(await page.evaluate(() => window._almLastGosh().sampled)).toBe(true);
  });
});
