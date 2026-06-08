// Full suite pipeline: Design -> Search -> Screen, wired through the shared
// localStorage envelopes (sr-project-v1, sr-records-v1, prisma-flow-v1).
// Covers real navigation handoffs, term propagation, PRISMA count propagation,
// and resilience to missing / garbled envelopes.
import { test, expect } from "@playwright/test";

const RECORDS_ENV = {
  _schema: "sr-records-v1",
  query: "sglt2 heart failure",
  records: [
    { id: "p1", title: "Dapagliflozin in heart failure with reduced EF", abstract: "RCT of dapagliflozin.", doi: "10.1/a", year: "2019", journal: "NEJM", authors: ["McMurray"], pmid: "1", source: "EuropePMC" },
    { id: "p2", title: "Empagliflozin in HFpEF", abstract: "RCT of empagliflozin.", doi: "10.1/b", year: "2021", journal: "NEJM", authors: ["Anker"], pmid: "2", source: "EuropePMC" },
    { id: "p3", title: "SGLT2 effects in a murine model", abstract: "Animal study in vitro.", doi: "10.1/c", year: "2020", journal: "JMCC", authors: ["Lee"], pmid: "3", source: "Crossref" },
    { id: "p4", title: "Canagliflozin renal outcomes trial", abstract: "RCT of canagliflozin.", doi: "10.1/d", year: "2017", journal: "NEJM", authors: ["Neal"], pmid: "4", source: "OpenAlex" },
  ],
};
const PROJECT_ENV = {
  _schema: "sr-project-v1",
  title: "SGLT2 inhibitors in heart failure",
  pico: { population: "adults with heart failure", intervention: "SGLT2 inhibitors", comparator: "placebo", outcome: "CV death" },
  screenTerms: { include: ["heart failure", "SGLT2", "dapagliflozin"], exclude: ["animal", "in vitro"] },
  searchStrategy: "(heart failure) AND (sglt2)",
};

test("Design → Search: 'Send to Search' writes sr-project-v1 and seeds the query", async ({ page }) => {
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto("/design/index.html");
  await page.waitForFunction(() => !!window.__almDesign);
  await page.locator("#btn-example").click();
  await page.locator("#btn-to-search").click();
  await page.waitForURL(/\/search\/index\.html/);
  await page.waitForFunction(() => !!window.__almSearch);
  // the project envelope was persisted...
  const proj = await page.evaluate(() => JSON.parse(localStorage.getItem("sr-project-v1")));
  expect(proj._schema).toBe("sr-project-v1");
  expect(proj.pico.intervention).toMatch(/SGLT2/i);
  // ...and Search auto-loaded a boolean query from it.
  const query = await page.inputValue("#f-query");
  expect(query.length).toBeGreaterThan(0);
  expect(query.toLowerCase()).toMatch(/heart failure|sglt2|dapagliflozin/);
  expect(errs).toEqual([]);
});

test("Search → Screen: records import AND Design screening terms propagate (SR_PROJECT_KEY)", async ({ page }) => {
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  // Seed both envelopes (as Design+Search would have left them), same origin.
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.__almScreenpro);
  await page.evaluate(({ rec, proj }) => {
    localStorage.setItem("sr-records-v1", JSON.stringify(rec));
    localStorage.setItem("sr-project-v1", JSON.stringify(proj));
  }, { rec: RECORDS_ENV, proj: PROJECT_ENV });
  // Trigger the documented auto-import path.
  await page.goto("/screen/index.html?import=sr-records-v1");
  await page.waitForFunction(() => !!window.__almScreenpro);

  const counts = await page.evaluate(() => window.__almScreenpro.counts());
  expect(counts.identified).toBe(4);

  // The fix under test: include/exclude terms came from the Design protocol.
  const inc = await page.inputValue("#f-inc");
  const exc = await page.inputValue("#f-exc");
  expect(inc).toContain("heart failure");
  expect(inc).toContain("SGLT2");
  expect(exc).toContain("animal");
  // and the title was seeded from the search query / project.
  const title = await page.inputValue("#f-title");
  expect(title.length).toBeGreaterThan(0);
  expect(errs).toEqual([]);
});

test("Screen → PRISMA: decisions propagate into prisma-flow-v1 counts", async ({ page }) => {
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.__almScreenpro);
  await page.evaluate((rec) => localStorage.setItem("sr-records-v1", JSON.stringify(rec)), RECORDS_ENV);
  await page.goto("/screen/index.html?import=sr-records-v1");
  await page.waitForFunction(() => !!window.__almScreenpro);

  // Include the first card, then exclude the next (auto-advance moves us along).
  await page.locator('#card-host [data-dec="include"]').click();
  await page.locator('#card-host [data-dec="exclude"]').click();

  await page.locator("#btn-prisma").click();
  const flow = await page.evaluate(() => JSON.parse(localStorage.getItem("prisma-flow-v1")));
  expect(flow.db).toBe(4);            // identified
  expect(flow.removed).toBe(0);       // no duplicates in this set
  expect(flow.screened).toBe(4);
  expect(flow.sought).toBe(1);        // 1 included -> sought for retrieval
  expect(flow.studies).toBe(1);
  // excludedScreen = excluded(1) + maybe(0) + conflict(0) + undecided(2)
  expect(flow.excludedScreen).toBe(3);
});

test("missing sr-records-v1 envelope: import is a no-op, no crash", async ({ page }) => {
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto("/screen/index.html?import=sr-records-v1");
  await page.waitForFunction(() => !!window.__almScreenpro);
  const counts = await page.evaluate(() => window.__almScreenpro.counts());
  expect(counts.identified).toBe(0);
  expect(errs).toEqual([]);
});

test("garbled sr-records-v1 envelope: import fails closed, no crash", async ({ page }) => {
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.__almScreenpro);
  await page.evaluate(() => localStorage.setItem("sr-records-v1", "{ this is not valid json"));
  await page.goto("/screen/index.html?import=sr-records-v1");
  await page.waitForFunction(() => !!window.__almScreenpro);
  const counts = await page.evaluate(() => window.__almScreenpro.counts());
  expect(counts.identified).toBe(0);
  expect(errs).toEqual([]);
});

test("valid records but garbled sr-project-v1: records still import, terms left empty, no crash", async ({ page }) => {
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.__almScreenpro);
  await page.evaluate((rec) => {
    localStorage.setItem("sr-records-v1", JSON.stringify(rec));
    localStorage.setItem("sr-project-v1", "<<<not json>>>");
  }, RECORDS_ENV);
  await page.goto("/screen/index.html?import=sr-records-v1");
  await page.waitForFunction(() => !!window.__almScreenpro);
  const counts = await page.evaluate(() => window.__almScreenpro.counts());
  expect(counts.identified).toBe(4);                 // records survived the bad project envelope
  const inc = await page.inputValue("#f-inc");
  expect(inc).toBe("");                               // no terms (project unreadable), but no throw
  expect(errs).toEqual([]);
});

test("Search 'Load PICO from Design' seeds the query from sr-project-v1", async ({ page }) => {
  await page.goto("/search/index.html");
  await page.waitForFunction(() => !!window.__almSearch);
  await page.evaluate((proj) => localStorage.setItem("sr-project-v1", JSON.stringify(proj)), PROJECT_ENV);
  await page.locator("#btn-load-design").click();
  const query = await page.inputValue("#f-query");
  // searchStrategy present in the envelope wins; otherwise PICO blocks are built.
  expect(query.toLowerCase()).toMatch(/heart failure|sglt2/);
});
