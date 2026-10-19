// correlation-ma usability walkthrough (scripted task, real browser): fresh load -> example -> paste own data
// (dat.molloy2014, 16 studies, plus one malformed row) -> change estimator and CI method -> read the core output
// -> leave-one-out -> export (R script + results JSON). Counts user clicks; screenshots each step; axe-core
// WCAG 2.1 A/AA on the whole page in light and dark. Figure 2 of the paper is captured from the final state.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.env.P17_WALK_OUT || 'walkthrough-out';
const MOLLOY = [[0.187, 109], [0.162, 749], [0.34, 55], [0.32, 107], [0.27, 72], [0, 65], [0.175, 174], [0.05, 326], [0.26, 58], [0.01, 771], [-0.09, 56], [0.37, 91], [0, 116], [0.15, 537], [0.24, 158], [0.04, 65]]
  .map(([r, n], i) => `row-${i + 1}, ${r}, ${n}`).join('\n');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe.configure({ timeout: 300_000 });

test('scripted task walkthrough with click count, screenshots and Figure 2', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const log = []; let clicks = 0;
  const step = async (name) => { await page.screenshot({ path: `${OUT}/${String(log.length + 1).padStart(2, '0')}-${name}.png`, fullPage: true }); };
  const click = async (loc, why) => { await loc.click(); clicks++; log.push({ click: clicks, why }); };
  await page.addInitScript(() => {
    window.__blobs = []; const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__blobs.push(b); return create(b); };
    HTMLAnchorElement.prototype.click = function () { (window.__dl = window.__dl || []).push(this.download); };
  });
  // 1. Fresh load: the built-in example is analysed with zero clicks.
  await page.goto('/correlation-ma/index.html');
  await page.waitForFunction(() => window._almCorrPlus && window._almCorrPlus());
  const headline0 = await page.locator('#headline').textContent();
  log.push({ step: 'fresh load', clicks, headline: headline0 }); await step('fresh-load');
  expect(headline0).toContain('k = 8');
  // 2. One-click real example (restores the example after edits).
  await page.locator('#f-data').fill('x, .2, 30');
  await click(page.getByRole('button', { name: 'Load example' }), 'Load example');
  await expect(page.locator('#headline')).toHaveText(headline0);
  log.push({ step: 'example', clicks }); await step('example');
  // 3. Paste own data with one malformed row: the excluded row is named, never dropped silently.
  await click(page.locator('#f-data'), 'focus data box');
  await page.locator('#f-data').fill(MOLLOY + '\nrow-17, 1.2, 50');
  await expect(page.locator('#f-notice')).toContainText('1 row was excluded');
  await expect(page.locator('#f-notice')).toContainText('|r| >= 1');
  const notice = await page.locator('#f-notice').textContent();
  const headlinePaste = await page.locator('#headline').textContent();
  log.push({ step: 'paste own data', clicks, notice, headline: headlinePaste }); await step('paste');
  expect(headlinePaste).toContain('k = 16');
  // 4. Change the estimator and the CI method.
  await page.locator('#f-method').selectOption('PM'); clicks++; log.push({ click: clicks, why: 'estimator = Paule-Mandel (one select)' });
  await click(page.locator("input[name='alm-plus-test'][value='knha']"), 'CI method = HKSJ');
  // 5. Read the core output: headline + current sensitivity row.
  const current = await page.locator('#alm-plus-sens tr[aria-current=true]').innerText();
  log.push({ step: 'core output', clicks, headline: await page.locator('#headline').textContent(), current_row: current }); await step('core-output');
  expect(current).toContain('PM');
  // 6. Leave-one-out.
  await click(page.locator('#alm-plus-loo-btn'), 'Run leave-one-out');
  await expect(page.locator('#alm-plus-loo tbody tr')).toHaveCount(16);
  log.push({ step: 'leave-one-out', clicks, loo_summary: await page.locator('#alm-plus-loo [role=status]').textContent() }); await step('loo');
  // 7. Export: R script and results JSON.
  await click(page.locator('#alm-plus-r'), 'Download R script');
  const json = page.locator('#alm-export-mount button[data-action=json]');
  if (await json.count()) await click(json, 'Export results JSON');
  const dl = await page.evaluate(() => window.__dl || []);
  const rText = await page.evaluate(async () => { const b = window.__blobs.find(x => x.type.startsWith('text/plain')); return b ? await b.text() : null; });
  log.push({ step: 'export', clicks, downloads: dl, r_script_matches_selection: !!rText && rText.includes('fit <- rma(yi, vi, data = dat, method = "PM", test = "knha"') });
  await step('export');
  expect(dl.some(n => /\.R$/.test(n))).toBe(true);
  // Figure 2: the extras panel on real data (dat.molloy2014, 16 studies), REML default, Wald z, after leave-one-out.
  await page.locator('#f-data').fill(MOLLOY); await page.locator('#f-method').selectOption('REML');
  await page.locator("input[name='alm-plus-test'][value='z']").check(); await page.locator('#alm-plus-loo-btn').click();
  await expect(page.locator('#alm-plus-loo tbody tr')).toHaveCount(16);
  const fig = await page.context().browser().newContext({ deviceScaleFactor: 3, viewport: { width: 1400, height: 1000 } });
  const fp = await fig.newPage(); await fp.goto(page.url()); await fp.waitForFunction(() => window._almCorrPlus && window._almCorrPlus());
  await fp.locator('#f-data').fill(MOLLOY); await fp.locator('#alm-plus-loo-btn').click();
  await expect(fp.locator('#alm-plus-loo tbody tr')).toHaveCount(16);
  // Element screenshots (Playwright scrolls each into view): A = sensitivity table, B = leave-one-out forest.
  // The floating hub link and the chart download bar are hidden so they do not overlap the captured panels.
  await fp.evaluate(() => { for (const el of document.querySelectorAll('#hub-back, .alm-xbar, [class*=xbar]')) el.style.visibility = 'hidden'; });
  await fp.locator('#alm-plus-sens table').screenshot({ path: `${OUT}/figure2-A-sensitivity.png` });
  await fp.locator('#alm-plus-loo svg').screenshot({ path: `${OUT}/figure2-B-loo.png` });
  const figData = await fp.evaluate(() => { const p = window._almCorrPlus(); return { k: p.k, cells: p.cells.map(c => ({ m: c.method, t: c.test, r: c.r, lo: c.r_lo, hi: c.r_hi, pilo: c.r_pi_lo, pihi: c.r_pi_hi })), loo: p.loo && { n_changes: p.loo.n_changes_ci_excludes_0, largest: p.loo.largest_abs_delta_index } }; });
  writeFileSync(`${OUT}/figure2-data.json`, JSON.stringify(figData, null, 1));
  await fig.close();
  // axe on the whole page, light and dark.
  const axe = {};
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    axe[scheme] = { violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map(n => n.target.join(' ')) })), passes: r.passes.length };
    console.log(`[walkthrough axe ${scheme}] violations=${r.violations.length} passes=${r.passes.length} ${JSON.stringify(axe[scheme].violations)}`);
  }
  const result = { clicks_total: clicks, clicks_to_core_output_on_own_data: log.find(x => x.step === 'core output').clicks, steps: log, axe };
  writeFileSync(`${OUT}/walkthrough-result.json`, JSON.stringify(result, null, 1));
  console.log('[walkthrough] clicks total ' + clicks + '; pooled result on pasted data shown after ' + log.find(x => x.step === 'paste own data').clicks + ' clicks (fresh load: 0)');
});
