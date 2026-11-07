/**
 * Deployed-artifact crawl — smoke-tests the LIVE GitHub Pages site to catch
 * deploy-only regressions the local hub-crawl can't see: files missing from the
 * build, case-sensitivity breakage (Linux Pages vs the author's Windows), and
 * runtime console errors on the served bundle.
 *
 * Unlike hub-crawl.spec.ts (which serves the local checkout on :8088 with
 * domain-absolute paths), this crawls absolute URLs under the Pages SUBPATH:
 *   PAGES_BASE (default https://mahmood726-cyber.github.io/allmeta) + app.path
 *
 * Run with the no-webServer config (it hits the network, not a local server):
 *   PAGES_BASE=https://mahmood726-cyber.github.io/allmeta \
 *     npx playwright test --config=playwright.pages.config.ts
 *
 * Scheduled nightly by .github/workflows/nightly-pages-crawl.yml.
 */
import { test, expect, type ConsoleMessage } from "@playwright/test";
import { INTERNAL_APPS } from "./apps";
import { classifyAssetFailure } from "./pages-crawl-classify.cjs";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, "artifacts");
const rowsDir = resolve(artifactsDir, "rows-pages");
if (!existsSync(rowsDir)) mkdirSync(rowsDir, { recursive: true });

const PAGES_BASE = (process.env.PAGES_BASE || "https://mahmood726-cyber.github.io/allmeta")
  .replace(/\/+$/, "");

// Benign console patterns. Note: real missing-asset 404s are detected
// authoritatively via the response/requestfailed listeners below (page-initiated
// requests), so the generic "Failed to load resource ... 404" console line is
// benign here — on a deployed page that line is almost always the browser's
// implicit /favicon.ico request, which does NOT fire a page-level response event.
const BENIGN_ERROR_PATTERNS: RegExp[] = [
  /frame-ancestors.*ignored.*<meta>/i,
  /favicon\.ico/i,
  /deprecated|deprecation/i,
  /Failed to load resource/i,
];
const FAVICON_RE = /favicon\.ico/i;

// A failed request that is NOT a real deploy regression:
//  - favicon (browser-implicit, often absent per-app);
//  - localhost / 127.0.0.1 probes for optional local services (Ollama, the
//    rct-extractor sidecar) — can't and shouldn't resolve on the deployed site;
//  - net::ERR_ABORTED — the browser aborting a heavy in-flight bundle (e.g. the
//    Shinylive WASM payload) when the crawl settles; the asset itself is present;
//  - /dev/ and /tests/ artifacts — dev/validation files apps fetch for optional
//    panels and handle gracefully when absent; intentionally not in the Pages build.
function isBenignAsset(url: string, errText: string): boolean {
  if (FAVICON_RE.test(url)) return true;
  if (/127\.0\.0\.1|localhost/i.test(url)) return true;
  if (/ERR_ABORTED/i.test(errText)) return true;
  if (/\/dev\/|\/tests?\//i.test(url)) return true;
  return false;
}

// Known source defects shipped anyway (kept in sync with hub-crawl.spec.ts).
const KNOWN_SHIP_ANYWAY: Set<string> = new Set([
  "pairwise-ai",
  "rct-extractor",
]);

function filterBenign(errors: string[]): string[] {
  return errors.filter((e) => !BENIGN_ERROR_PATTERNS.some((re) => re.test(e)));
}

interface Row {
  app: string;
  url: string;
  status: "pass" | "fail-load" | "fail-http" | "fail-missing-asset" | "fail-console-error";
  http_status: number | null;
  duration_ms: number;
  console_errors: string[];
  missing_assets: string[];
  notes: string;
}
function writeRow(slug: string, row: Row): void {
  writeFileSync(resolve(rowsDir, `${slug}.json`), JSON.stringify(row, null, 2));
}

for (const app of INTERNAL_APPS) {
  test(`${app.name}`, async ({ page }) => {
    const started = Date.now();
    const url = `${PAGES_BASE}/${app.path.replace(/^\.\//, "")}`;
    const consoleErrors: string[] = [];
    const missingAssets: string[] = [];
    const assetNotes: string[] = [];
    const rechecks = new Map<string, { first: number | string; seenAt: number; checked: boolean }>();
    const notesWithAssets = (note = "") => [note, ...assetNotes].filter(Boolean).join("; ");
    const assetsIncludingPending = () => [
      ...missingAssets,
      ...[...rechecks].filter(([, failure]) => !failure.checked)
        .map(([assetUrl, failure]) => `${failure.first} ${assetUrl} (not re-checked)`),
    ];
    function recordAssetFailure(assetUrl: string, first: number | string): void {
      if (classifyAssetFailure(first) === "missing") {
        // Non-transient failures are final, including browser-policy blocks.
        missingAssets.push(`${first} ${assetUrl}`);
      } else if (!rechecks.has(assetUrl)) {
        rechecks.set(assetUrl, { first, seenAt: Date.now(), checked: false });
      }
    }
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    // Authoritative missing-asset detection: page-initiated requests that 404 (or
    // otherwise fail). The browser's implicit favicon request does NOT surface
    // here, so this cleanly separates real deploy regressions from favicon noise.
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url() !== url && !isBenignAsset(r.url(), "")) {
        recordAssetFailure(r.url(), r.status());
      }
    });
    page.on("requestfailed", (r) => {
      const errText = (r.failure() && r.failure()!.errorText) || "failed";
      if (!isBenignAsset(r.url(), errText)) {
        recordAssetFailure(r.url(), errText);
      }
    });

    let httpStatus: number | null = null;
    let loadError: string | null = null;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      httpStatus = resp ? resp.status() : null;
    } catch (e) {
      loadError = (e as Error).message;
    }

    if (loadError) {
      writeRow(app.slug, { app: app.name, url, status: "fail-load", http_status: httpStatus,
        duration_ms: Date.now() - started, console_errors: consoleErrors, missing_assets: assetsIncludingPending(), notes: notesWithAssets(loadError) });
      throw new Error(`Load failed: ${loadError}`);
    }
    // A deployed app that 404s (or any 4xx/5xx) is a real deploy regression
    // (renamed/missing file, case-sensitivity). GitHub Pages serves 404.html
    // with HTTP 404, so the status is authoritative.
    if (httpStatus !== null && httpStatus >= 400) {
      writeRow(app.slug, { app: app.name, url, status: "fail-http", http_status: httpStatus,
        duration_ms: Date.now() - started, console_errors: consoleErrors, missing_assets: assetsIncludingPending(),
        notes: notesWithAssets(`HTTP ${httpStatus} — file missing from deploy or path case mismatch`) });
      throw new Error(`HTTP ${httpStatus} for ${url}`);
    }

    // Let late requests/console errors surface, then evaluate.
    await page.waitForTimeout(800);
    // Re-check each failed URL once, at least two seconds after its first failure.
    // Drain failures arriving while checks are pending before writing the row.
    while ([...rechecks.values()].some((failure) => !failure.checked)) {
      await Promise.all([...rechecks.entries()].filter(([, failure]) => !failure.checked)
        .map(async ([assetUrl, failure]) => {
          failure.checked = true;
          await page.waitForTimeout(Math.max(0, 2_000 - (Date.now() - failure.seenAt)));
          let outcome: number | string;
          try {
            const response = await page.request.get(assetUrl, {
              headers: { "Cache-Control": "no-cache, no-store", Pragma: "no-cache" },
              timeout: 5_000,
              maxRetries: 0,
              failOnStatusCode: false,
            });
            outcome = response.status();
            await response.dispose();
          } catch (error) {
            outcome = error instanceof Error ? error.message : String(error);
          }
          const recovered = classifyAssetFailure(failure.first, outcome) === "transient";
          const detail = recovered
            ? `transient ${failure.first} recovered on re-check (${outcome}) ${assetUrl}`
            : `${failure.first} ${assetUrl}; re-check failed (${outcome})`;
          assetNotes.push(detail);
          if (!recovered) missingAssets.push(detail);
        }));
    }
    const shipAnyway = KNOWN_SHIP_ANYWAY.has(app.slug);

    // Non-transient failures or a failed re-check are deployed-asset failures.
    if (missingAssets.length > 0 && !shipAnyway) {
      writeRow(app.slug, { app: app.name, url, status: "fail-missing-asset", http_status: httpStatus,
        duration_ms: Date.now() - started, console_errors: filterBenign(consoleErrors), missing_assets: missingAssets,
        notes: notesWithAssets("asset(s) had a non-transient failure or failed re-check on the deployed site") });
      throw new Error(`Missing deployed asset(s): ${missingAssets.slice(0, 3).join(" | ")}`);
    }

    const realErrors = filterBenign(consoleErrors);
    if (realErrors.length > 0) {
      writeRow(app.slug, { app: app.name, url, status: "fail-console-error", http_status: httpStatus,
        duration_ms: Date.now() - started, console_errors: realErrors, missing_assets: missingAssets,
        notes: notesWithAssets(shipAnyway ? "known ship-anyway; source defect" : "") });
      if (!shipAnyway) throw new Error(`Console errors: ${realErrors.slice(0, 3).join(" | ")}`);
      return;
    }

    writeRow(app.slug, { app: app.name, url, status: "pass", http_status: httpStatus,
      duration_ms: Date.now() - started, console_errors: [], missing_assets: missingAssets, notes: notesWithAssets() });
    expect(httpStatus === null || httpStatus < 400).toBeTruthy();
  });
}
