import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, "artifacts/e2e");
if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });

const EXTRACTOR_URL = "http://127.0.0.1:8000";
const OLLAMA_URL = "http://127.0.0.1:11434";

let extractorUp = false;
let ollamaUp = false;
let ollamaModels: string[] = [];

test.beforeAll(async () => {
  try {
    const r = await fetch(`${EXTRACTOR_URL}/health`);
    extractorUp = r.ok;
  } catch { extractorUp = false; }
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (r.ok) {
      ollamaUp = true;
      const j = await r.json();
      ollamaModels = (j.models || []).map((m: any) => m.name);
    }
  } catch { ollamaUp = false; }
  console.log(`[e2e-local] extractor=${extractorUp} ollama=${ollamaUp} models=${ollamaModels.length}`);
});

test("Local AI setup page reports Ollama state accurately", async ({ page }) => {
  test.skip(!ollamaUp, "Ollama not running — start it with OLLAMA_ORIGINS set to the test origin");
  await page.goto("/local-ai/");
  await page.waitForSelector("#status-card", { timeout: 10_000 });
  // Wait for detect() to resolve
  await page.waitForFunction(() => {
    const lbl = document.getElementById("status-lbl")?.textContent || "";
    return lbl.includes("detected") || lbl.includes("Not");
  }, { timeout: 15_000 });
  const card = await page.locator("#status-card").getAttribute("class");
  expect(card).toContain("ok");
  const lbl = await page.locator("#status-lbl").textContent();
  console.log(`  local-ai label: ${lbl}`);
  expect(lbl).toContain("detected");
  await page.screenshot({ path: resolve(artifactsDir, "local-ai.png"), fullPage: true });
});

test("RCT Extractor — regex extraction from default demo text", async ({ page }) => {
  test.skip(!extractorUp, "rct-extractor not running on :8000");
  await page.goto("/rct-extractor/");
  await page.waitForSelector("#api-status", { timeout: 10_000 });
  // API pill should go green
  await expect(page.locator("#api-status")).toHaveClass(/ok/, { timeout: 10_000 });
  // Text area has the demo — click Extract
  await page.locator("#btn-run").click();
  // Wait for at least one row with effect type
  await page.waitForFunction(() => {
    const body = document.getElementById("res-body");
    if (!body) return false;
    return body.querySelectorAll("tr").length >= 1 && /\bHR\b|\bOR\b|\bRR\b/.test(body.textContent || "");
  }, { timeout: 20_000 });
  const rowsText = await page.locator("#res-body").textContent();
  console.log(`  rct-extractor rows: ${rowsText?.slice(0, 200)}`);
  // The demo mentions "hazard ratio 0.75" — assert we find an HR row with 0.75
  expect(rowsText).toContain("HR");
  expect(rowsText).toMatch(/0\.7[45]/);
  await page.screenshot({ path: resolve(artifactsDir, "rct-extractor-regex.png"), fullPage: true });
});

test("RCT Extractor — Ollama consensus path (if a model is installed)", async ({ page }) => {
  test.skip(!extractorUp || !ollamaUp, "need both services");
  test.skip(ollamaModels.length === 0, "no Ollama models installed — run `ollama pull llama3.2:3b` first");
  test.setTimeout(240_000);  // CPU inference on a 3B model can take ~90-180s per call
  await page.goto("/rct-extractor/");
  await expect(page.locator("#api-status")).toHaveClass(/ok/, { timeout: 10_000 });
  await expect(page.locator("#llm-status")).toHaveClass(/ok/, { timeout: 10_000 });
  await page.locator("#use-llm").check();
  await page.locator("#btn-run").click();
  // LLM call can take a while — up to 120s for a CPU inference on 8B
  await page.waitForFunction(() => {
    const host = document.getElementById("consensus-wrap");
    return host && host.querySelectorAll("tr.consensus").length >= 1;
  }, { timeout: 180_000 });
  const consensus = await page.locator("#consensus-wrap").textContent();
  console.log(`  consensus: ${consensus?.slice(0, 200)}`);
  expect(consensus).toMatch(/within 5%|disagreement|no match/);
  await page.screenshot({ path: resolve(artifactsDir, "rct-extractor-consensus.png"), fullPage: true });
});

test("PICO Formulator — LocalLLM panel renders and detects Ollama", async ({ page }) => {
  test.skip(!ollamaUp, "Ollama not running");
  await page.goto("/pico/");
  // Panel is in #ai-host, added by the script at end of page
  await page.waitForSelector(".localllm-panel", { timeout: 10_000 });
  // Status badge should go to "N model(s)" or similar
  await page.waitForFunction(() => {
    const s = document.querySelector(".localllm-panel .localllm-status")?.textContent || "";
    return s.includes("model") || s.includes("not detected");
  }, { timeout: 15_000 });
  const status = await page.locator(".localllm-panel .localllm-status").textContent();
  console.log(`  PICO AI status: ${status}`);
  expect(status).toContain("model");
  await page.screenshot({ path: resolve(artifactsDir, "pico-ai.png"), fullPage: true });
});

test("Effect-Size Converter — LocalLLM panel renders", async ({ page }) => {
  test.skip(!ollamaUp, "Ollama not running");
  await page.goto("/effect-size-converter/");
  await page.waitForSelector(".localllm-panel", { timeout: 10_000 });
  await page.waitForFunction(() => {
    const s = document.querySelector(".localllm-panel .localllm-status")?.textContent || "";
    return s.includes("model") || s.includes("not detected");
  }, { timeout: 15_000 });
  const status = await page.locator(".localllm-panel .localllm-status").textContent();
  console.log(`  Effect-Size AI status: ${status}`);
  expect(status).toContain("model");
  await page.screenshot({ path: resolve(artifactsDir, "effect-size-ai.png"), fullPage: true });
});

test("PICO Formulator — round-trip extraction (if model available)", async ({ page }) => {
  test.skip(!ollamaUp || ollamaModels.length === 0, "need an Ollama model — run `ollama pull llama3.2:3b`");
  test.setTimeout(240_000);
  await page.goto("/pico/");
  await page.waitForSelector(".localllm-panel");
  // Open the panel
  await page.locator(".localllm-panel summary").click();
  // Paste an abstract into the localllm input
  const abstract = "We conducted a randomized controlled trial in 4744 adults with heart failure and reduced ejection fraction comparing empagliflozin 10 mg once daily to placebo over 16 months. The primary outcome was cardiovascular death or hospitalization for heart failure.";
  await page.locator(".localllm-input").fill(abstract);
  await page.locator(".localllm-run").click();
  // Wait for the JSON response; model may take up to 180s on CPU
  await page.waitForFunction(() => {
    const out = document.querySelector(".localllm-panel .localllm-out")?.textContent || "";
    return out.startsWith("{") || out.includes("Error");
  }, { timeout: 180_000 });
  const out = await page.locator(".localllm-panel .localllm-out").textContent();
  console.log(`  PICO LLM output: ${out?.slice(0, 200)}`);
  expect(out).toMatch(/\{[\s\S]*\}/);
  // Form fields should have been populated
  const P = await page.locator("#P").inputValue();
  console.log(`  P field: ${P?.slice(0, 100)}`);
  expect(P.length).toBeGreaterThan(5);
  await page.screenshot({ path: resolve(artifactsDir, "pico-extracted.png"), fullPage: true });
});
