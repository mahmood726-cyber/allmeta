import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { INTERNAL_APPS } from "./apps";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, "artifacts");
if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });

const PLOT_SELECTOR = [
  "canvas",
  "svg:not([width='0']):not([height='0'])",
  ".plotly",
  ".js-plotly-plot",
  "[id*='chart']",
  "[id*='plot']",
].join(", ");

const DEMO_BUTTON_RE = /load\s*(demo|example|data)|^\s*(run|calculate|analy[sz]e|plot|compute)\s*$/i;

interface Row {
  app: string;
  path: string;
  status: "pass" | "fail-load" | "fail-plot-missing" | "fail-console-error";
  duration_ms: number;
  console_errors: string[];
  clicked_demo: boolean;
  notes: string;
}

const results: Row[] = [];

test.afterAll(async () => {
  writeFileSync(
    resolve(artifactsDir, "summary.json"),
    JSON.stringify(results, null, 2),
  );
  const table = results.map(r => `${r.status.padEnd(22)} ${r.app}`).join("\n");
  writeFileSync(resolve(artifactsDir, "summary.txt"), table);
});

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
      results.push({
        app: app.name, path: app.path, status: "fail-load",
        duration_ms: Date.now() - started,
        console_errors: consoleErrors, clicked_demo: false, notes: loadError,
      });
      await page.screenshot({ path: resolve(artifactsDir, `${app.slug}.png`), fullPage: true })
        .catch(() => { /* page may be in a bad state */ });
      test.fail(true, `Load failed: ${loadError}`);
      return;
    }

    let plotCount = await countPlots(page);
    if (plotCount === 0) {
      const button = await page.locator("button, input[type=button], input[type=submit]")
        .filter({ hasText: DEMO_BUTTON_RE })
        .first();
      if (await button.count() > 0) {
        await button.click({ timeout: 2_000 }).catch(() => {});
        await page.waitForTimeout(3_000);
        clicked = true;
        plotCount = await countPlots(page);
      }
    }

    await page.screenshot({ path: resolve(artifactsDir, `${app.slug}.png`), fullPage: true });

    if (consoleErrors.length > 0) {
      results.push({
        app: app.name, path: app.path, status: "fail-console-error",
        duration_ms: Date.now() - started,
        console_errors: consoleErrors, clicked_demo: clicked, notes: "",
      });
      test.fail(true, `Console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
      return;
    }

    if (plotCount === 0) {
      results.push({
        app: app.name, path: app.path, status: "fail-plot-missing",
        duration_ms: Date.now() - started,
        console_errors: [], clicked_demo: clicked,
        notes: "No plot surface found (canvas/svg/plotly/[id*=chart|plot]).",
      });
      test.fail(true, "No plot surface rendered.");
      return;
    }

    results.push({
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
