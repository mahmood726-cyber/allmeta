import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.describe.configure({ mode: 'parallel' });
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(10000);
  // Returning-user plot tests: honour the apps' existing onboarding preferences.
  await page.addInitScript(() => {
    localStorage.setItem('truthcert_visited', 'true');
    localStorage.setItem('nma-quickstart-dismissed', 'true');
    localStorage.setItem('hta_tutorial_seen', 'true');
  });
});
async function dismissTutorial(page) {
  for (const selector of ['#quickStartModal.active button[onclick="closeQuickStartWizard()"]', '#quickstart-close']) {
    const button = page.locator(selector).first();
    if (await button.count() && await button.isVisible()) await button.click();
  }
}
async function canvasHasInk(page, id) {
  const canvas = page.locator('#' + id);
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(e => {
    if (!e.width || !e.height || !e.clientWidth || !e.clientHeight) return 0;
    const a = e.getContext('2d').getImageData(0, 0, e.width, e.height).data;
    const values = new Set();
    const step = Math.max(4, Math.floor(a.length / 6000 / 4) * 4);
    for (let i = 0; i < a.length; i += step) values.add(a[i] + ',' + a[i+1] + ',' + a[i+2] + ',' + a[i+3]);
    return values.size;
  })).toBeGreaterThan(5);
}
async function plotlyHasData(page, id) {
  const plot = page.locator('#' + id);
  await expect(plot).toBeVisible();
  await expect(plot.locator('svg.main-svg').first()).toBeVisible();
  await expect.poll(() => plot.evaluate(e => e.data?.length || 0)).toBeGreaterThan(0);
}
async function pairwisePlots(page) {
  for (const [tab, id] of [['analysis', 'forestPlot'], ['heterogeneity', 'baujatPlot'], ['bias', 'funnelPlot']]) {
    await page.locator('.tab-btn[data-tab="' + tab + '"]').click();
    await plotlyHasData(page, id);
  }
}

for (const width of [1280, 390]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const [name, path] of [
      ['TruthCert Pairwise Pro', '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html'],
      ['Pairwise AI', '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html'],
    ]) {
      test(`${name}: all core plots survive a real save/reopen`, async ({ page }, info) => {
        test.setTimeout(65000);
        page.on('dialog', d => d.dismiss());
        await page.goto(path, { waitUntil: 'load' });
        await dismissTutorial(page);
        await page.evaluate(() => loadDemoDataset('SGLT2_ACM'));
        await page.locator('#runAnalysisBtn').click();
        await page.waitForFunction(() => !!AppState.results?.pooled);
        await pairwisePlots(page);
        const before = await page.evaluate(() => JSON.parse(JSON.stringify(AppState.results)));
        const input = await page.evaluate(() => JSON.parse(JSON.stringify(getStudyData())));
        const downloadPromise = page.waitForEvent('download');
        await page.evaluate(() => saveProject('plot-regression.json'));
        const saved = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
        await info.attach('saved-result-keys', { body: JSON.stringify({ before: Object.keys(before), saved: Object.keys(saved.results || {}) }), contentType: 'application/json' });
        await page.reload({ waitUntil: 'load' });
        await dismissTutorial(page);
        await page.evaluate(() => {
          window.__restoreRefits = 0;
          const run = runAnalysis;
          window.runAnalysis = function (...args) { window.__restoreRefits++; return run.apply(this, args); };
        });
        await page.evaluate(state => loadProject(JSON.stringify(state)), saved);
        await pairwisePlots(page);
        expect(saved.results).toEqual(before);
        expect(await page.evaluate(() => JSON.parse(JSON.stringify(AppState.results)))).toEqual(before);
        expect(await page.evaluate(() => JSON.parse(JSON.stringify(getStudyData())))).toEqual(input);
        expect(await page.evaluate(() => window.__restoreRefits)).toBe(0);
      });
    }

    test('NMA Dose-Response: Run opens real plots and all five chart tabs repaint', async ({ page }) => {
      test.setTimeout(60000);
      await page.goto('/nma-dose-response-app/index.html', { waitUntil: 'load' });
      await page.waitForFunction(() => !!window._nmaState?.wasm && window._nmaState.lastStats?.length > 0);
      await dismissTutorial(page);
      await page.locator('#runAnalysis').click();
      await expect(page.locator('#chartsPanel')).not.toHaveClass(/hidden/);
      await expect(page.getByText('Analysis engine loading... please try again.', { exact: true })).toHaveCount(0);
      for (const [tab, id] of [['dose','doseChart'],['rank','rankChart'],['network','networkChart'],['bias','biasChart'],['diagnostics','diagnosticsChart']]) {
        await page.locator('#chartTabs [data-tab-button="' + tab + '"]').click();
        await canvasHasInk(page, id);
      }
    });

    test('Dose Response Pro: live, main and bias plots survive saved-session reload', async ({ page }) => {
      await page.goto('/dosehtml/dose-response-pro.html', { waitUntil: 'load' });
      await page.evaluate(() => { loadSampleData(); runAnalysis(); saveAnalysis(); });
      await page.reload({ waitUntil: 'load' });
      await page.evaluate(() => loadAnalysis());
      for (const [tab, id] of [['realtime','livePlotCanvas'],['plots','mainPlot'],['bias','biasFunnelCanvas']]) {
        await page.locator('.tab[data-tab="' + tab + '"]').click();
        await canvasHasInk(page, id);
      }
    });

    test('IPD Meta-Pro: computed trim-and-fill result has a populated plot', async ({ page }) => {
      test.setTimeout(65000);
      await page.goto('/IPD-Meta-Pro/ipd-meta-pro.html', { waitUntil: 'load' });
      await page.evaluate(() => loadExampleData('survival'));
      await page.waitForTimeout(500);
      await page.evaluate(() => runAnalysis());
      await page.waitForFunction(() => !!APP.results?.pooled);
      const before = await page.evaluate(() => JSON.stringify(APP.results));
      await page.locator('.nav-tab[data-panel="pubbias"]').click();
      await canvasHasInk(page, 'funnelPlot');
      await canvasHasInk(page, 'trimFillPlot');
      expect(await page.evaluate(() => JSON.stringify(APP.results))).toBe(before);
    });

    test('IPD Meta-Pro: resizing a data-derived network never draws demo nodes', async ({ page }) => {
      test.setTimeout(65000);
      await page.goto('/IPD-Meta-Pro/ipd-meta-pro.html', { waitUntil: 'load' });
      await page.evaluate(() => loadExampleData('network_antidepressants'));
      await page.waitForTimeout(500);
      await page.locator('.nav-tab[data-panel="network"]').click();
      const expected = await page.evaluate(() => {
        window.__networkDraws = [];
        const draw = Plots.drawNetwork;
        Plots.drawNetwork = function(canvas, nodes, edges, ...rest) {
          window.__networkDraws.push(nodes.map(n => String(n.id)).sort());
          return draw.call(this, canvas, nodes, edges, ...rest);
        };
        const network = buildNetworkFromData();
        return network.nodes.map(n => String(n.id)).sort();
      });
      await canvasHasInk(page, 'networkPlot');
      await page.setViewportSize({ width: width + 60, height: 920 });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(650);
      const draws = await page.evaluate(() => window.__networkDraws);
      expect(draws.length).toBeGreaterThan(1);
      for (const nodes of draws) expect(nodes).toEqual(expected);
      await canvasHasInk(page, 'networkPlot');
    });

    test('HTA Pro: base-case trace renders after navigation', async ({ page }) => {
      test.setTimeout(65000);
      await page.goto('/HTA/index.html', { waitUntil: 'load' });
      await page.evaluate(async () => { app.loadDemoModel(); await app.runBaseCase(); });
      await canvasHasInk(page, 'trace-chart');
      await page.evaluate(() => app.navigateToSection('overview'));
      await page.evaluate(() => app.navigateToSection('deterministic'));
      await canvasHasInk(page, 'trace-chart');
    });
  });
}
