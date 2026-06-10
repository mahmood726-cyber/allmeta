// Phase 3: screen/ loads the sr-collab module, the merge runs in a real
// browser, and the serverless team-folder UI renders. (The File System Access
// folder picker can't be driven headless, so folder I/O is covered by the
// Node pure-logic tests; here we prove browser-loadability + UI presence.)
import { test, expect } from "@playwright/test";

test("screen exposes SrCollab, merges in-browser, and shows the team-folder panel", async ({ page }) => {
  await page.goto("/screen/index.html");

  // module is loaded and global is live in the page
  const hasApi = await page.evaluate(() => !!(window.SrCollab && window.SrCollab.mergeReviewerFiles));
  expect(hasApi).toBe(true);

  // the pure merge runs head-on in the browser engine
  const result = await page.evaluate(() => {
    const recs = [
      { id: "1", doi: "10.1/a", title: "Study A", r1: { d: "", reason: "" }, r2: { d: "", reason: "" }, labels: [] },
      { id: "2", pmid: "999", title: "Study B", r1: { d: "", reason: "" }, r2: { d: "", reason: "" }, labels: [] }
    ];
    const r1 = { _schema: "sr-reviewer-v1", reviewer: "r1", decisions: [{ id: "1", d: "include" }, { pmid: "999", d: "exclude" }] };
    const r2 = { _schema: "sr-reviewer-v1", reviewer: "r2", decisions: [{ id: "1", d: "include" }, { pmid: "999", d: "include" }] };
    const res = window.SrCollab.mergeReviewerFiles(recs, [r1, r2]);
    const sum = window.SrCollab.summarize(recs);
    return { slots: res.perReviewer.map(p => p.slot), conflicts: sum.conflicts, consensus: sum.consensusIncluded };
  });
  expect(result.slots).toEqual(["r1", "r2"]);
  expect(result.conflicts).toBe(1);    // rec2 exclude vs include
  expect(result.consensus).toBe(1);    // rec1 both include

  // the team-folder panel is present
  await expect(page.locator("#btn-folder-connect")).toBeVisible();
  await expect(page.locator("#btn-folder-publish")).toBeVisible();
  await expect(page.locator("#btn-folder-pull")).toBeVisible();
});
