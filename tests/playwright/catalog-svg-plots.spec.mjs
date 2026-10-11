import { test, expect } from '@playwright/test';

// Observed plot entry points, not a claim that every secondary method is covered.
// Empty citation-date histograms and the static journal illustrations are excluded.
const cases = [
  ['rob/index.html', ['#btn-demo'], ['svg#traffic']],
  ['rct-extractor/index.html', ['#btn-run'], ['svg#plot']],
  ['sequential-ma/', ['#btn-run'], ['svg#plot-host']],
  ['living-rob-pool/', ['#btn-run'], ['svg#plot-host']],
  ['nma-meta-reg/', ['#btn-run'], ['svg#plot-host']],
  ['cross-design/', ['#btn-run'], ['#forest-host svg']],
  ['nma-global-inconsistency/index.html', ['#btn-run'], ['svg#plot']],
  ['powerma/index.html', ['#btn-run'], ['svg#plot']],
  ['gosh-metareg/index.html', ['#btn-run'], ['svg#plot']],
  ['p-curve/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#plot']],
  ['limit-ma/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#plot']],
  ['robins-e/index.html', [], ['svg#traffic']],
  ['cerqual/index.html', ['#btn-demo'], ['svg#heat']],
  ['citation-chaser/index.html', ['#btn-run'], ['svg#years']],
  ['nma-inconsistency/index.html', ['#btn-run'], ['svg#ns-plot']],
  ['bucher/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#plot']],
  ['multilevel-ma/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#forest']],
  ['pubbias-tests/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#funnel']],
  ['copas/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#plot']],
  ['bayesian-mcmc/index.html', ['#btn-run'], ['svg#mu-density', 'svg#tau-density', 'svg#trace']],
  ['influence/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#loo-plot', 'svg#influence-plot', 'svg#baujat-plot', 'svg#radial-plot']],
  ['thematic-synthesis/index.html', ['#btn-demo'], ['svg#tree']],
  ['bayesian-nma/index.html', ['#btn-run'], ['svg#sucra-plot', 'svg#network']],
  ['mh-peto/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#forest', 'svg#labbe']],
  ['mcid/index.html', ['#btn-run'], ['svg#plot']],
  ['evalue/index.html', ['#btn-run'], ['svg#plot']],
  ['component-nma/index.html', ['#btn-run'], ['svg#forest']],
  ['transportability/', ['#btn-example', '#btn-run'], ['#plot svg']],
  ['surrogate-validation/', ['#btn-example', '#btn-run'], ['#plot svg']],
  ['quantile-ma/', ['#btn-example', '#btn-run'], ['#plot svg']],
  ['benford-screen/', ['#btn-example', '#btn-run'], ['#plot svg']],
  ['nmi/index.html', ['#run'], ['svg#forest']],
  ['robins-i/index.html', [], ['svg#traffic']],
  ['quadas-2/index.html', [], ['svg#traffic']],
  ['gsdesign/index.html', ['#run'], ['svg#plot']],
  ['amstar-2/index.html', [], ['svg#plot']],
  ['cinema/index.html', ['#btn-demo'], ['svg#heat']],
  ['hsroc/index.html', ['#btn-example', '#btn-run'], ['#sroc-host svg']],
  ['gosh/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#plot']],
  ['pico/index.html', [], ['svg#wheel']],
  ['prisma-checklist/index.html', [], ['svg#donut']],
  ['search-translator/index.html', ['#btn-run'], ['svg#plot']],
  ['rob2/index.html', [], ['svg#traffic']],
  ['median-to-mean/index.html', ['#btn-run'], ['svg#plot']],
  ['pet-peese/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#funnel']],
  ['proportion-ma/index.html', ['button:has-text("Load Sample")', '#btn-run'], ['svg#forest']],
  ['effect-size-converter/index.html', ['button:has-text("Load Sample")'], ['svg#forest-plot']],
  ['km-reconstructor/index.html', ['#btn-run'], ['svg#km-plot']],
  ['prisma-flow/index.html', [], ['#svg-host svg']],
  ['forest-plot/index.html', ['#btn-example'], ['#svg-host svg']],
  ['rob-traffic-light/index.html', ['#btn-example'], ['#svg-host svg']],
  ['tsa/index.html', ['#btn-example'], ['#svg-host svg']],
  ['heterogeneity/index.html', ['#btn-example'], ['#svg-host svg']],
  ['funnel-plot/index.html', ['#btn-example'], ['#svg-host svg', '#doi-host svg']],
  ['workbench/index.html', ['#btn-example'], ['#tile-forest svg', '#tile-funnel svg', '#tile-het svg', '#tile-tsa svg']],
  ['meta-regression/index.html', ['#btn-example'], ['#svg-host svg']],
  ['dta-sroc/index.html', ['#btn-example'], ['#svg-host svg', '#fagan-host svg', '#deeks-host svg']],
  ['bayesian-ma/index.html', ['#btn-example'], ['#svg-host svg']],
  ['cumulative-subgroup/index.html', ['#btn-example'], ['#svg-host svg']],
  ['correlation-ma/index.html', [], ['#forest-host svg']],
  ['multiplicative-nma/index.html', ['#btn-example', '#btn-run'], ['#forest svg']],
  ['rmst-ma/index.html', [], ['#forest-host svg']],
  ['dose-response-ma/index.html', [], ['#curve-host svg', '#resid-host svg']],
  ['multivariate-ma/index.html', [], ['#plot-host svg']],
];

test.describe.configure({ mode: 'parallel' });
for (const width of [1280, 390]) {
  test.describe(`Catalogue SVG at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, screenshot: 'only-on-failure' });
    for (const [path, actions, plots] of cases) {
      test(path, async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('/' + path, { waitUntil: 'load' });
        for (const action of actions) await page.locator(action).first().click();
        for (const selector of plots) {
          const svg = page.locator(selector).first();
          await expect(svg).toBeVisible();
          await expect.poll(() => svg.locator('path,circle,rect,line,polyline,polygon').count()).toBeGreaterThan(0);
          expect(await svg.evaluate(el => {
            const box = el.getBoundingClientRect();
            return box.width > 100 && box.height > 50;
          })).toBe(true);
          expect(await svg.evaluate(el => [...el.querySelectorAll('path,circle,rect,line,polyline,polygon')].flatMap(mark =>
            [...mark.attributes].filter(a => /^(d|points|cx|cy|r|x|y|x1|x2|y1|y2|width|height)$/.test(a.name) && /NaN|Infinity/.test(a.value)).map(a => `${mark.tagName}.${a.name}=${a.value}`)
          ))).toEqual([]);
        }
        expect(errors).toEqual([]);
      });
    }
  });
}
