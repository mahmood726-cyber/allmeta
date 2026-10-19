/**
 * Genuine served-URL Chromium regression for Pairwise E156 forest estimands.
 * This exercises the production renderer with pre-specified study effects and
 * real Plotly SVG/canvas output; it does NOT establish R parity or the full
 * CSV import/Undo/export workflow.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://127.0.0.1:8080/Pairwiseai/e156-submission/assets/pairwise-pro-v2_2_evalue%20(5).html';

const cases = [
  { measure: 'MD',  scale: 'auto',   yi: [-1, 2],         effect: [-1, 2],   null: 0, axis: 'linear' },
  { measure: 'SMD', scale: 'auto',   yi: [-0.25, 0.5],    effect: [-0.25, 0.5], null: 0, axis: 'linear' },
  { measure: 'RD',  scale: 'auto',   yi: [-0.03, 0.02],   effect: [-3, 2],   null: 0, axis: 'linear' },
  { measure: 'OR',  scale: 'auto',   yi: [Math.log(0.8), Math.log(1.5)], effect: [0.8, 1.5], null: 1, axis: 'log' },
  { measure: 'OR',  scale: 'linear', yi: [Math.log(0.8), Math.log(1.5)], effect: [0.8, 1.5], null: 1, axis: 'linear' },
  { measure: 'RR',  scale: 'log',    yi: [Math.log(0.8), Math.log(1.5)], effect: [0.8, 1.5], null: 1, axis: 'log' },
];

for (const c of cases) {
  test(`Pairwise E156: ${c.measure} ${c.scale} plots correct effect and null`, async ({ page }) => {
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Plotly !== 'undefined' && typeof renderForestPlot === 'function');
    await page.evaluate(({ measure, scale, yi }) => {
      AppState.forestSettings.xAxisScale = scale;
      AppState.forestSettings.refLine = 'auto';
      AppState.forestSettings.showPrediction = false;
      AppState.forestSettings.showAnnotation = false;
      AppState.forestSettings.showWeights = false;
      AppState.forestSettings.sortBy = 'none';
      const studies = yi.map((v, i) => ({ name: `Study ${i + 1}`, yi: v, sei: 0.1 }));
      renderForestPlot({
        measure, studies,
        pooled: { theta: 0, ci_lower: -0.1, ci_upper: 0.1, weights_pct: [50, 50] },
      });
    }, c);
    await page.waitForFunction(() => {
      const el = document.getElementById('forestPlot');
      return el && el.data && el.data.some(t => t.name === 'Studies');
    });
    const got = await page.evaluate(() => {
      const plot = document.getElementById('forestPlot');
      const studies = plot.data.find(t => t.name === 'Studies');
      const reference = plot.data.find(t => t.mode === 'lines' && t.showlegend === false);
      return {
        points: Array.from(studies.x),
        null: reference?.x?.[0],
        axis: plot.layout.xaxis.type,
        plotRendered: Boolean(plot.querySelector('.main-svg')),
      };
    });
    expect(got.plotRendered, 'real Plotly plot must render').toBe(true);
    expect(got.axis).toBe(c.axis);
    expect(got.null).toBeCloseTo(c.null, 10);
    expect(got.points).toHaveLength(c.effect.length);
    c.effect.forEach((value, i) => expect(got.points[i]).toBeCloseTo(value, 10));
  });
}

for (const c of [
  { measure: 'MD', scale: 'log', msg: 'Logarithmic forest axes are not supported' },
  { measure: 'PLO', scale: 'auto', msg: 'Forest plot unavailable' },
]) {
  test(`Pairwise E156: refuses unvalidated ${c.measure}/${c.scale} scale`, async ({ page }) => {
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Plotly !== 'undefined' && typeof renderForestPlot === 'function');
    await page.evaluate(({ measure, scale }) => {
      AppState.forestSettings.xAxisScale = scale;
      AppState.forestSettings.showAnnotation = false;
      renderForestPlot({
        measure,
        studies: [{ name: 'A', yi: -0.25, sei: 0.1 }, { name: 'B', yi: 0.5, sei: 0.1 }],
        pooled: { theta: 0, ci_lower: -0.1, ci_upper: 0.1, weights_pct: [50, 50] },
      });
    }, c);
    await expect(page.locator('#forestPlot')).toContainText(c.msg);
    expect(await page.locator('#forestPlot .main-svg').count()).toBe(0);
  });
}
