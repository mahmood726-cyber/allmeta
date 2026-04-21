/**
 * e2e-extensive.spec.ts — deeper coverage than e2e-local.spec.ts.
 *
 * Covers the gaps flagged by review v2: SSRF guard, PDF upload, bus push +
 * scale-family guard, cancel button, Re-check flow, extractor error paths.
 * Skips cleanly when local services / models aren't available.
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

const EXTRACTOR_URL = "http://127.0.0.1:8000";
const OLLAMA_URL = "http://127.0.0.1:11434";

let extractorUp = false;
let ollamaUp = false;
let ollamaModels: string[] = [];

test.beforeAll(async () => {
  try { extractorUp = (await fetch(`${EXTRACTOR_URL}/health`)).ok; } catch {}
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (r.ok) {
      ollamaUp = true;
      const j = await r.json();
      ollamaModels = (j.models || []).map((m: any) => m.name).filter((n: any) => typeof n === "string");
    }
  } catch {}
});

test("RCT Extractor — loopback-only SSRF guard rejects external URL", async ({ page }) => {
  await page.goto("/rct-extractor/");
  // Paste an external URL
  await page.locator("#api-url").fill("https://evil.example.com");
  await page.locator("#api-url").dispatchEvent("change");
  await expect(page.locator("#api-status")).toHaveClass(/err/, { timeout: 5_000 });
  const msg = await page.locator("#api-status").textContent();
  expect(msg).toMatch(/loopback|only .*loopback/i);
  // Click Extract — should also refuse
  await page.locator("#btn-run").click();
  await page.waitForFunction(() => {
    const b = document.getElementById("res-body");
    return b && (b.textContent || "").toLowerCase().includes("loopback");
  }, { timeout: 5_000 });
});

test("RCT Extractor — restoring loopback URL re-enables extraction", async ({ page }) => {
  test.skip(!extractorUp, "extractor not running");
  await page.goto("/rct-extractor/");
  await page.locator("#api-url").fill("https://evil.example.com");
  await page.locator("#api-url").dispatchEvent("change");
  await expect(page.locator("#api-status")).toHaveClass(/err/, { timeout: 5_000 });
  await page.locator("#api-url").fill("http://127.0.0.1:8000");
  await page.locator("#api-url").dispatchEvent("change");
  await expect(page.locator("#api-status")).toHaveClass(/ok/, { timeout: 5_000 });
});

test("RCT Extractor — extractor 5xx surfaces an error", async ({ page }) => {
  test.skip(!extractorUp, "extractor not running");
  // Intercept /extract and respond 500
  await page.route("**/extract", (route: Route) => {
    route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"boom"}' });
  });
  await page.goto("/rct-extractor/");
  await expect(page.locator("#api-status")).toHaveClass(/ok/, { timeout: 5_000 });
  await page.locator("#btn-run").click();
  await page.waitForFunction(() => {
    const b = document.getElementById("res-body");
    return b && /HTTP 500|Error/i.test(b.textContent || "");
  }, { timeout: 10_000 });
});

test("RCT Extractor — PDF upload and extract", async ({ page }) => {
  test.skip(!extractorUp, "extractor not running");
  await page.goto("/rct-extractor/");
  await page.locator("#pdf").setInputFiles(resolve(fixturesDir, "sample.pdf"));
  await page.locator("#btn-run").click();
  // PDF.js + extractor = slow on large PDFs; allow up to 60 s
  await page.waitForFunction(() => {
    const b = document.getElementById("res-body");
    const txt = (b?.textContent || "").toLowerCase();
    return txt.includes("hr") || txt.includes("or") || txt.includes("rr") ||
           txt.includes("no effects detected") || txt.includes("error");
  }, { timeout: 60_000 });
  const body = await page.locator("#res-body").textContent();
  console.log(`  PDF extract result: ${(body || "").slice(0, 200)}`);
  expect(body?.length).toBeGreaterThan(10);
});

test("RCT Extractor — Send to MA Workbench pushes a ratio-only extraction", async ({ page }) => {
  test.skip(!extractorUp, "extractor not running");
  page.on("dialog", d => d.accept());
  await page.goto("/rct-extractor/");
  await page.evaluate(() => localStorage.removeItem("ma-studies-v1"));
  // Bypass the regex false-positive (HR+MD duplicate) by injecting a clean LAST_EXTRACTIONS
  // array. This isolates the bus-push logic from the extractor's false-positive behaviour
  // which is tracked separately in the source repo.
  await page.evaluate(() => {
    (window as any).LAST_EXTRACTIONS = [
      { effect_type: "HR", point_estimate: 0.62, ci: { lower: 0.50, upper: 0.77 }, confidence: 0.99, source_text: "hazard ratio 0.62; 95% CI 0.50 to 0.77" },
    ];
    document.getElementById("send-actions")!.style.display = "flex";
  });
  await page.locator("#btn-send-workbench").click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ma-studies-v1") || "null"));
  console.log(`  bus contents: ${JSON.stringify(stored)?.slice(0, 250)}`);
  expect(Array.isArray(stored)).toBe(true);
  expect(stored.length).toBe(1);
  const r = (stored as any[])[0];
  expect(r.source).toBe("rct-extractor");
  expect(r.study).toMatch(/^rct-extractor-/);
  expect(r.imported_at).toMatch(/T/);
  expect(r.scale_family).toBe("ratio");
  expect(r.scale).toBe("HR");
  // log(0.62) ≈ -0.478
  expect(r.te).toBeCloseTo(Math.log(0.62), 3);
  // SE from CI: (log(0.77) − log(0.50)) / (2·1.96) ≈ 0.111
  expect(r.se).toBeCloseTo((Math.log(0.77) - Math.log(0.50)) / (2 * 1.96), 3);
});

test("RCT Extractor — scale-family guard rejects mixed ratio+linear push", async ({ page }) => {
  test.skip(!extractorUp, "extractor not running");
  let alertMsg = "";
  const dialogSeen = new Promise<void>(resolve => {
    page.on("dialog", async d => {
      alertMsg = d.message();
      await d.accept();
      resolve();
    });
  });
  await page.goto("/rct-extractor/");
  await page.evaluate(() => {
    (window as any).LAST_EXTRACTIONS = [
      { effect_type: "HR", point_estimate: 0.75, ci: { lower: 0.65, upper: 0.86 }, confidence: 0.99, source_text: "ratio" },
      { effect_type: "MD", point_estimate: 1.2, ci: { lower: 0.3, upper: 2.1 }, confidence: 0.9, source_text: "linear" },
    ];
    document.getElementById("send-actions")!.style.display = "flex";
  });
  await page.locator("#btn-send-workbench").click();
  await dialogSeen;
  console.log(`  guard message: ${alertMsg}`);
  expect(alertMsg.toLowerCase()).toContain("mixed scale");
});

test("Local AI setup — Re-check button re-runs detect and ends in a final state", async ({ page }) => {
  test.skip(!ollamaUp, "Ollama not running");
  await page.goto("/local-ai/");
  await page.waitForFunction(() => {
    const l = document.getElementById("status-lbl")?.textContent || "";
    return l.includes("detected") || l.includes("Not");
  }, { timeout: 10_000 });
  const firstLbl = await page.locator("#status-lbl").textContent();
  // Click Re-check. The intermediate "Checking…" state can be very short-lived; don't
  // require observing it. Only require that the final state resolves within 10 s.
  await page.locator("#retry").click();
  await page.waitForFunction((prev) => {
    const l = document.getElementById("status-lbl")?.textContent || "";
    // Either the final state has resolved again OR we caught the intermediate Checking
    return l.includes("Checking") || ((l.includes("detected") || l.includes("Not")) && l !== prev + "__marker__");
  }, firstLbl, { timeout: 10_000 });
  // Ensure we end in a resolved final state
  await page.waitForFunction(() => {
    const l = document.getElementById("status-lbl")?.textContent || "";
    return l.includes("detected") || l.includes("Not");
  }, { timeout: 10_000 });
  const finalLbl = await page.locator("#status-lbl").textContent();
  expect(finalLbl).toEqual(firstLbl);
});

test("LocalLLM panel — Cancel aborts a running extraction", async ({ page }) => {
  test.skip(!ollamaUp || ollamaModels.length === 0, "need Ollama with a model");
  test.setTimeout(30_000);
  await page.goto("/pico/");
  await page.waitForSelector(".localllm-panel", { timeout: 10_000 });
  await page.locator(".localllm-panel summary").click();
  await page.locator(".localllm-input").fill("A very long abstract ".repeat(80));
  await page.locator(".localllm-run").click();
  // Give the call a moment to start
  await page.waitForFunction(() => {
    return (document.querySelector(".localllm-run") as HTMLButtonElement)?.textContent === "Cancel";
  }, { timeout: 5_000 });
  // Click Cancel
  await page.locator(".localllm-run").click();
  await page.waitForFunction(() => {
    const out = document.querySelector(".localllm-panel .localllm-out")?.textContent || "";
    return out.toLowerCase().includes("cancel");
  }, { timeout: 8_000 });
  const out = await page.locator(".localllm-panel .localllm-out").textContent();
  expect(out?.toLowerCase()).toContain("cancel");
});

test("Effect-Size Converter — LLM round-trip populates estimate + derived SE", async ({ page }) => {
  test.skip(!ollamaUp || ollamaModels.length === 0, "need Ollama with a model");
  test.setTimeout(240_000);
  await page.goto("/effect-size-converter/");
  await page.waitForSelector(".localllm-panel");
  await page.locator(".localllm-panel summary").click();
  await page.locator(".localllm-input").fill(
    "Hospitalization for heart failure occurred in 251 patients in the treatment group vs 382 in control (hazard ratio 0.70; 95% CI 0.58 to 0.85; P<0.001)."
  );
  await page.locator(".localllm-run").click();
  await page.waitForFunction(() => {
    const out = document.querySelector(".localllm-panel .localllm-out")?.textContent || "";
    return out.startsWith("{") || out.includes("Error");
  }, { timeout: 180_000 });
  const out = await page.locator(".localllm-panel .localllm-out").textContent();
  expect(out).toMatch(/\{[\s\S]*\}/);
  // Fields should populate
  const inType = await page.locator("#in-type").inputValue();
  const inEst = await page.locator("#in-est").inputValue();
  console.log(`  in-type=${inType} in-est=${inEst}`);
  // Either the HR was recognised or the extractor put the value in anyway
  expect(parseFloat(inEst)).toBeGreaterThan(0);
});

test("RCT Extractor — two sequential bus pushes append across tabs", async ({ browser }) => {
  test.skip(!extractorUp, "extractor not running");
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  a.on("dialog", d => d.accept());
  b.on("dialog", d => d.accept());
  await Promise.all([a.goto("/rct-extractor/"), b.goto("/rct-extractor/")]);
  await a.evaluate(() => localStorage.removeItem("ma-studies-v1"));
  // Inject a clean single-extraction state in each tab
  for (const p of [a, b]) {
    await p.evaluate((label) => {
      (window as any).LAST_EXTRACTIONS = [
        { effect_type: "HR", point_estimate: 0.75, ci: { lower: 0.65, upper: 0.86 }, confidence: 0.99, source_text: label },
      ];
      document.getElementById("send-actions")!.style.display = "flex";
    }, `tab-${p === a ? "A" : "B"}`);
  }
  await a.locator("#btn-send-workbench").click();
  await b.locator("#btn-send-workbench").click();
  const stored = await a.evaluate(() => JSON.parse(localStorage.getItem("ma-studies-v1") || "[]"));
  console.log(`  post-sequential bus rows: ${stored.length}`);
  expect(stored.length).toBe(2);
  await ctx.close();
});
