// Phase 2 shell: review-project reads LIVE workspace buses, reflects per-stage
// status, and folds live stages into the signed bundle in one click.
import { test, expect } from "@playwright/test";

test("review-project reflects live bus state and captures it into the bundle", async ({ page }) => {
  await page.goto("/review-project/index.html");

  // Seed the cross-tool buses the way the live pipeline apps would.
  await page.evaluate(() => {
    localStorage.setItem("sr-project-v1", JSON.stringify({
      title: "Test SR", pico: { population: "adults with HF", intervention: "drug X", outcome: "mortality" }
    }));
    localStorage.setItem("sr-records-v1", JSON.stringify({
      records: [
        { title: "A", r1: { d: "include" }, r2: { d: "include" } },
        { title: "B", r1: { d: "exclude" }, r2: { d: "exclude" } },
        { title: "C", r1: { d: "include" }, r2: { d: "include" } }
      ]
    }));
    localStorage.setItem("ma-studies-v1", JSON.stringify({
      _schema: "ma-studies-v1",
      studies: [
        { label: "A", est: -0.15, se: 0.05 },
        { label: "B", est: -0.10, se: 0.06 },
        { label: "C", est: -0.20, se: 0.07 }
      ]
    }));
    // pooled: write through the real API so the envelope passes validate()
    window.MaPooled.write(window.MaPooled.fromEstSE(0.86, 0.05, { scale: "ratio", measure: "HR", k: 3 }));
  });

  await page.click("#btn-refresh");

  const stages = page.locator("#stages");
  // live summaries from each bus
  await expect(stages).toContainText("Test SR");                  // protocol
  await expect(stages).toContainText("3 records imported");        // search
  await expect(stages).toContainText("2 included · 3 screened of 3"); // screening
  await expect(stages).toContainText("3 studies extracted");       // extraction
  await expect(stages).toContainText("pooled HR =");               // synthesis (fromEstSE back-transforms log→ratio)
  await expect(stages).toContainText("draft-ready");               // report (readyOnly)

  // live pills present (5 capturable + 1 readyOnly report = 6)
  await expect(page.locator("#stages .pill.live")).toHaveCount(6);

  // one-click fold all live stages into the bundle
  await page.click("#btn-capture-all");

  // 5 capturable stages flip to "in bundle ✓"; report stays live (readyOnly)
  await expect(page.locator("#stages .pill.have")).toHaveCount(5);
  await expect(page.locator("#stages .pill.live")).toHaveCount(1);
  await expect(stages).toContainText("captured into bundle");

  // capture survives a fresh refresh (persisted to review-project-v1)
  await page.click("#btn-refresh");
  await expect(page.locator("#stages .pill.have")).toHaveCount(5);
});
