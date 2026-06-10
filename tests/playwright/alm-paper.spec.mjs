// Paper Studio host smoke: seed the cross-tool buses, load /paper/, and assert
// the bridge assembles RapidMeta.state and Paper Studio renders the manuscript
// canvas (replacing the "Loading…" placeholder) with the auto-filled evidence.
import { test, expect } from "@playwright/test";

const PROJECT = {
  _schema: "sr-project-v1",
  title: "Finerenone for CKD in type 2 diabetes",
  pico: { population: "adults with CKD and type 2 diabetes", intervention: "Finerenone", comparator: "placebo", outcome: "CV death or HF hospitalisation" },
};
const RECORDS = {
  _schema: "sr-records-v1",
  records: [
    { id: "r1", title: "FIDELIO-DKD", authors: ["Bakris G"], year: "2020", n: 5674, r1: { d: "include" }, r2: { d: "include" } },
    { id: "r2", title: "FIGARO-DKD", authors: ["Pitt B"], year: "2021", n: 7437, r1: { d: "include" }, r2: { d: "include" } },
    { id: "r3", title: "Off-topic study", r1: { d: "exclude" }, r2: { d: "exclude" } },
  ],
};
const STUDIES = [
  { label: "Bakris 2020", est: -0.18, se: 0.06, year: 2020 },
  { label: "Pitt 2021", est: -0.13, se: 0.05, year: 2021 },
];
// ma-pooled-v1 requires positive values on a "ratio" scale (it stores the HR,
// not logHR): a pooled HR of 0.86 (95% CI 0.79–0.94).
const POOLED = { pointEstimate: 0.86, ciLo: 0.79, ciHi: 0.94, tau2: 0.002, measure: "HR", scale: "ratio", k: 2, label: "Primary outcome" };

test("Paper Studio host boots, bridge assembles state, canvas renders", async ({ page }) => {
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));

  await page.goto("/paper/index.html");
  // Host + engine globals are present.
  await page.waitForFunction(() => !!window.PaperStudio && !!window.RapidMeta && !!window.MaStudies && !!window.MaPooled);

  // Seed the buses via their real APIs (no envelope guessing), then rebuild + re-render.
  await page.evaluate(({ proj, rec, studies, pooled }) => {
    localStorage.setItem("sr-project-v1", JSON.stringify(proj));
    localStorage.setItem("sr-records-v1", JSON.stringify(rec));
    window.MaStudies.write(studies);
    window.MaPooled.add(pooled);
    window.RapidMeta.rebuildStateFromBuses();
    window.PaperStudio.onShow();
  }, { proj: PROJECT, rec: RECORDS, studies: STUDIES, pooled: POOLED });

  // The bridge produced the expected state shape.
  const state = await page.evaluate(() => window.RapidMeta.state);
  expect(state.protocol.int).toBe("Finerenone");
  expect(state.pico.intervention).toBe("Finerenone");
  expect(state.trials.length).toBe(2);                 // consensus-included only
  expect(state.trials.map(t => t.title)).toContain("FIDELIO-DKD");
  expect(state.results.estimate).toBe(0.86);
  expect(state.results.ciLow).toBe(0.79);

  // The canvas rendered real content (not the loading placeholder).
  const canvas = page.locator("#paperCanvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).not.toContainText("Loading your evidence paper");
  const txt = (await canvas.innerText()).trim();
  expect(txt.length).toBeGreaterThan(200);

  // No uncaught page errors during boot/render.
  expect(errs).toEqual([]);
});
