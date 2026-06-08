// Design app — PICO question phrasing, boolean strategy construction,
// screening-term suggestion, and the sr-project-v1 envelope schema.
import { test, expect } from "@playwright/test";

const APP = "/design/index.html";
async function hook(page) {
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__almDesign);
}

test("buildQuestion assembles a PICO sentence", async ({ page }) => {
  await hook(page);
  const q = await page.evaluate(() => window.__almDesign.buildQuestion({
    framework: "PICO", pop: "adults with chronic heart failure", int: "SGLT2 inhibitors",
    comp: "placebo", out: "cardiovascular death",
  }));
  expect(q).toBe("In adults with chronic heart failure, what is the effect of SGLT2 inhibitors compared with placebo on cardiovascular death?");
});

test("PICOS / PICOT append design and timeframe clauses", async ({ page }) => {
  await hook(page);
  const out = await page.evaluate(() => ({
    picos: window.__almDesign.buildQuestion({ framework: "PICOS", pop: "P", int: "I", comp: "", out: "O", des: "randomized controlled trials" }),
    picot: window.__almDesign.buildQuestion({ framework: "PICOT", pop: "P", int: "I", comp: "", out: "O", time: "12 weeks" }),
  }));
  expect(out.picos).toContain("Study designs: randomized controlled trials");
  expect(out.picot).toContain("Timeframe: 12 weeks");
});

test("buildBoolean groups synonyms with OR and joins blocks with AND; multiword quoted", async ({ page }) => {
  await hook(page);
  const b = await page.evaluate(() => window.__almDesign.buildBoolean({
    pop: "adults with heart failure", int: "SGLT2, dapagliflozin, empagliflozin",
    comp: "placebo", out: "mortality",
  }));
  expect(b).toContain('("adults with heart failure")');
  expect(b).toContain("(SGLT2 OR dapagliflozin OR empagliflozin)");
  expect(b).toContain("\nAND (placebo)");
  expect(b.split("AND ").length).toBe(4); // four PICO blocks
});

test("buildBoolean ignores empty blocks", async ({ page }) => {
  await hook(page);
  const b = await page.evaluate(() => window.__almDesign.buildBoolean({ pop: "diabetes", int: "", comp: "", out: "retinopathy" }));
  expect(b).toBe("(diabetes)\nAND (retinopathy)");
});

test("suggestTerms harvests P/I/O synonyms into include terms", async ({ page }) => {
  await hook(page);
  const tinc = await page.evaluate(() => window.__almDesign.suggestTerms({
    pop: "heart failure", int: "dapagliflozin, empagliflozin", out: "mortality", comp: "placebo",
  }));
  // comparator is intentionally excluded from include terms
  expect(tinc).toContain("heart failure");
  expect(tinc).toContain("dapagliflozin");
  expect(tinc).toContain("empagliflozin");
  expect(tinc).toContain("mortality");
  expect(tinc).not.toContain("placebo");
});

test("buildProject emits the sr-project-v1 envelope with PICO, eligibility, screenTerms", async ({ page }) => {
  await hook(page);
  const p = await page.evaluate(() => window.__almDesign.buildProject({
    title: "SGLT2i in HF", framework: "PICOS",
    pop: "adults with heart failure", int: "SGLT2 inhibitors", comp: "placebo", out: "CV death",
    einc: "RCTs\nAdults", eexc: "Animal studies\nAbstracts",
    tinc: "heart failure, SGLT2", texc: "animal, in vitro",
    strategy: "(heart failure) AND (sglt2)",
  }));
  expect(p._schema).toBe("sr-project-v1");
  expect(p.title).toBe("SGLT2i in HF");
  expect(p.pico.intervention).toBe("SGLT2 inhibitors");
  expect(p.eligibility.include).toEqual(["RCTs", "Adults"]);
  expect(p.eligibility.exclude.length).toBe(2);
  expect(p.screenTerms.include).toEqual(["heart failure", "SGLT2"]);
  expect(p.screenTerms.exclude).toEqual(["animal", "in vitro"]);
  expect(p.searchStrategy).toContain("sglt2");
});

test("aiPrompt asks for JSON with search/include/exclude and reflects the PICO", async ({ page }) => {
  await hook(page);
  const prompt = await page.evaluate(() => {
    // aiPrompt() reads current form state, so seed the fields first.
    window.__almDesign.buildProject({ pop: "adults with heart failure", int: "SGLT2 inhibitors", out: "mortality" });
    return window.__almDesign.aiPrompt();
  });
  expect(prompt).toContain("adults with heart failure");
  expect(prompt).toContain('"search"');
  expect(prompt).toContain('"include"');
  expect(prompt).toContain('"exclude"');
});
