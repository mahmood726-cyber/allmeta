import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.describe.configure({ mode: 'parallel' });
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(10000);
  // Returning-user plot tests: honour the apps' existing onboarding preferences.
  await page.addInitScript(() => {
    localStorage.setItem('truthcert_visited', 'true');
    localStorage.setItem('nma-quickstart-dismissed', 'true');
    localStorage.setItem('nma_wizard_completed', 'true');
    localStorage.setItem('nma_tutorial_completed', 'true');
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
  for (const [tab, id] of [['analysis', 'forestPlot'], ['heterogeneity', 'funnelPlot'], ['bias', 'baujatPlot']]) {
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
        if (name === 'TruthCert Pairwise Pro') {
          // A completed result must never expose a placeholder overfitting verdict,
          // then mutate the saved analysis several hundred milliseconds later.
          expect(before.metaoverfit?.skipped).not.toBe(true);
          expect(before.metaoverfit?.risk_level).toBe('SEVERE');
          expect(before.metaoverfit?.ESS).toBeGreaterThan(0);
        }
        const input = await page.evaluate(() => JSON.parse(JSON.stringify(getStudyData())));
        const downloadPromise = page.waitForEvent('download');
        await page.evaluate(() => saveProject('plot-regression.json'));
        const saved = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
        if (name === 'TruthCert Pairwise Pro') {
          // Reproduce the historical delayed-update window, without changing or
          // weakening any whole-result save/reopen identity assertions below.
          await page.waitForTimeout(700);
          expect(await page.evaluate(() => JSON.parse(JSON.stringify(AppState.results.metaoverfit)))).toEqual(before.metaoverfit);
        }
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

    test('NMA Dose-Response: actual analysis owns all five canvases, including residual and QQ diagnostics', async ({ page }) => {
      test.setTimeout(60000);
      await page.addInitScript(() => {
        window.__plotText = [];
        window.__badCanvasPoints = [];
        const text = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
          window.__plotText.push({ id: this.canvas.id, text: String(value) });
          return text.call(this, value, ...args);
        };
        const arc = CanvasRenderingContext2D.prototype.arc;
        CanvasRenderingContext2D.prototype.arc = function (...args) {
          if (args.slice(0, 5).some(x => !Number.isFinite(x))) window.__badCanvasPoints.push({ id: this.canvas.id, args });
          return arc.apply(this, args);
        };
      });
      await page.goto('/nma-dose-response-app/index.html', { waitUntil: 'load' });
      await page.waitForFunction(() => !!window._nmaState?.wasm && window._nmaState.lastStats?.length > 0);
      await dismissTutorial(page);
      await page.locator('#runAnalysis').click();
      await expect(page.locator('#chartsPanel')).not.toHaveClass(/hidden/);
      const before = await page.evaluate(() => JSON.stringify(_nmaState.lastStats));
      for (const [tab, id] of [['dose','doseChart'],['rank','rankChart'],['network','networkChart'],['bias','biasChart'],['diagnostics','diagnosticsChart']]) {
        await page.locator('#chartTabs [data-tab-button="' + tab + '"]').click();
        await canvasHasInk(page, id);
        // Populated pixels alone are insufficient: a competing demo instance can
        // otherwise repaint these canvases on animation, hover or resize.
        expect(await page.locator('#' + id).evaluate(el => !!el.chartInstance || !!window.Chart?.getChart(el))).toBe(false);
      }
      await expect.poll(() => page.evaluate(() => __plotText.filter(p => p.id === 'diagnosticsChart').map(p => p.text))).toContain('Residuals vs Fitted');
      const residuals = await page.evaluate(() => NMAStudio.getDiagnosticPlotData());
      expect(residuals.length).toBeGreaterThan(0);
      for (const point of residuals) {
        expect(point.residual).toBeCloseTo((point.observed - point.fitted) / Math.sqrt(point.variance), 12);
      }
      await page.locator('#diagnosticPlotSelect').selectOption('qq');
      await canvasHasInk(page, 'diagnosticsChart');
      await expect.poll(() => page.evaluate(() => __plotText.filter(p => p.id === 'diagnosticsChart').map(p => p.text))).toContain('Normal Q-Q Plot');
      const qq = await page.evaluate(() => NMAStudio.getDiagnosticPlotData('qq'));
      expect(qq.map(p => p.sample)).toEqual(residuals.map(p => p.residual).sort((a, b) => a - b));
      expect(qq.every(p => Number.isFinite(p.theoretical))).toBe(true);
      expect(await page.evaluate(() => JSON.stringify(_nmaState.lastStats))).toBe(before);
      expect(await page.evaluate(() => __plotText.filter(p => /\(Demo\)/.test(p.text)))).toEqual([]);
      expect(await page.evaluate(() => __badCanvasPoints)).toEqual([]);
      // A second analysis must show the new input's treatment, not old/demo labels.
      await page.locator('#csvInput').fill((await page.locator('#csvInput').inputValue()).replaceAll('DrugA', 'AuditTreatment'));
      await page.locator('#runAnalysis').click();
      await page.evaluate(() => { window.__plotText = []; });
      await page.locator('#chartTabs [data-tab-button="network"]').click();
      await expect.poll(() => page.evaluate(() => __plotText.filter(p => p.id === 'networkChart').map(p => p.text))).toContain('AuditTreatment');
      expect(await page.evaluate(() => NMAStudio.getDiagnosticPlotData().some(p => p.treatment === 'AuditTreatment'))).toBe(true);
      await page.locator('#chartTabs [data-tab-button="diagnostics"]').click();
      await canvasHasInk(page, 'diagnosticsChart');
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
