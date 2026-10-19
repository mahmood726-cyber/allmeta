// Full suite pipeline: Design -> Search -> Screen, wired through the shared
// localStorage envelopes (sr-project-v1, sr-records-v1, prisma-flow-v1).
// Covers real navigation handoffs, term propagation, PRISMA count propagation,
// and resilience to missing / garbled envelopes.
import { test, expect } from "@playwright/test";

const RECORDS_ENV = {
  _schema: "sr-records-v1",
  query: "sglt2 heart failure",
  records: [
    { id: "p1", title: "Synthetic heart failure intervention trial", abstract: "Synthetic RCT of dapagliflozin." },
    { id: "p2", title: "Synthetic preserved ejection fraction cohort", abstract: "Synthetic treatment evaluation." },
    { id: "p3", title: "Synthetic mouse laboratory investigation", abstract: "Synthetic animal study in vitro." },
    { id: "p4", title: "Synthetic renal outcomes randomized evaluation", abstract: "Synthetic comparison trial." },
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

test("Screen → PRISMA: two-stage decisions propagate into prisma-flow-v1 counts; pending work is refused", async ({ page }) => {
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.__almScreenpro);
  await page.evaluate((rec) => localStorage.setItem("sr-records-v1", JSON.stringify(rec)), RECORDS_ENV);
  await page.goto("/screen/index.html?import=sr-records-v1");
  await page.waitForFunction(() => !!window.__almScreenpro);
  const prismaFlow = () => page.evaluate(() => JSON.parse(localStorage.getItem("prisma-flow-v1")));

  // Title/abstract: include the first card, then exclude the next (auto-advance moves us along).
  await page.locator('#card-host [data-dec="include"]').click();
  await page.locator('#card-host [data-dec="exclude"]').click();

  // Requirement: with 2 of 4 records still undecided, PRISMA must refuse rather than
  // count undecided records as excluded (the old behaviour this PR removes).
  await page.locator("#btn-prisma").click();
  await expect(page.locator("#workflow-status")).toContainText("Pending work is never counted as excluded");
  expect(await prismaFlow()).toBeNull();

  // Finish title/abstract: 2 includes + 2 excludes in total.
  await page.locator('#card-host [data-dec="include"]').click();
  await page.locator('#card-host [data-dec="exclude"]').click();
  const ta = await page.evaluate(() => window.__almScreenpro.counts());
  expect(ta.included).toBe(2);
  expect(ta.excluded).toBe(2);

  // Requirement: full-text screening of the 2 TA includes is still pending -> still refused.
  await page.evaluate(() => { document.getElementById("workflow-status").textContent = ""; });
  await page.locator("#btn-prisma").click();
  await expect(page.locator("#workflow-status")).toContainText("Finish title/abstract and full-text screening");
  expect(await prismaFlow()).toBeNull();

  // Full text: record the retrieved report, then decide. One include, one exclude with a reason.
  await page.locator("#f-reasons").fill("Wrong population");
  await page.locator("#f-reasons").dispatchEvent("input");
  await page.locator("#f-stage").selectOption("ft");
  await page.locator("#ft-retrieval").selectOption("retrieved");
  await page.locator("#ft-save").click();
  await page.locator('#card-host [data-dec="include"]').click();
  await page.locator("#ft-retrieval").selectOption("retrieved");
  await page.locator("#ft-save").click();
  await page.locator('#card-host [data-reason="0"]').click();

  await page.locator("#btn-prisma").click();
  await expect(page.locator("#workflow-status")).toContainText("PRISMA counts saved");
  const flow = await prismaFlow();
  expect(flow.db).toBe(4);               // identified
  expect(flow.removed).toBe(0);          // no duplicates in this set
  expect(flow.screened).toBe(4);         // 4 identified - 0 duplicates
  expect(flow.excludedScreen).toBe(2);   // 2 TA excludes; no undecided records remain
  expect(flow.sought).toBe(2);           // screened 4 - excludedScreen 2
  expect(flow.notRetrieved).toBe(0);
  expect(flow.assessed).toBe(2);         // sought 2 - notRetrieved 0
  expect(flow.excludedEligible).toBe(1); // 1 full-text exclude
  expect(flow.excludedBreakdown).toBe("Wrong population (n=1)");
  expect(flow.studies).toBe(1);          // assessed 2 - excludedEligible 1
  expect(flow.reports).toBe(1);
  // the flow must close arithmetically at every box
  expect(flow.db - flow.removed).toBe(flow.screened);
  expect(flow.screened - flow.excludedScreen).toBe(flow.sought);
  expect(flow.sought - flow.notRetrieved).toBe(flow.assessed);
  expect(flow.assessed - flow.excludedEligible).toBe(flow.studies);
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
