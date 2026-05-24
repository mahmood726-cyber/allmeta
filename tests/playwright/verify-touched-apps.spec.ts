/* verify-touched-apps.spec.ts — Browser smoke for every app touched in
 * the 2026-05-24 moat + V9-01 + V9-E07 session. Loads each app via the
 * webServer http-server, captures console errors + failed network
 * requests + SRI failures, and asserts:
 *
 *   - Vendored apps: their expected window-level global (Plotly, jsPDF,
 *     html2canvas, XLSX, JSZip, Chart, d3, docx) is defined.
 *   - Bus apps: window.MaStudies is defined and has read/write/attachButtons.
 *   - nma-pro-v2 specifically: the network-overview plot div renders an
 *     actual Plotly SVG, not an empty container. User-reported regression.
 *
 * Run from tests/playwright/:
 *   npx playwright test verify-touched-apps.spec.ts --project=chromium --reporter=list
 */
import { test, expect, type Page, type ConsoleMessage, type Request } from "@playwright/test";

// Apps that vendored a CDN dep (V9-E07). Each must end up with the listed
// global defined; otherwise the vendored file failed to load (SRI mismatch,
// missing file, wrong path, etc.).
interface VendoredCheck {
  path: string;
  globals: string[];          // names that must be `typeof !== "undefined"`
  vendorFiles: string[];      // path substrings the page is expected to load
}

const VENDORED: VendoredCheck[] = [
  {
    path: "/Truthcert1/TruthCert-PairwisePro-v1.0-production.html",
    globals: ["Plotly", "jspdf", "html2canvas", "XLSX"],
    vendorFiles: [
      "shared/vendor/plotly-2.27.0.min.js",
      "shared/vendor/jspdf-2.5.1.umd.min.js",
      "shared/vendor/html2canvas-1.4.1.min.js",
      "shared/vendor/xlsx-0.18.5.full.min.js",
    ],
  },
  {
    path: "/IPD-Meta-Pro/Submission/ipd-meta-pro.html",
    globals: ["XLSX", "jspdf"],
    vendorFiles: [
      "shared/vendor/xlsx-0.18.5.full.min.js",
      "shared/vendor/jspdf-2.5.1.umd.min.js",
    ],
  },
  {
    path: "/HTA/index.html",
    globals: ["JSZip", "Chart", "d3"],
    vendorFiles: [
      "shared/vendor/jszip-3.10.1.min.js",
      "shared/vendor/chart-4.4.1.umd.min.js",
      "shared/vendor/d3-7.9.0.min.js",
    ],
  },
  {
    path: "/HTA/Submission/index.html",
    globals: ["JSZip", "Chart", "d3"],
    vendorFiles: [
      "shared/vendor/jszip-3.10.1.min.js",
      "shared/vendor/chart-4.4.1.umd.min.js",
      "shared/vendor/d3-7.9.0.min.js",
    ],
  },
  {
    path: "/nma-dose-response-app/index.html",
    globals: ["Chart", "docx"],
    vendorFiles: [
      "shared/vendor/chart-4.4.1.umd.min.js",
      "shared/vendor/docx-7.1.0.js",
    ],
  },
  {
    path: "/nma-dose-response-app/Submission/index.html",
    globals: ["Chart", "docx"],
    vendorFiles: [
      "shared/vendor/chart-4.4.1.umd.min.js",
      "shared/vendor/docx-7.1.0.js",
    ],
  },
  {
    path: "/dosehtml/dose-response-pro-v19.0.html",
    globals: ["Plotly"],
    vendorFiles: ["shared/vendor/plotly-2.27.0.min.js"],
  },
  {
    path: "/nma-pro-v2/nma-pro-v8.0.html",
    globals: ["Plotly"],
    vendorFiles: ["shared/vendor/plotly-2.35.0.min.js"],
  },
];

// All ma-studies-v1 bus participants — refactored + newly-wired + helper-only.
// Each must end with window.MaStudies defined.
const BUS_APPS: string[] = [
  // refactored (C-1)
  "/bayesian-ma/", "/cumulative-subgroup/", "/forest-plot/", "/funnel-plot/",
  "/heterogeneity/", "/meta-regression/", "/rct-extractor/", "/tsa/",
  "/webr-validator/", "/workbench/",
  // fully wired (C-2)
  "/influence/", "/gosh/", "/gosh-metareg/", "/pet-peese/", "/pubbias-tests/",
  "/copas/", "/limit-ma/", "/bayesian-mcmc/",
  // helper-only (data shape doesn't match contract, but include must load)
  "/bayesian-nma/", "/bucher/", "/component-nma/", "/dta-sroc/",
  "/effect-size-converter/", "/hsroc/", "/mcid/", "/median-to-mean/",
  "/mh-peto/", "/multilevel-ma/", "/nma/", "/nma-dose-response-app/",
  "/nma-global-inconsistency/", "/nma-inconsistency/", "/nma-pro-v2/",
  "/p-curve/", "/powerma/", "/proportion-ma/",
];

// Console-error patterns that are pre-existing or environmental, not regressions.
const BENIGN_CONSOLE: RegExp[] = [
  /favicon\.ico/i,
  /frame-ancestors.*ignored/i,
  /ERR_CONNECTION_REFUSED/i,           // localhost probes when optional services off
  /Failed to fetch/i,
  /Service Worker registration failed/i,
  /SecurityError.*storage access/i,
];

// Network-failure patterns that are benign (same reasoning).
const BENIGN_NETFAIL: RegExp[] = [
  /favicon\.ico/i,
  /127\.0\.0\.1:8000/,                 // rct-extractor optional Python backend
  /127\.0\.0\.1:11434/,                // ollama
  // Pre-existing missing modules in /Submission/ packaging — long-standing
  // issues with how the submission copies were assembled (parent app's
  // src/ + dev/ + js/ folders weren't copied into Submission/). Not caused
  // by V9-E07 vendoring; do not regress on this.
  /\/Submission\/(dev|src|js)\/.*\.js$/,
  /\/Submission\/.*\.wasm$/,            // pre-existing missing wasm in Submission packaging
  /\/Submission\/.*\.css$/,             // same — missing optional stylesheets
];

function instrument(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const sriFailures: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const txt = msg.text();
      if (/integrity|SRI|Subresource Integrity/i.test(txt)) {
        sriFailures.push(txt);
      }
      if (!BENIGN_CONSOLE.some(re => re.test(txt))) {
        consoleErrors.push(txt);
      }
    }
  });
  page.on("requestfailed", (req: Request) => {
    const url = req.url();
    const fail = req.failure()?.errorText ?? "unknown";
    if (!BENIGN_NETFAIL.some(re => re.test(url))) {
      failedRequests.push(`${url}  -> ${fail}`);
    }
  });
  page.on("pageerror", err => {
    consoleErrors.push(`pageerror: ${err.message}`);
  });

  return { consoleErrors, failedRequests, sriFailures };
}

// ---- Vendored apps ---------------------------------------------------------

for (const v of VENDORED) {
  test(`vendored: ${v.path}`, async ({ page }) => {
    const probes = instrument(page);
    const seenVendor = new Set<string>();
    page.on("response", res => {
      const u = res.url();
      for (const vf of v.vendorFiles) {
        if (u.includes(vf)) seenVendor.add(vf);
      }
    });

    await page.goto(v.path, { waitUntil: "load" });
    // Give MCMC / Plotly bootstrap a moment to settle.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    // Every vendored file the page advertised must have been requested AND
    // returned. (Missing = wrong path; failed = SRI mismatch.)
    for (const vf of v.vendorFiles) {
      expect.soft(seenVendor.has(vf), `${vf} was not loaded by ${v.path}`).toBeTruthy();
    }

    // Each global must be defined post-load. If SRI fails, the script is
    // dropped and the global is undefined.
    for (const g of v.globals) {
      const defined = await page.evaluate((name) => {
        const w = window as unknown as Record<string, unknown>;
        return typeof w[name] !== "undefined";
      }, g);
      expect.soft(defined, `${g} is not defined after loading ${v.path}`).toBeTruthy();
    }

    // SRI failure = vendor file integrity hash drift — always fatal.
    expect(probes.sriFailures, `SRI failures for ${v.path}`).toEqual([]);

    // /Submission/ folders have long-standing packaging issues (missing
    // wasm, missing src/dev/js modules, optional CSS 404s — not caused by
    // vendoring). Soft-warn but don't fail those.
    if (v.path.includes("/Submission/")) {
      if (probes.failedRequests.length || probes.consoleErrors.length) {
        console.warn(`[soft] ${v.path}: pre-existing submission packaging noise — ${probes.failedRequests.length} netfails, ${probes.consoleErrors.length} console errors`);
      }
    } else {
      expect(probes.failedRequests, `failed requests for ${v.path}`).toEqual([]);
      expect(probes.consoleErrors, `console errors for ${v.path}`).toEqual([]);
    }
  });
}

// ---- Bus apps: MaStudies must load ----------------------------------------

for (const p of BUS_APPS) {
  test(`bus participant: ${p}`, async ({ page }) => {
    const probes = instrument(page);
    await page.goto(p, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    const hasHelper = await page.evaluate(() => {
      const w = window as unknown as {
        MaStudies?: { read?: unknown; write?: unknown; attachButtons?: unknown };
      };
      const m = w.MaStudies;
      return !!m && typeof m.read === "function"
                && typeof m.write === "function"
                && typeof m.attachButtons === "function";
    });
    expect(hasHelper, `MaStudies helper missing/incomplete at ${p}`).toBeTruthy();

    expect(probes.sriFailures, `SRI failures for ${p}`).toEqual([]);
    expect(probes.consoleErrors, `console errors for ${p}`).toEqual([]);
  });
}

// ---- nma-pro-v2 drill: plots must actually render --------------------------
//
// User report (2026-05-24): "as i think in nma pro expacially they done always
// diplay". Investigation showed plots DO render correctly when data is loaded
// — the "Run Analysis" button refuses to run with <2 studies, which leaves all
// .plot-container divs empty. So this drill loads demo data first, then asserts
// plots render. If this passes but the user still sees empty plots, the issue
// is UX (no toast/copy explaining the empty state), not pipeline.

test("nma-pro-v2: monolith renders plots after loading demo data + clicking Run Analysis", async ({ page }) => {
  test.setTimeout(120_000);
  const probes = instrument(page);
  await page.goto("/nma-pro-v2/nma-pro-v8.0.html", { waitUntil: "load" });

  // Plotly (vendored) loads.
  await page.waitForFunction(
    () => typeof (window as unknown as { Plotly?: unknown }).Plotly !== "undefined",
    null,
    { timeout: 15_000 },
  );

  // loadDemo is a top-level `function` declaration in the monolith, so it's
  // on window. (BenchmarkDatasets is `const` and is NOT on window.)
  await page.evaluate(() => {
    const w = window as unknown as { loadDemo?: () => unknown };
    if (typeof w.loadDemo === "function") w.loadDemo();
  });

  // Sanity: AppState.studies populated.
  const studyCount = await page.evaluate(() => {
    const w = window as unknown as { AppState?: { studies?: unknown[] } };
    return w.AppState?.studies?.length ?? 0;
  });
  expect(studyCount, "loadDemo failed to populate AppState.studies").toBeGreaterThanOrEqual(2);

  // Trigger the canonical Run Analysis.
  await page.click("#runAnalysisBtn");

  // Wait up to 60 s for at least one plot to render. Each .plot-container
  // gets a child .main-svg once Plotly.newPlot completes.
  await page.waitForFunction(() => {
    const cs = document.querySelectorAll(".plot-container");
    return Array.from(cs).some(c => c.querySelector(".main-svg"));
  }, null, { timeout: 60_000 });

  const populated = await page.locator(".plot-container").evaluateAll(els =>
    els.filter(el => !!el.querySelector(".main-svg")).map(el => el.id),
  );
  expect(populated.length, `expected ≥1 populated plot; got: ${JSON.stringify(populated)}`).toBeGreaterThan(0);

  expect(probes.sriFailures).toEqual([]);
  if (probes.consoleErrors.length) {
    console.warn("nma-pro-v2 console errors (non-fatal):", probes.consoleErrors);
  }
});
