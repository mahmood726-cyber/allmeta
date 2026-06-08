// Screen app — optional AI assist: handoff prompt/export, results import
// round-trip, malformed/partial-result handling, confidence clamping, and
// API-key hygiene (localStorage-only, never in project exports).
import { test, expect } from "@playwright/test";

const APP = "/screen/index.html";
async function hook(page) {
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__almScreenpro);
}

const UNDECIDED = [
  { id: "r1", title: "Dapagliflozin in heart failure", abstract: "A randomized trial.", year: "2019", journal: "NEJM" },
  { id: "r2", title: "SGLT2 inhibition in mice", abstract: "Animal study.", year: "2020", journal: "JMCC" },
];

test("aiPrompt contains the strict schema and every undecided record id", async ({ page }) => {
  await hook(page);
  const prompt = await page.evaluate((recs) => {
    window.__almScreenpro.setState({ title: "SGLT2 review", incTerms: ["SGLT2"], excTerms: ["animal"], records: recs });
    return window.__almScreenpro.aiPrompt();
  }, UNDECIDED);
  expect(prompt).toContain("include|exclude|maybe");
  expect(prompt).toContain("screen-ai-results.json");
  expect(prompt).toContain("r1");
  expect(prompt).toContain("r2");
  expect(prompt).toContain("SGLT2"); // include term surfaced as a cue
});

test("import round-trip applies valid suggestions to matching ids", async ({ page }) => {
  await hook(page);
  const out = await page.evaluate((recs) => {
    window.__almScreenpro.setState({ records: recs });
    const n = window.__almScreenpro.aiApply([
      { id: "r1", suggestion: "include", confidence: 0.92, rationale: "On-topic HF RCT." },
      { id: "r2", suggestion: "exclude", confidence: 0.8, rationale: "Animal model." },
    ]);
    return {
      n,
      r1: window.__almScreenpro.recordById("r1"),
      r2: window.__almScreenpro.recordById("r2"),
    };
  }, UNDECIDED);
  expect(out.n).toBe(2);
  expect(out.r1.aiSuggestion).toBe("include");
  expect(out.r1.aiConfidence).toBeCloseTo(0.92, 6);
  expect(out.r1.aiRationale).toContain("On-topic");
  expect(out.r2.aiSuggestion).toBe("exclude");
  // suggestions are NEVER auto-applied as decisions
  expect(out.r1.r1.d).toBe("");
  expect(out.r2.r1.d).toBe("");
});

test("partial / unknown / malformed-entry results handled defensively", async ({ page }) => {
  await hook(page);
  const out = await page.evaluate((recs) => {
    window.__almScreenpro.setState({ records: recs });
    const n = window.__almScreenpro.aiApply([
      { id: "r1", suggestion: "include", confidence: 5, rationale: "x" },   // confidence clamped to 1
      { id: "r2", suggestion: "banana", confidence: 0.5 },                   // invalid suggestion -> ignored
      { id: "ghost", suggestion: "include", confidence: 0.5 },               // unknown id -> ignored
      { suggestion: "include" },                                             // no id -> ignored
      null,                                                                  // null entry -> ignored
    ]);
    return { n, r1: window.__almScreenpro.recordById("r1"), r2: window.__almScreenpro.recordById("r2") };
  }, UNDECIDED);
  expect(out.n).toBe(1);                      // only r1 applied
  expect(out.r1.aiConfidence).toBe(1);        // 5 clamped to [0,1]
  expect(out.r2.aiSuggestion).toBe("");       // invalid suggestion not applied
});

test("negative confidence clamped to 0; non-numeric confidence -> null", async ({ page }) => {
  await hook(page);
  const out = await page.evaluate((recs) => {
    window.__almScreenpro.setState({ records: recs });
    window.__almScreenpro.aiApply([
      { id: "r1", suggestion: "maybe", confidence: -2 },
      { id: "r2", suggestion: "maybe", confidence: "high" },
    ]);
    return { r1: window.__almScreenpro.recordById("r1").aiConfidence, r2: window.__almScreenpro.recordById("r2").aiConfidence };
  }, UNDECIDED);
  expect(out.r1).toBe(0);
  expect(out.r2).toBeNull();
});

test("non-array AI payload throws (caller surfaces an error, no silent corruption)", async ({ page }) => {
  await hook(page);
  const res = await page.evaluate((recs) => {
    window.__almScreenpro.setState({ records: recs });
    try { window.__almScreenpro.aiApply({ id: "r1", suggestion: "include" }); return "no-throw"; }
    catch (e) { return "threw:" + e.message; }
  }, UNDECIDED);
  expect(res).toMatch(/^threw:/);
  expect(res).toMatch(/array/i);
});

test("API key is stored in localStorage only and is ABSENT from the project JSON export", async ({ page }) => {
  await hook(page);
  // Arrange: load example data + enable AI BYO key, then type a recognizable key.
  await page.evaluate(() => {
    document.getElementById("btn-example").click();
    document.getElementById("ai-on").checked = true;
    document.getElementById("ai-on").dispatchEvent(new Event("change", { bubbles: true }));
    const mode = document.getElementById("ai-mode");
    mode.value = "byokey";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    const key = document.getElementById("ai-key");
    key.value = "sk-SECRET-NEVER-EXPORT-123456";
    key.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // Assert key persisted to its dedicated localStorage slot...
  const lsKey = await page.evaluate(() => localStorage.getItem("screen-ai-key"));
  expect(lsKey).toBe("sk-SECRET-NEVER-EXPORT-123456");
  // ...and that the project autosave (screen-v1) does NOT contain it.
  const projectLs = await page.evaluate(() => localStorage.getItem("screen-v1") || "");
  expect(projectLs).not.toContain("SECRET");

  // Capture the JSON export blob without writing a file.
  await page.evaluate(() => {
    window.__exported = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = function (blob) { blob.text().then(t => { window.__exported = t; }); return orig.call(URL, blob); };
  });
  await page.evaluate(() => document.getElementById("btn-export-json").click());
  await page.waitForFunction(() => window.__exported !== null);
  const exported = await page.evaluate(() => window.__exported);
  expect(exported).toContain("records");                 // it IS the project export
  expect(exported).not.toContain("SECRET");              // key never leaks into it
  expect(exported).not.toContain("screen-ai-key");
});
