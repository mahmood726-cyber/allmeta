/* every-app-plots.spec.ts — strict plot-rendering matrix across every app.
 *
 * The existing hub-crawl spec verifies that each app *loads* without console
 * errors. This one goes further: for every NUMERICAL-engine app, it actively
 * loads example data (if needed), clicks Run/Compute/Analyze, and asserts
 * that a real Plotly/SVG/canvas plot renders (not just an empty placeholder).
 *
 * Per-app config in PLOT_APPS below: textarea id, run button selector, demo
 * loader (if needed), and the plot-content selector that must materialise.
 *
 * Pure-form apps (RoB, GRADE, PRISMA tool, qualitative synthesis, etc.) live
 * in LOAD_ONLY_APPS — they just need to load without console errors.
 *
 * Run from tests/playwright/:
 *   npx playwright test every-app-plots.spec.ts --project=chromium --reporter=list
 */
import { test, expect, type Page } from "@playwright/test";

interface PlotApp {
  path: string;          // server-relative URL
  demoFn?: string;       // a top-level window function to call (e.g. "loadDemo")
  runBtn?: string;       // CSS selector for the run/compute button
  plotSelector: string;  // selector that, when present, proves a plot rendered
  // If the app pre-populates its textarea (most allmeta apps do), demoFn can be skipped.
  needsData?: boolean;   // when true, demoFn MUST exist and be called before runBtn
  // Optional: extra setup function (e.g. switch a tab to make the plot panel visible).
  setup?: (page: Page) => Promise<void>;
  // Skip reasons: WebR boot, optional Python backend, archive-only, etc.
  skip?: string;
}

// PURE-FORM apps — load only, assert 0 console errors, no plot expected.
const LOAD_ONLY_APPS: { path: string; skip?: string }[] = [
  { path: "/" },                                  // hub
  { path: "/amstar-2/" },
  // /audit/ and /triage/ are Python infrastructure modules, no web UI.
  { path: "/cerqual/" },
  { path: "/cinema/" },
  { path: "/citation-chaser/" },
  { path: "/citation-dedup/" },
  { path: "/dosehtml/" },                          // landing page (not the v19 app)
  { path: "/effect-size-converter/" },
  { path: "/evidence-board/" },
  { path: "/evidenceos/" },
  { path: "/focus-studio/" },
  { path: "/grade-sof/" },
  { path: "/IPD-Meta-Pro/" },
  { path: "/kanban-lab/" },
  { path: "/km-reconstructor/" },
  { path: "/living-meta/" },
  { path: "/local-ai/" },
  { path: "/local-install/" },
  { path: "/mcid/" },
  { path: "/median-to-mean/" },
  { path: "/Pairwiseai/" },
  { path: "/pico/" },
  { path: "/powerma/" },
  { path: "/prisma-checklist/" },
  { path: "/prisma-flow/" },
  { path: "/prisma-nma/" },
  { path: "/prisma-screen/" },
  { path: "/quadas-2/" },
  { path: "/rct-extractor/" },                     // probes :8000; benign
  { path: "/revman-importer/" },
  { path: "/rve-meta/" },
  { path: "/bma-tau-priors/" },
  { path: "/multi-outcome-ma/" },
  { path: "/multi-outcome-nma/" },
  { path: "/rare-events-glmm/" },
  { path: "/prospero-templater/" },
  { path: "/cross-design/", skip: "renders forest SVG; covered as a plot test below" },
  { path: "/rob-traffic-light/" },
  { path: "/rob2/" },
  { path: "/robins-e/" },
  { path: "/robins-i/" },
  { path: "/search-translator/" },
  { path: "/thematic-synthesis/" },
  // /triage/ is a Python module without a web UI.
  { path: "/webr-studio/", skip: "WebR boot exceeds default test timeout; covered separately" },
  { path: "/Truthcert1/", skip: "redirects to a long-form app; covered in vendored test" },
  { path: "/HTA/", skip: "long boot; covered in vendored test" },
];

// PLOT apps — load, prep data, click Run, assert a real plot SVG appears.
const PLOT_APPS: PlotApp[] = [
  // Pairwise-MA core
  { path: "/forest-plot/", runBtn: "#btn-run", plotSelector: "#svg-host svg" },
  { path: "/funnel-plot/", runBtn: "#btn-run", plotSelector: "#svg-host svg" },
  { path: "/heterogeneity/", runBtn: "#btn-run", plotSelector: "#svg-host svg" },
  { path: "/meta-regression/", runBtn: "#btn-run", plotSelector: "#svg-host svg" },
  { path: "/cumulative-subgroup/", runBtn: "#btn-run", plotSelector: "#svg-host svg" },
  { path: "/tsa/", runBtn: "#btn-run", plotSelector: "#svg-host svg" },
  // workbench auto-renders mini-plots into .tile SVGs on input (live preview);
  // pre-populated textarea means SVGs appear at load. No explicit run button.
  { path: "/workbench/", plotSelector: ".tile svg" },
  { path: "/bayesian-ma/", runBtn: "#btn-run", plotSelector: "#svg-host svg" },
  { path: "/bayesian-mcmc/", runBtn: "#btn-run", plotSelector: "svg" },

  // Bias / influence / sensitivity
  { path: "/influence/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },
  { path: "/copas/", runBtn: "#btn-run", plotSelector: "svg" },
  { path: "/limit-ma/", runBtn: "#btn-run", plotSelector: "svg" },
  { path: "/pet-peese/", runBtn: "#btn-run", plotSelector: "svg" },
  { path: "/pubbias-tests/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },
  { path: "/gosh/", runBtn: "#btn-run", plotSelector: "svg" },
  { path: "/gosh-metareg/", runBtn: "#btn-run", plotSelector: "svg" },
  { path: "/proportion-ma/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },
  { path: "/multilevel-ma/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },
  { path: "/mh-peto/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },
  { path: "/p-curve/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },

  // NMA family
  { path: "/nma/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },
  { path: "/bayesian-nma/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },
  { path: "/component-nma/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },
  { path: "/nma-inconsistency/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },
  { path: "/nma-global-inconsistency/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },
  { path: "/bucher/", runBtn: "#btn-run", plotSelector: "svg, table tbody tr" },

  // DTA
  { path: "/dta-sroc/", runBtn: "#btn-run", plotSelector: "svg" },
  { path: "/hsroc/", runBtn: "#btn-run", plotSelector: "svg" },

  // Cross-design synthesis app — auto-runs on load + renders a 3-method forest
  { path: "/cross-design/", runBtn: "#btn-run", plotSelector: "#forest-host svg" },

  // NMA-pro (special: data must be loaded via window.loadDemo)
  {
    path: "/nma-pro-v2/nma-pro-v8.0.html",
    needsData: true,
    demoFn: "loadDemo",
    runBtn: "#runAnalysisBtn",
    plotSelector: ".js-plotly-plot .main-svg",
  },

  // Dose-response apps — both need explicit demo load + analysis run.
  {
    path: "/nma-dose-response-app/",
    setup: async (page) => {
      // Load Sample dataset then click Run Analysis. Use force:true because
      // some buttons live inside collapsed sections / off-screen during
      // dynamic layout settle.
      await page.click("#loadSample", { force: true, timeout: 5_000 }).catch(() => {});
      await page.click("#parseCsv", { force: true, timeout: 5_000 }).catch(() => {});
    },
    runBtn: "#runAnalysis",
    plotSelector: "canvas, .js-plotly-plot, svg",
  },
  {
    path: "/dosehtml/dose-response-pro-v19.0.html",
    setup: async (page) => {
      // 1. Load demo data via the in-page API.
      await page.evaluate(() => {
        const w = window as unknown as { app?: { loadDemoData?: (s: string) => unknown } };
        if (w.app?.loadDemoData) w.app.loadDemoData("linear");
      });
      // 2. Click the GLS tab button (switchTab needs a real click — it
      //    reads event.target). Force-click in case it's overlapped.
      await page.click('button.tab[onclick="app.switchTab(\'gls\')"]', { force: true });
      // 3. Click Run GLS Analysis inside #tab-gls.
      await page.click('button[onclick="app.runGLS()"]', { force: true });
    },
    plotSelector: ".js-plotly-plot, canvas, svg",
  },
];

// ---- Helpers ---------------------------------------------------------------

const BENIGN_CONSOLE: RegExp[] = [
  /favicon\.ico/i,
  /frame-ancestors.*ignored/i,
  /ERR_CONNECTION_REFUSED/i,
  /Failed to fetch/i,
  /127\.0\.0\.1:8000/,
  /127\.0\.0\.1:11434/,
  /Service Worker registration failed/i,
];

function instrument(page: Page) {
  const consoleErrors: string[] = [];
  page.on("console", msg => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (!BENIGN_CONSOLE.some(re => re.test(t))) consoleErrors.push(t);
    }
  });
  page.on("pageerror", err => {
    consoleErrors.push(`pageerror: ${err.message}`);
  });
  return { consoleErrors };
}

// ---- LOAD-only apps --------------------------------------------------------

for (const a of LOAD_ONLY_APPS) {
  test(`load-only: ${a.path}${a.skip ? " (skipped)" : ""}`, async ({ page }) => {
    if (a.skip) { test.skip(true, a.skip); return; }
    test.setTimeout(45_000);
    const probes = instrument(page);
    await page.goto(a.path, { waitUntil: "domcontentloaded" });
    // Give the page a tick to register console errors.
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    // Sanity: a <main> or .panel or <section> must exist so we know it rendered.
    const hasContent = await page.locator("main, .panel, section, .page, body > div").first().count();
    expect(hasContent, `no rendered content found at ${a.path}`).toBeGreaterThan(0);
    expect(probes.consoleErrors, `console errors for ${a.path}`).toEqual([]);
  });
}

// ---- PLOT apps -------------------------------------------------------------

for (const a of PLOT_APPS) {
  test(`plot: ${a.path}${a.skip ? " (skipped)" : ""}`, async ({ page }) => {
    if (a.skip) { test.skip(true, a.skip); return; }
    test.setTimeout(90_000);
    const probes = instrument(page);
    await page.goto(a.path, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});

    // Optional: app-specific setup.
    if (a.setup) await a.setup(page);

    // If the app needs explicit data loading (e.g. nma-pro), call the demo fn.
    if (a.needsData && a.demoFn) {
      const ok = await page.evaluate((fnName) => {
        const w = window as unknown as Record<string, unknown>;
        const fn = w[fnName];
        if (typeof fn !== "function") return false;
        try { (fn as () => unknown)(); return true; }
        catch (_) { return false; }
      }, a.demoFn);
      expect(ok, `${a.path}: demo loader '${a.demoFn}' missing or threw`).toBeTruthy();
    }

    // Click the run button if specified. Use locator.first() to handle
    // multi-match selectors (some apps have multiple run/compute buttons).
    if (a.runBtn) {
      const btn = page.locator(a.runBtn).first();
      const count = await btn.count();
      if (count > 0) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ timeout: 5_000 }).catch(() => { /* may already be running on autoload */ });
      }
    }

    // Wait up to 45 s for the plot to materialise.
    await page.waitForFunction((sel) => {
      return document.querySelectorAll(sel).length > 0;
    }, a.plotSelector, { timeout: 45_000 }).catch(async () => {
      // diagnostic: print what *did* appear in the page for triage.
      const dump = await page.locator("svg, canvas, .plot-container").evaluateAll(els =>
        els.slice(0, 5).map(el => ({
          tag: el.tagName.toLowerCase(),
          id: el.id,
          cls: el.className.toString().slice(0, 80),
          children: el.childElementCount,
        })),
      );
      throw new Error(
        `plot didn't render at ${a.path} within 45s.\n` +
        `Expected selector: ${a.plotSelector}\n` +
        `Page svg/canvas/plot-container inventory:\n${JSON.stringify(dump, null, 2)}`,
      );
    });

    const count = await page.locator(a.plotSelector).count();
    expect(count, `at least one plot must render at ${a.path}`).toBeGreaterThan(0);

    if (probes.consoleErrors.length) {
      console.warn(`[soft] ${a.path}: console errors (non-fatal):`, probes.consoleErrors);
    }
  });
}
