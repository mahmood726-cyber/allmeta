import { test, type ConsoleMessage } from "@playwright/test";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, "artifacts");
const rowsDir = resolve(artifactsDir, "rows");
if (!existsSync(rowsDir)) mkdirSync(rowsDir, { recursive: true });

interface ExternalApp {
  slug: string;
  name: string;
  fileUrl: string;
}

// Browser surfaces of repos that aren't in allmeta but the user wants stress-tested.
const EXTERNAL_APPS: ExternalApp[] = [
  {
    slug: "rct-extractor-v2",
    name: "rct-extractor-v2",
    fileUrl: "file:///C:/Projects/rct-extractor-v2/index.html",
  },
  {
    slug: "finrenone-rapidmeta-hub",
    name: "Finrenone (rapidmeta hub)",
    fileUrl: "file:///C:/Projects/Finrenone/index.html",
  },
  {
    slug: "metaextract",
    name: "MetaExtract",
    fileUrl: "file:///C:/Projects/MetaExtract/index.html",
  },
];

interface Row {
  app: string;
  url: string;
  status: "pass" | "fail-load" | "fail-console-error";
  duration_ms: number;
  console_errors: string[];
  page_title: string;
  notes: string;
}

const BENIGN_ERROR_PATTERNS: RegExp[] = [
  /favicon\.ico.*404/i,
  /deprecated|deprecation/i,
  /Failed to load resource.*404/i,        // file:// missing assets are noisy but mostly cosmetic
  /not allowed to load local resource/i,  // chromium file:// CORS — expected for some assets
];

// These are Windows-specific file:// URLs — skip on any non-Windows host (CI runners, etc.)
const IS_WINDOWS_HOST = process.platform === "win32";

for (const app of EXTERNAL_APPS) {
  test(`${app.name}`, async ({ page }) => {
    test.skip(!IS_WINDOWS_HOST, "external file:// URLs only reachable on the author's Windows machine");

    const started = Date.now();
    const consoleErrors: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err: Error) => {
      consoleErrors.push(`PAGEERROR: ${err.message}`);
    });

    let title = "";
    let loadError: string | null = null;
    try {
      await page.goto(app.fileUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
      // give the SPA up to 5 more seconds to finish bootstrapping
      await page.waitForTimeout(2000);
      title = (await page.title()).slice(0, 200);
    } catch (e) {
      loadError = (e as Error).message;
    }

    const filtered = consoleErrors.filter(
      e => !BENIGN_ERROR_PATTERNS.some(re => re.test(e))
    );

    let status: Row["status"] = "pass";
    let notes = "";
    if (loadError) {
      status = "fail-load";
      notes = loadError;
    } else if (filtered.length > 0) {
      status = "fail-console-error";
      notes = `${filtered.length} non-benign console errors`;
    }

    const row: Row = {
      app: app.name,
      url: app.fileUrl,
      status,
      duration_ms: Date.now() - started,
      console_errors: filtered.slice(0, 10),
      page_title: title,
      notes,
    };
    writeFileSync(resolve(rowsDir, `external-${app.slug}.json`), JSON.stringify(row, null, 2));
    await page.screenshot({ path: resolve(artifactsDir, `external-${app.slug}.png`), fullPage: true })
      .catch(() => { /* ignore */ });

    if (status !== "pass") {
      throw new Error(`${app.name}: ${status} — ${notes}`);
    }
  });
}
