// P1: screen/ loads the offline RCT classifier + trained weights, scores
// records cold-start (no labels), shows the RCT% badge, and ranks trials first.
import { test, expect } from "@playwright/test";

test("screen scores RCT likelihood offline and surfaces it on cards", async ({ page }) => {
  await page.goto("/screen/index.html");

  // classifier + weights are live in-page, with honest metrics surfaced
  const ready = await page.evaluate(() => ({
    mod: !!(window.SrRctClassifier && window.SrRctClassifier.available()),
    auc: (window.SrRctClassifier.meta() || {}).auc,
    metaText: document.getElementById("rct-meta").textContent,
  }));
  expect(ready.mod).toBe(true);
  expect(ready.auc).toBeGreaterThanOrEqual(0.85);
  expect(ready.metaText).toMatch(/Held-out AUC/);

  // cold-start scoring separates an RCT abstract from a review (no labels needed)
  const scores = await page.evaluate(() => {
    window.__almScreenpro.setState({
      title: "t",
      records: [
        { id: "r1", title: "Dapagliflozin trial", abstract: "In this randomized, double-blind, placebo-controlled trial patients were randomly assigned to drug or placebo." },
        { id: "r2", title: "Salt review", abstract: "This systematic review and meta-analysis pooled observational cohort studies of dietary salt." },
      ],
    });
    return { rct: window.__almScreenpro.rctScoreOf("r1"), rev: window.__almScreenpro.rctScoreOf("r2") };
  });
  expect(scores.rct).toBeGreaterThan(0.5);
  expect(scores.rev).toBeLessThan(0.5);

  // the badge renders on the current card
  await expect(page.locator("#card-host")).toContainText(/RCT \d+%/);
});
