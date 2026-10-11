"""One-time guarded repair; production files are committed only after browser tests."""
from pathlib import Path
import hashlib


def load(path, expected):
    raw = Path(path).read_bytes()
    sha = hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest()
    assert sha == expected, f'Source changed: {path}: {sha}'
    return raw.decode()

p = Path('nma-dose-response-app/index.html')
t = load(str(p), '9c5b3ac2f4cb0a4d37c857e46c1d236b43a1b320')
a = t.index('    // DEMO CHART INITIALIZATION')
b = t.index('    // DRAGGABLE CHARTS PANEL', a)
# Never attach Chart.js demonstration instances to the engine-owned canvases.
t = t[:a] + '    // Analysis canvases are owned exclusively by app.js.\n    // ============================================\n' + t[b:]
old = '        // Initialize demo charts after a short delay to ensure Chart.js is loaded\n        setTimeout(initializeDemoCharts, 100);'
assert t.count(old) == 1
t = t.replace(old, '        // app.js renders these canvases from the selected example or user analysis.', 1)
p.write_text(t)

p = Path('nma-dose-response-app/app.js')
t = load(str(p), '5f7c1d2a49371c4f72c97e5466c7b78a5634a20e')
a = t.index('  // Prepare data for residual plot\n')
b = t.index('  // Draw residual plot on canvas', a)
t = t[:a] + """  // Adapt the current dose-response fit to diagnostics. The former adapter
  // expected pooled-meta-analysis fields absent from computeStats(). Use the
  // same fitted values and variance convention as computeStdResidualSummary.
  function prepareResidualPlotData(stats) {
    const treatments = new Set(stats.map(stat => stat.treatment));
    const plotData = [];
    for (const point of state.data) {
      if (!treatments.has(point.treatment)) continue;
      const fit = state.fits[point.treatment];
      if (!fit) continue;
      const fitted = predictModel(fit, point.dose);
      const variance = point.weight > 0 ? 1 / point.weight : 1;
      const tau2 = Number.isFinite(state.tau2ByTreatment[point.treatment])
        ? state.tau2ByTreatment[point.treatment] : 0;
      const totalVariance = variance + tau2;
      if (!Number.isFinite(fitted) || !Number.isFinite(point.value)
          || !Number.isFinite(totalVariance) || totalVariance <= 0) continue;
      plotData.push({
        treatment: point.treatment,
        study: point.study,
        dose: point.dose,
        observed: point.value,
        fitted,
        variance: totalVariance,
        residual: (point.value - fitted) / Math.sqrt(totalVariance),
        weight: 1 / totalVariance
      });
    }
    return plotData;
  }

  function prepareQQPlotData(stats) {
    const residuals = prepareResidualPlotData(stats).sort((a, b) => a.residual - b.residual);
    const theoretical = computeTheoreticalQuantiles(residuals.length);
    return residuals.map((r, i) => ({
      treatment: r.treatment,
      theoretical: theoretical[i],
      sample: r.residual
    }));
  }

""" + t[b:]
old = '  window.NMAStudio = {\n    runAnalysisFromInput,'
assert t.count(old) == 1
t = t.replace(old, """  window.NMAStudio = {
    runAnalysisFromInput,
    // Read-only plotting adapter, exposed alongside the existing test utilities.
    getDiagnosticPlotData(type = 'residual') {
      return type === 'qq' ? prepareQQPlotData(state.lastStats) : prepareResidualPlotData(state.lastStats);
    },""", 1)
p.write_text(t)

p = Path('tests/playwright/flagship-plot-rendering.spec.mjs')
t = p.read_text()
a = t.index("    test('NMA Dose-Response:")
b = t.index("    test('Dose Response Pro:", a)
t = t[:a] + """    test('NMA Dose-Response: actual analysis owns all five canvases, including residual and QQ diagnostics', async ({ page }) => {
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
      expect(await page.evaluate(() => __plotText.filter(p => /\\(Demo\\)/.test(p.text)))).toEqual([]);
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

""" + t[b:]
p.write_text(t)
print('Removed competing demo canvas owners and wired actual fitted diagnostic data.')
