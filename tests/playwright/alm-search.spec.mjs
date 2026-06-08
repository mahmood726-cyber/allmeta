// Search app — cross-source dedup (now deterministic by source rank),
// OpenAlex inverted-index abstract reconstruction, and the sr-records-v1
// handoff envelope. Drives shipped code via window.__almSearch.
import { test, expect } from "@playwright/test";

const APP = "/search/index.html";
async function hook(page) {
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__almSearch);
}

test("exact-DOI cross-source duplicate: richer source (EuropePMC) is kept, deterministically", async ({ page }) => {
  await hook(page);
  const result = await page.evaluate(() => {
    const mk = () => ([
      { id: "oa1", source: "OpenAlex", title: "Heart failure trial", doi: "10.1/x", authors: [] },
      { id: "ep1", source: "EuropePMC", title: "Heart failure trial", doi: "10.1/x", authors: [] },
    ]);
    // Run in both array orders; the survivor must be the same (EuropePMC).
    const a = window.__almSearch.dedup(mk());
    const b = window.__almSearch.dedup(mk().reverse());
    const surv = arr => arr.filter(r => !r.dup).map(r => r.source);
    return { a: surv(a), b: surv(b) };
  });
  expect(result.a).toEqual(["EuropePMC"]);
  expect(result.b).toEqual(["EuropePMC"]); // order-independent
});

test("fuzzy-title cross-source duplicate flagged; unrelated survives", async ({ page }) => {
  await hook(page);
  const out = await page.evaluate(() => {
    const recs = window.__almSearch.dedup([
      { id: "a", source: "Crossref", title: "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction", authors: [] },
      { id: "b", source: "OpenAlex", title: "Dapagliflozin in patients with heart failure and reduced ejection fraction.", authors: [] },
      { id: "c", source: "OpenAlex", title: "Empagliflozin for chronic kidney disease", authors: [] },
    ]);
    return recs.map(r => ({ id: r.id, dup: r.dup }));
  });
  const byId = Object.fromEntries(out.map(r => [r.id, r.dup]));
  expect(byId.a).toBe(false); // Crossref (rank 1) beats OpenAlex (rank 2)
  expect(byId.b).toBe(true);
  expect(byId.c).toBe(false);
});

test("records with no DOI and distinct titles are not merged", async ({ page }) => {
  await hook(page);
  const dups = await page.evaluate(() => {
    const recs = window.__almSearch.dedup([
      { id: "a", source: "Crossref", title: "Statins and cardiovascular mortality", authors: [] },
      { id: "b", source: "Crossref", title: "Aspirin for primary stroke prevention", authors: [] },
    ]);
    return recs.filter(r => r.dup).length;
  });
  expect(dups).toBe(0);
});

test("OpenAlex inverted index reconstructs ordered abstract text", async ({ page }) => {
  await hook(page);
  const abs = await page.evaluate(() => window.__almSearch.fromInverted({
    "Heart": [0], "failure": [1], "is": [2], "common": [3, 5], "and": [4], "serious": [6],
  }));
  expect(abs).toBe("Heart failure is common and common serious");
});

test("fromInverted tolerates null / non-object input", async ({ page }) => {
  await hook(page);
  const out = await page.evaluate(() => ({
    nul: window.__almSearch.fromInverted(null),
    str: window.__almSearch.fromInverted("nope"),
    empty: window.__almSearch.fromInverted({}),
  }));
  expect(out.nul).toBe("");
  expect(out.str).toBe("");
  expect(out.empty).toBe("");
});

test("sr-records-v1 envelope: correct schema, dedup applied, deterministic survivor", async ({ page }) => {
  await hook(page);
  const env = await page.evaluate(() => {
    return window.__almSearch.srEnvelope([
      { id: "oa1", source: "OpenAlex", title: "Heart failure trial", doi: "10.1/x", abstract: "from openalex", authors: ["A"], journal: "J1", year: "2020", pmid: "" },
      { id: "ep1", source: "EuropePMC", title: "Heart failure trial", doi: "10.1/x", abstract: "from europepmc", authors: ["A"], journal: "J2", year: "2020", pmid: "111" },
    ]);
  });
  expect(env._schema).toBe("sr-records-v1");
  expect(Array.isArray(env.records)).toBe(true);
  expect(env.records.length).toBe(1);
  expect(env.records[0].source).toBe("EuropePMC"); // deterministic survivor
  expect(env.records[0].pmid).toBe("111");
  // every emitted record carries the handoff fields Screen expects
  for (const k of ["id", "title", "abstract", "authors", "journal", "year", "doi", "pmid", "source"]) {
    expect(env.records[0]).toHaveProperty(k);
  }
});

test("aiPrompt embeds the query and asks for a single boolean string", async ({ page }) => {
  await hook(page);
  const prompt = await page.evaluate(() => {
    document.getElementById("f-query").value = "sglt2 inhibitors heart failure";
    return window.__almSearch.aiPrompt();
  });
  expect(prompt).toContain("sglt2 inhibitors heart failure");
  expect(prompt.toLowerCase()).toContain("boolean");
});
