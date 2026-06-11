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
  await expect(stages).toContainText("2 consensus-included · 3 screened of 3"); // screening (consensus, not provisional)
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

  // staleness: change the workspace after capture -> the captured synthesis
  // stage must flag stale, not keep masking it as "in bundle ✓".
  await page.evaluate(() => {
    window.MaPooled.write(window.MaPooled.fromEstSE(1.20, 0.04, { scale: "ratio", measure: "HR", k: 4 }));
  });
  await page.click("#btn-refresh");
  await expect(page.locator("#stages .pill.stale")).toHaveCount(1);
  await expect(page.locator("#stages .pill.have")).toHaveCount(4);
  await expect(stages).toContainText("differs from current workspace");

  // re-capture clears the stale flag
  await page.click("#btn-capture-all");
  await expect(page.locator("#stages .pill.stale")).toHaveCount(0);
  await expect(page.locator("#stages .pill.have")).toHaveCount(5);
});

test("review-project surfaces the portfolio-integration tools in their stages", async ({ page }) => {
  await page.goto("/review-project/index.html");
  const stages = page.locator("#stages");
  // the 4 integrations must be reachable as stage launch links
  await expect(stages.locator("a", { hasText: "Benford screen" })).toHaveAttribute("href", "../benford-screen/");
  await expect(stages.locator("a", { hasText: "Quantile MA" })).toHaveAttribute("href", "../quantile-ma/");
  await expect(stages.locator("a", { hasText: "Transported NMA" })).toHaveAttribute("href", "../transported-nma/");
  await expect(stages.locator("a", { hasText: "Umbrella overlap" })).toHaveAttribute("href", "../umbrella-overlap/");
});

test("review-project is a usable tabbed SPA on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });   // iPhone 12/13/14 logical px
  await page.goto("/review-project/index.html");

  // exactly one panel visible at a time (tabbed, not a long scroll); Overview is the landing
  await expect(page.locator(".stage-panel.active")).toHaveCount(1);
  await expect(page.locator('.stage-panel.active[data-tab="overview"]')).toBeVisible();

  // the tab bar holds Overview + 9 stages + Bundle and scrolls horizontally (no wrap/clip)
  expect(await page.locator("#tabnav .tab").count()).toBe(11);
  const overflow = await page.evaluate(() => {
    const n = document.getElementById("tabnav");
    return { scrollable: n.scrollWidth > n.clientWidth + 2, bodyOverflow: document.documentElement.scrollWidth - window.innerWidth };
  });
  expect(overflow.scrollable).toBe(true);          // tabs scroll, not squashed
  expect(overflow.bodyOverflow).toBeLessThanOrEqual(2);   // no horizontal page overflow

  // tapping a tab switches the visible panel
  await page.locator('#tab-btn-synthesis').click();
  await expect(page.locator('.stage-panel.active[data-tab="synthesis"]')).toBeVisible();
  await expect(page.locator('.stage-panel[data-tab="overview"]')).toBeHidden();

  // the in-panel "next" stepper advances the workflow
  await page.locator('.stage-panel.active [data-go="robustness"]').click();
  await expect(page.locator('.stage-panel.active[data-tab="robustness"]')).toBeVisible();

  // Bundle tab reachable and shows the sign action
  await page.locator('#tab-btn-bundle').click();
  await expect(page.locator('#btn-sign')).toBeVisible();
});

test("review-project tabs are correctly ARIA-wired and the progress counter is honest", async ({ page }) => {
  await page.goto("/review-project/index.html");

  // every tab's aria-controls must resolve to a real panel id (no dangling refs)
  const wiring = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('#tabnav .tab')];
    return tabs.map(t => ({
      controls: t.getAttribute('aria-controls'),
      ok: !!document.getElementById(t.getAttribute('aria-controls')),
      selected: t.getAttribute('aria-selected'),
      tabindex: t.getAttribute('tabindex'),
    }));
  });
  expect(wiring.length).toBe(11);
  expect(wiring.every(w => w.ok)).toBe(true);                       // all aria-controls resolve
  // roving tabindex: exactly one tab is focusable (tabindex=0) and aria-selected=true
  expect(wiring.filter(w => w.tabindex === "0").length).toBe(1);
  expect(wiring.filter(w => w.selected === "true").length).toBe(1);

  // Report is draft-only, so the denominator excludes it (8, not 9) — never an unreachable count
  await expect(page.locator("#progress")).toContainText("of 8 stages captured");
});

test("review-project Overview funnel and inline stage previews render from the bus", async ({ page }) => {
  await page.goto("/review-project/index.html");
  await page.evaluate(() => {
    localStorage.setItem("sr-project-v1", JSON.stringify({ title: "Test SR", pico: { population: "adults with HF", intervention: "drug X", outcome: "mortality" } }));
    localStorage.setItem("sr-records-v1", JSON.stringify({ records: [
      { title: "A", r1: { d: "include" }, r2: { d: "include" } },
      { title: "B", r1: { d: "exclude" }, r2: { d: "exclude" } },
      { title: "C", r1: { d: "include" }, r2: { d: "include" } }
    ] }));
    localStorage.setItem("ma-studies-v1", JSON.stringify({ _schema: "ma-studies-v1", studies: [
      { label: "Trial A", est: -0.15, se: 0.05 }, { label: "Trial B", est: -0.10, se: 0.06 }, { label: "Trial C", est: -0.20, se: 0.07 }
    ] }));
    // RoB app state (key rob-assess-v1, the real key) with explicit overrides
    localStorage.setItem("rob-assess-v1", JSON.stringify({ studies: [
      { label: "Trial A", framework: "RoB 2", domains: [{ id: "D1" }, { id: "D2" }], override: { D1: "low", D2: "high" }, suggestion: { verdicts: { D1: "low", D2: "high" } } }
    ] }));
    localStorage.setItem("grade-sof-v1", JSON.stringify({ outcomes: [{ outcome: "All-cause mortality", certainty: "moderate" }] }));
    window.MaPooled.write(window.MaPooled.fromEstSE(0.86, 0.05, { scale: "ratio", measure: "HR", k: 3 }));
  });
  await page.click("#btn-refresh");

  // Overview funnel: 6 rows, imported=3, included=2 (consensus), studies=3, pooled k=3
  await expect(page.locator("#funnel .frow")).toHaveCount(6);
  await expect(page.locator("#funnel")).toContainText("Records imported");
  await expect(page.locator("#ov-cards")).toContainText("Included studies");

  // inline previews per stage (read from the bus)
  await expect(page.locator('#panel-protocol .preview')).toContainText("adults with HF");
  await expect(page.locator('#panel-extraction .preview table tbody tr')).toHaveCount(3);
  // fromEstSE treats 0.86 as a log-HR on the ratio scale, so the natural-scale point is exp(0.86) ≈ 2.36
  await expect(page.locator('#panel-synthesis .preview .result-card .big')).toContainText("2.36");
  await expect(page.locator('#panel-synthesis .preview svg.mini-forest')).toHaveCount(1);  // hidden panel: assert presence, not visibility
  await expect(page.locator('#panel-synthesis .preview svg.mini-forest polygon')).toHaveCount(1);  // pooled diamond drawn
  // RoB traffic-lights: domain D1 override=low (green), D2 override=high (red),
  // and the overall verdict is high (RoB2: any high domain -> high overall).
  await expect(page.locator('#panel-appraisal .preview .rl:not(.overall).rl-low')).toHaveCount(1);
  await expect(page.locator('#panel-appraisal .preview .rl:not(.overall).rl-high')).toHaveCount(1);
  await expect(page.locator('#panel-appraisal .preview .rl.overall.rl-high')).toHaveCount(1);
  // GRADE SoF certainty pill
  await expect(page.locator('#panel-certainty .preview .sof-moderate')).toContainText("Moderate");
});
