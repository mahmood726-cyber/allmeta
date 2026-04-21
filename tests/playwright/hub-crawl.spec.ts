import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { INTERNAL_APPS } from "./apps";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, "artifacts");
const rowsDir = resolve(artifactsDir, "rows");
if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });
if (!existsSync(rowsDir)) mkdirSync(rowsDir, { recursive: true });

function writeRow(slug: string, row: Row): void {
  writeFileSync(resolve(rowsDir, `${slug}.json`), JSON.stringify(row, null, 2));
}

const PLOT_SELECTOR = [
  "canvas",
  "svg:not([width='0']):not([height='0'])",
  ".plotly",
  ".js-plotly-plot",
  "[id*='chart']",
  "[id*='plot']",
].join(", ");

const DEMO_BUTTON_RE = /load\s*(demo|example|data)|^\s*(run|calculate|analy[sz]e|plot|compute)\s*$/i;

// Known-benign console error substrings. Matched anywhere in the error text.
const BENIGN_ERROR_PATTERNS: RegExp[] = [
  /frame-ancestors.*ignored.*<meta>/i,           // CSP delivered via meta tag (harmless)
  /favicon\.ico.*404/i,                           // missing favicon
  /deprecated|deprecation/i,
  /ERR_CONNECTION_REFUSED/i,                      // local-service probes (Ollama :11434, rct-extractor :8000)
  /Failed to fetch/i,                             // same family, browser-reported
];

// Apps with known source defects that we ship anyway. Tests still record status
// rows but won't throw. Remove an entry here when the underlying source repo is fixed.
const KNOWN_SHIP_ANYWAY: Set<string> = new Set([
  "pairwise-ai",   // Main screen.html references ./Main screen_files/ which doesn't exist in source
  "rct-extractor", // probes http://127.0.0.1:8000 on load — connection refused when the Python server isn't running
]);

// Also filter localhost probe connection errors as benign — we expect them when optional
// local services (Ollama on :11434, rct-extractor on :8000) aren't started.
const BENIGN_LOCALHOST = /Failed to load resource.*ERR_CONNECTION_REFUSED|Fetch API.*Failed to fetch/;

function filterBenign(errors: string[]): string[] {
  return errors.filter(e => !BENIGN_ERROR_PATTERNS.some(re => re.test(e)));
}

interface Row {
  app: string;
  path: string;
  status: "pass" | "fail-load" | "fail-plot-missing" | "fail-console-error";
  duration_ms: number;
  console_errors: string[];
  clicked_demo: boolean;
  notes: string;
}

// Per-test rows are written to artifacts/rows/<slug>.json. A separate script
// concatenates them into summary.json after the run — this avoids the Playwright
// module-state / afterAll timing issues that caused only 2 rows to be captured.

for (const app of INTERNAL_APPS) {
  test(`${app.name}`, async ({ page }) => {
    const started = Date.now();
    const consoleErrors: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    let clicked = false;
    const normalizedPath = app.path.replace(/^\.\//, "/");
    let loadError: string | null = null;
    try {
      await page.goto(normalizedPath, { waitUntil: "networkidle", timeout: 15_000 });
    } catch (e) {
      loadError = (e as Error).message;
    }

    if (loadError) {
      writeRow(app.slug, {
        app: app.name, path: app.path, status: "fail-load",
        duration_ms: Date.now() - started,
        console_errors: consoleErrors, clicked_demo: false, notes: loadError,
      });
      await page.screenshot({ path: resolve(artifactsDir, `${app.slug}.png`), fullPage: true })
        .catch(() => { /* page may be in a bad state */ });
      throw new Error(`Load failed: ${loadError}`);
    }

    let plotCount = await countPlots(page);
    if (plotCount === 0) {
      const button = await page.locator("button, input[type=button], input[type=submit]")
        .filter({ hasText: DEMO_BUTTON_RE })
        .first();
      if (await button.count() > 0) {
        await button.click({ timeout: 2_000 }).catch(() => {});
        // Short-circuit as soon as a plot surface appears; fall through after ≤3s otherwise.
        await page.waitForSelector(PLOT_SELECTOR, { timeout: 3_000 }).catch(() => {});
        clicked = true;
        plotCount = await countPlots(page);
      }
    }

    await page.screenshot({ path: resolve(artifactsDir, `${app.slug}.png`), fullPage: true });

    const realErrors = filterBenign(consoleErrors);
    const shipAnyway = KNOWN_SHIP_ANYWAY.has(app.slug);

    if (realErrors.length > 0) {
      writeRow(app.slug, {
        app: app.name, path: app.path, status: "fail-console-error",
        duration_ms: Date.now() - started,
        console_errors: realErrors, clicked_demo: clicked,
        notes: shipAnyway ? "known ship-anyway; source defect" : "",
      });
      if (!shipAnyway) {
        throw new Error(`Console errors: ${realErrors.slice(0, 3).join(" | ")}`);
      }
      return;
    }

    if (plotCount === 0) {
      writeRow(app.slug, {
        app: app.name, path: app.path, status: "fail-plot-missing",
        duration_ms: Date.now() - started,
        console_errors: [], clicked_demo: clicked,
        notes: "No plot surface on landing — app likely needs user input to render.",
      });
      // fail-plot-missing does NOT throw — many apps legitimately have no plot until user input.
      return;
    }

    writeRow(app.slug, {
      app: app.name, path: app.path, status: "pass",
      duration_ms: Date.now() - started,
      console_errors: [], clicked_demo: clicked, notes: "",
    });
    expect(plotCount).toBeGreaterThan(0);
  });
}

async function countPlots(page: Page): Promise<number> {
  const handles = await page.locator(PLOT_SELECTOR).all();
  let count = 0;
  for (const h of handles) {
    const box = await h.boundingBox().catch(() => null);
    if (box && box.width >= 40 && box.height >= 40) count += 1;
  }
  return count;
}
