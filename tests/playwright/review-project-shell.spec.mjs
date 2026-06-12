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
  // the result card now shows the LIVE recompute of the 3 studies on the bus (RE-REML default),
  // not the canonical bus value: pooling est=[-.15,-.10,-.20] gives μ≈-0.146 → exp≈0.86 on the ratio scale.
  await expect(page.locator('#panel-synthesis .preview .result-card .big')).toContainText("0.86");
  // the canonical ma-pooled-v1 result exp(0.86)≈2.36 is kept as the one-line cross-reference
  await expect(page.locator('#panel-synthesis .preview .synth-xref')).toContainText("2.36");
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

test("synthesis preview re-pools the studies bus live under the chosen model (JASP-style)", async ({ page }) => {
  await page.goto("/review-project/index.html");
  await page.evaluate(() => {
    localStorage.setItem("ma-studies-v1", JSON.stringify({ _schema: "ma-studies-v1", studies: [
      { label: "Trial A", est: -0.15, se: 0.05 }, { label: "Trial B", est: -0.10, se: 0.06 },
      { label: "Trial C", est: -0.20, se: 0.07 }, { label: "Trial D", est: 0.02, se: 0.09 }
    ] }));
    // canonical pooled result fixes the analysis scale (ratio) for the live recompute
    window.MaPooled.write(window.MaPooled.fromEstSE(0.86, 0.05, { scale: "ratio", measure: "HR", k: 4, model: "RE-DL" }));
  });
  await page.click("#btn-refresh");
  await page.locator('#tab-btn-synthesis').click();

  const pane = page.locator('#panel-synthesis .preview');
  // controls render and default to REML, KNHA off
  await expect(pane.locator("select[data-synth='method']")).toHaveValue("REML");
  await expect(pane.locator("input[data-synth='knha']")).not.toBeChecked();
  // live heterogeneity stats + diamond render, plus the canonical cross-reference line
  await expect(pane.locator(".synth-live")).toContainText("τ²");
  await expect(pane.locator(".synth-live")).toContainText("I²");
  await expect(pane.locator("svg.mini-forest polygon")).toHaveCount(1);
  await expect(pane.locator(".synth-xref")).toContainText("Canonical bus");
  // default RE-REML label is shown on the live result card
  await expect(pane.locator(".result-card .meta")).toContainText("RE-REML");

  // switch to fixed-effect: label updates live and KNHA becomes inapplicable (disabled)
  await page.selectOption("#panel-synthesis select[data-synth='method']", "FE");
  await expect(page.locator("#panel-synthesis .result-card .meta")).toContainText("fixed-effect");
  await expect(page.locator("#panel-synthesis input[data-synth='knha']")).toBeDisabled();

  // RE + Knapp–Hartung widens the model: the label carries it through
  await page.selectOption("#panel-synthesis select[data-synth='method']", "DL");
  await page.check("#panel-synthesis input[data-synth='knha']");
  await expect(page.locator("#panel-synthesis .result-card .meta")).toContainText("Knapp–Hartung");

  // the live recompute matches AlmMaCore directly (same engine the app uses), on the natural scale
  const { ui, ref } = await page.evaluate(() => {
    const studies = window.MaStudies.read();
    const yi = studies.map(s => s.est), vi = studies.map(s => s.se * s.se);
    const r = window.AlmMaCore.pool(yi, vi, { method: "DL", knha: true, knhaFloor: true });
    const big = document.querySelector("#panel-synthesis .result-card .big").textContent.trim();
    return { ui: big, ref: Math.exp(r.mu) };
  });
  expect(Math.abs(parseFloat(ui) - ref)).toBeLessThan(0.005);
});

test("Overview evidence map plots the studies bus and is interactive", async ({ page }) => {
  await page.goto("/review-project/index.html");
  await page.evaluate(() => {
    localStorage.setItem("ma-studies-v1", JSON.stringify({ _schema: "ma-studies-v1", studies: [
      { label: "Trial A", est: -0.15, se: 0.05, group: "Europe", year: 2019 },
      { label: "Trial B", est: -0.10, se: 0.06, group: "Asia" },
      { label: "Trial C", est: -0.20, se: 0.07, group: "Europe" }
    ] }));
    window.MaPooled.write(window.MaPooled.fromEstSE(0.86, 0.05, { scale: "ratio", measure: "HR", k: 3 }));
  });
  await page.click("#btn-refresh");

  // Overview is the landing panel; the map unhides and plots one bubble per study
  await expect(page.locator("#evmap-wrap")).toBeVisible();
  await expect(page.locator("#evmap .evpt")).toHaveCount(3);
  // two groups -> a legend is drawn
  await expect(page.locator("#evmap text", { hasText: "Europe" })).toHaveCount(1);

  // clicking a point selects it and writes its detail into the caption
  await page.locator("#evmap .evpt").first().click();
  await expect(page.locator("#evmap .evpt.sel")).toHaveCount(1);
  await expect(page.locator("#evmap-cap")).toContainText("Trial A");
  await expect(page.locator("#evmap-cap")).toContainText("group Europe");

  // with no studies on the bus the map stays hidden (honest empty state)
  await page.evaluate(() => localStorage.removeItem("ma-studies-v1"));
  await page.click("#btn-refresh");
  await expect(page.locator("#evmap-wrap")).toBeHidden();
});

test("Story mode weaves a true-case narrative beat into every stage, with a refrain that breaks", async ({ page }) => {
  await page.goto("/review-project/index.html");

  // off by default: no beats, intro hidden, the working studio is untouched
  await expect(page.locator("#stages .story-beat")).toHaveCount(0);
  await expect(page.locator("#story-intro")).toBeHidden();

  // turn it on
  await page.click("#btn-story");
  await expect(page.locator("#btn-story")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#story-intro")).toBeVisible();
  await expect(page.locator("#story-intro")).toContainText("the line no one drew");   // default case = corticosteroids
  await expect(page.locator("#story-case")).toBeVisible();

  // one beat per stage (9 stages), each carrying a scene + a refrain line
  await expect(page.locator("#stages .story-beat")).toHaveCount(9);
  await expect(page.locator("#stages .story-beat .story-refrain")).toHaveCount(9);

  // the refrain returns "not yet drawn" through the early stages, then BREAKS at synthesis
  await expect(page.locator("#panel-protocol .story-beat")).toContainText("not yet drawn");
  await expect(page.locator("#panel-extraction .story-beat")).toContainText("not yet drawn");
  await expect(page.locator("#panel-synthesis .story-beat")).toContainText("The line is drawn");   // resolution
  await expect(page.locator("#panel-synthesis .story-beat")).toContainText("diamond falls left");
  // fact-check fixes are locked: Crowley's overview was 1990 (not 1991), and the
  // self-referential "the reason this studio exists" tic was removed from the report beat.
  await expect(page.locator("#panel-synthesis .story-year")).toHaveText("1990");
  await expect(page.locator("#panel-report .story-beat")).not.toContainText("studio exists");
  // iltifāt: the closing report beat shifts to second-person voice
  await expect(page.locator("#panel-report .story-beat.voice")).toHaveCount(1);

  // swap the case live — the cautionary magnesium/ISIS-4 story, whose turn lands at Robustness
  await page.selectOption("#story-case", "magnesium");
  await expect(page.locator("#story-intro")).toContainText("the chorus and the mirage");
  await expect(page.locator("#panel-synthesis .story-beat")).toContainText("treat everyone");
  await expect(page.locator("#panel-robustness .story-beat")).toContainText("58,050");
  await expect(page.locator("#panel-robustness .story-beat.voice")).toHaveCount(1);   // the mirage-breaks turn is second-person

  // streptokinase case carries its real cumulative landmark
  await page.selectOption("#story-case", "strepto");
  await expect(page.locator("#panel-synthesis .story-beat")).toContainText("2,432 patients");

  // state persists across a reload, and toggling off removes every beat
  await page.reload();
  await expect(page.locator("#stages .story-beat")).toHaveCount(9);
  await expect(page.locator("#story-case")).toHaveValue("strepto");
  await page.click("#btn-story");
  await expect(page.locator("#stages .story-beat")).toHaveCount(0);
  await expect(page.locator("#story-intro")).toBeHidden();
});

test("Story mode loads a case's real trials onto the bus, flowing to the live tools", async ({ page }) => {
  page.on("dialog", d => d.accept());   // auto-accept the replace-existing-studies confirm
  await page.goto("/review-project/index.html");
  await page.click("#btn-story");

  // corticosteroids: per-trial counts are paywalled -> honest provenance note, no loader
  await expect(page.locator("#story-intro [data-load-case]")).toHaveCount(0);
  await expect(page.locator("#story-intro .story-cite")).toContainText("CD004454");

  // streptokinase: 10 verified real trials, loadable in one click
  await page.selectOption("#story-case", "strepto");
  await expect(page.locator("#story-intro [data-load-case]")).toContainText("Load these 10 real trials");
  await expect(page.locator("#story-intro .story-cite")).toContainText("dat.lau1992");
  await page.click("#story-intro [data-load-case]");

  // the evidence map now plots the 10 real trials, on the shared bus (not just drawn)
  await expect(page.locator("#evmap-wrap")).toBeVisible();
  await expect(page.locator("#evmap .evpt")).toHaveCount(10);
  const onBus = await page.evaluate(() => window.MaStudies.read().length);
  expect(onBus).toBe(10);

  // fixed-effect pool of the real trials shows a clear mortality benefit (OR < 1)
  await page.locator("#tab-btn-synthesis").click();
  await page.selectOption("#panel-synthesis select[data-synth='method']", "FE");
  const big = await page.locator("#panel-synthesis .result-card .big").textContent();
  expect(parseFloat(big)).toBeGreaterThan(0.5);
  expect(parseFloat(big)).toBeLessThan(0.95);

  // magnesium: 9 trials incl. the giant near-null ISIS-4 — the FE pool collapses toward 1
  // (synthOpts persists as FE in this session), which is the spec-collapse lesson.
  await page.locator("#tab-btn-overview").click();
  await page.selectOption("#story-case", "magnesium");
  await page.click("#story-intro [data-load-case]");
  await expect(page.locator("#evmap .evpt")).toHaveCount(9);
  await page.locator("#tab-btn-synthesis").click();
  const mg = await page.locator("#panel-synthesis .result-card .big").textContent();
  expect(parseFloat(mg)).toBeGreaterThan(0.95);   // with ISIS-4 in, the fixed-effect benefit vanishes
});

test("Story mode includes the Turner publication-bias case driving the Robustness stage", async ({ page }) => {
  await page.goto("/review-project/index.html");
  await page.click("#btn-story");
  await page.selectOption("#story-case", "antidep");

  await expect(page.locator("#story-intro")).toContainText("curated shelf");
  await expect(page.locator("#story-intro .story-cite")).toContainText("0.41");   // verified headline g
  await expect(page.locator("#story-intro [data-load-case]")).toHaveCount(0);     // SMD pub-bias, no 2×2 to load

  // 9 woven beats; the turn lands at Robustness in second-person voice with the verified inflation
  await expect(page.locator("#stages .story-beat")).toHaveCount(9);
  await expect(page.locator("#panel-robustness .story-beat.voice")).toHaveCount(1);
  await expect(page.locator("#panel-robustness .story-beat")).toContainText("g = 0.31");
});

test("Story mode loads REAL Cochrane data (CD004661) lifted from the Pairwise70 corpus", async ({ page }) => {
  page.on("dialog", d => d.accept());
  await page.goto("/review-project/index.html");
  await page.click("#btn-story");
  await page.selectOption("#story-case", "cortico_repeat");

  // provenance is explicit: the real Cochrane review + its source corpus
  await expect(page.locator("#story-intro .story-cite")).toContainText("CD004661");
  await expect(page.locator("#story-intro .story-cite")).toContainText("Pairwise70 Cochrane corpus");
  await expect(page.locator("#story-intro [data-load-case]")).toContainText("Load these 6 real trials");

  // load the real per-trial data onto the bus
  await page.click("#story-intro [data-load-case]");
  await expect(page.locator("#evmap .evpt")).toHaveCount(6);
  expect(await page.evaluate(() => window.MaStudies.read().length)).toBe(6);

  // fixed-effect pool of the real Cochrane trials is the near-null death OR (~0.96) the beat states
  await page.locator("#tab-btn-synthesis").click();
  await page.selectOption("#panel-synthesis select[data-synth='method']", "FE");
  const or = parseFloat(await page.locator("#panel-synthesis .result-card .big").textContent());
  expect(or).toBeGreaterThan(0.88);
  expect(or).toBeLessThan(1.05);
  await expect(page.locator("#panel-synthesis .story-beat")).toContainText("0.96");
});

test("Story mode loads a clear-benefit real Cochrane case (CD000028 antihypertensives)", async ({ page }) => {
  page.on("dialog", d => d.accept());
  await page.goto("/review-project/index.html");
  await page.click("#btn-story");
  await page.selectOption("#story-case", "htn_elderly");

  await expect(page.locator("#story-intro .story-cite")).toContainText("CD000028");
  await expect(page.locator("#story-intro .story-cite")).toContainText("Pairwise70 Cochrane corpus");
  await expect(page.locator("#story-intro [data-load-case]")).toContainText("Load these 13 real trials");

  await page.click("#story-intro [data-load-case]");
  await expect(page.locator("#evmap .evpt")).toHaveCount(13);
  expect(await page.evaluate(() => window.MaStudies.read().length)).toBe(13);

  // fixed-effect pool of the real trials is a clear mortality benefit (~0.89, CI excludes 1)
  await page.locator("#tab-btn-synthesis").click();
  await page.selectOption("#panel-synthesis select[data-synth='method']", "FE");
  const or = parseFloat(await page.locator("#panel-synthesis .result-card .big").textContent());
  expect(or).toBeGreaterThan(0.82);
  expect(or).toBeLessThan(0.95);
  await expect(page.locator("#panel-synthesis .story-beat")).toContainText("0.89");
});

test("Synthesis flags screening-included records that carry no pooled effect data (honesty check)", async ({ page }) => {
  await page.goto("/review-project/index.html");
  await page.evaluate(() => {
    // 5 consensus-included records, but only 3 studies reach the bus -> 2 dropped
    localStorage.setItem("sr-records-v1", JSON.stringify({ records: [
      { title: "A", r1: { d: "include" }, r2: { d: "include" } },
      { title: "B", r1: { d: "include" }, r2: { d: "include" } },
      { title: "C", r1: { d: "include" }, r2: { d: "include" } },
      { title: "D", r1: { d: "include" }, r2: { d: "include" } },
      { title: "E", r1: { d: "include" }, r2: { d: "include" } }
    ] }));
    localStorage.setItem("ma-studies-v1", JSON.stringify({ _schema: "ma-studies-v1", studies: [
      { label: "A", est: -0.15, se: 0.05 }, { label: "B", est: -0.10, se: 0.06 }, { label: "C", est: -0.20, se: 0.07 }
    ] }));
    window.MaPooled.write(window.MaPooled.fromEstSE(0.86, 0.05, { scale: "ratio", measure: "HR", k: 3 }));
  });
  await page.click("#btn-refresh");
  await page.locator("#tab-btn-synthesis").click();
  await expect(page.locator("#panel-synthesis .dropped-warn")).toContainText("2 of 5");
  await expect(page.locator("#panel-synthesis .dropped-warn")).toContainText("no pooled effect data");

  // when every included record is pooled, the warning disappears
  await page.evaluate(() => localStorage.setItem("sr-records-v1", JSON.stringify({ records: [
    { title: "A", r1: { d: "include" }, r2: { d: "include" } },
    { title: "B", r1: { d: "include" }, r2: { d: "include" } },
    { title: "C", r1: { d: "include" }, r2: { d: "include" } }
  ] })));
  await page.click("#btn-refresh");
  await expect(page.locator("#panel-synthesis .dropped-warn")).toHaveCount(0);
});

test("Bundle stage runs quality-assurance checks and gates signing on blocking fails", async ({ page }) => {
  await page.goto("/review-project/index.html");
  // empty workspace: no pooled result -> a blocking 'fail' check, sign is gated
  await page.locator("#tab-btn-bundle").click();
  await expect(page.locator("#qa-checks .qa-head")).toContainText("checks pass");
  await expect(page.locator("#qa-checks .qa-row.qa-fail")).not.toHaveCount(0);   // 'Pooled result present' fails
  await expect(page.locator("#qa-checks")).toHaveAttribute("data-fails", /[1-9]/);
  await expect(page.locator("#qa-checks .qa-block")).toBeVisible();

  // seed a full, valid workspace -> the blocking checks clear
  await page.evaluate(() => {
    localStorage.setItem("sr-project-v1", JSON.stringify({ pico: { population: "adults", intervention: "drug" } }));
    localStorage.setItem("sr-records-v1", JSON.stringify({ records: [
      { title: "A", r1: { d: "include" }, r2: { d: "include" } }, { title: "B", r1: { d: "include" }, r2: { d: "include" } }
    ] }));
    localStorage.setItem("ma-studies-v1", JSON.stringify({ _schema: "ma-studies-v1", studies: [
      { label: "A", est: -0.15, se: 0.05 }, { label: "B", est: -0.10, se: 0.06 }
    ] }));
    window.MaPooled.write(window.MaPooled.fromEstSE(0.86, 0.05, { scale: "ratio", measure: "HR", k: 2 }));
  });
  await page.click("#btn-refresh");
  await page.click("#btn-capture-all");   // fold the live stages into the bundle
  await page.locator("#tab-btn-bundle").click();
  await expect(page.locator("#qa-checks .qa-row.qa-fail")).toHaveCount(0);
  await expect(page.locator("#qa-checks")).toHaveAttribute("data-fails", "0");
});

test("Overview shows a plain-language 'What does this mean?' summary from the pooled result", async ({ page }) => {
  await page.goto("/review-project/index.html");
  await expect(page.locator("#what-this-means")).toBeHidden();   // nothing pooled yet
  await page.evaluate(() => {
    localStorage.setItem("ma-studies-v1", JSON.stringify({ _schema: "ma-studies-v1", studies: [
      { label: "A", est: -0.15, se: 0.05 }, { label: "B", est: -0.10, se: 0.06 }
    ] }));
    // a ratio HR of 0.70 with a CI entirely below 1 -> "a clear effect"
    window.MaPooled.write(window.MaPooled.fromEstSE(Math.log(0.70), (Math.log(0.85)-Math.log(0.58))/(2*1.959963984540054), { scale: "ratio", measure: "HR", k: 2 }));
  });
  await page.click("#btn-refresh");
  await expect(page.locator("#what-this-means")).toBeVisible();
  await expect(page.locator("#what-this-means")).toContainText("pooled HR was");
  await expect(page.locator("#what-this-means .wm-sentence")).toContainText("no-effect line");
});

test("Synthesis offers the author's experimental estimators, clearly labelled", async ({ page }) => {
  await page.goto("/review-project/index.html");
  await page.evaluate(() => {
    // the verified 6-study fixture (>=4 so the conformal PI is defined)
    localStorage.setItem("ma-studies-v1", JSON.stringify({ _schema: "ma-studies-v1", studies: [
      { label: "A", est: -0.15, se: 0.05 }, { label: "B", est: -0.10, se: 0.06 }, { label: "C", est: -0.20, se: 0.07 },
      { label: "D", est: 0.02, se: 0.09 }, { label: "E", est: -0.30, se: 0.08 }, { label: "F", est: -0.05, se: 0.10 }
    ] }));
    window.MaPooled.write(window.MaPooled.fromEstSE(0.86, 0.05, { scale: "ratio", measure: "HR", k: 6 }));
  });
  await page.click("#btn-refresh");
  await page.locator("#tab-btn-synthesis").click();

  const card = page.locator("#panel-synthesis .exp-methods").filter({ hasText: "Experimental methods" });
  await expect(card).toHaveCount(1);
  await expect(card.locator(".exp-tag")).toHaveText("experimental");          // explicit label
  await expect(card).toContainText("GRMA");
  await expect(card).toContainText("Conformal");
  await expect(card).toContainText("GWAM");
  await expect(card).toContainText("not validated for decision-making");

  // GWAM defaults to λ=0.64 and shows λ·mu_pub back-transformed (REML pool shrunk to null)
  await expect(card.locator("input[data-gwam='lambda']")).toHaveValue("0.64");
  const expectedGwam = await page.evaluate(() => {
    const s = window.MaStudies.read();
    const rp = window.AlmMaCore.pool(s.map(x => x.est), s.map(x => x.se * x.se), { method: "REML" });
    return (Math.exp(0.64 * rp.mu)).toPrecision(3);
  });
  await expect(card).toContainText(expectedGwam);

  // the JS port equals the Python reference: GRMA on these (back-transformed to ratio)
  // is exp(-0.12826963) ≈ 0.880
  const grma = await page.evaluate(() => {
    const s = window.MaStudies.read();
    const g = window.ExperimentalMA.grma(s.map(x => x.est), s.map(x => x.se * x.se));
    return Math.exp(g.estimate);
  });
  expect(Math.abs(grma - 0.879682)).toBeLessThan(1e-4);

  // multiverse / spec-collapse panel: pools under a 7-spec estimator grid and shows
  // the honest combined CI beside the naïve (collapsing) pool
  const mv = page.locator("#panel-synthesis .exp-methods").filter({ hasText: "Multiverse" });
  await expect(mv).toHaveCount(1);
  await expect(mv).toContainText("spec-collapse");
  await expect(mv).toContainText("verdict");
  await expect(mv).toContainText("Naïve");
  await expect(mv.locator("table tbody tr")).toHaveCount(7);

  // benchmark-superior methods panel: the closed-form estimators that beat DL in
  // the author's 299-method simulation benchmark, one row each
  const bench = page.locator("#panel-synthesis .exp-methods").filter({ hasText: "Benchmark-superior" });
  await expect(bench).toHaveCount(1);
  await expect(bench).toContainText("DerSimonian-Laird");
  await expect(bench).toContainText("Knapp-Hartung");
  await expect(bench).toContainText("Ridge");
  await expect(bench).toContainText("Elastic-net");
  await expect(bench).toContainText("Softmax-weighted");
  await expect(bench).toContainText("Gradient boosting");
  await expect(bench).toContainText("Gaussian copula");
  await expect(bench.locator("table tbody tr")).toHaveCount(14);
  // the #1 winner's pooled estimate back-transforms to exp(-0.13796647) ≈ 0.871
  const kh = await page.evaluate(() => {
    const s = window.MaStudies.read();
    const r = window.ExperimentalMA.knappHartungMod(s.map(x => x.est), s.map(x => x.se * x.se), false);
    return Math.exp(r.estimate);
  });
  expect(Math.abs(kh - 0.871123)).toBeLessThan(1e-4);

  // HKSJ Q-floor audit panel (author's hksj-q-floor-atlas): floored vs un-floored
  // HKSJ for these studies. The 6-study fixture is heterogeneous (I²>0) so the
  // floor does not bind, but the card must still render both variants.
  const hksj = page.locator("#panel-synthesis .exp-methods").filter({ hasText: "HKSJ Q-floor" });
  await expect(hksj).toHaveCount(1);
  await expect(hksj).toContainText("Floored (RevMan-2025)");
  await expect(hksj).toContainText("Un-floored");
  await expect(hksj).toContainText("hksj-q-floor-atlas");
  await expect(hksj.locator("table tbody tr")).toHaveCount(2);

  // reproduction-floor audit panel (author's repro-floor-atlas Scenario B)
  const repro = page.locator("#panel-synthesis .exp-methods").filter({ hasText: "Reproduction-floor" });
  await expect(repro).toHaveCount(1);
  await expect(repro).toContainText("repro-floor-atlas");
  await expect(repro).toContainText("machine-precision");

  // fragility robustness panel (author's fragility-atlas): robustness % + verdict
  const frag = page.locator("#panel-synthesis .exp-methods").filter({ hasText: "Fragility robustness" });
  await expect(frag).toHaveCount(1);
  await expect(frag).toContainText("fragility-atlas");
  await expect(frag).toContainText("DL-Wald reference");
  await expect(frag).toContainText("robustness");

  // publication-bias signals panel (browser subset of MAFI): Egger + precision-effect
  const bias = page.locator("#panel-synthesis .exp-methods").filter({ hasText: "Publication-bias signals" });
  await expect(bias).toHaveCount(1);
  await expect(bias).toContainText("Egger");
  await expect(bias).toContainText("Precision");
  await expect(bias).toContainText("no clear asymmetry");   // fixture Egger p≈0.68
  await expect(bias).toContainText("MAFI");
});

test("Stages carry good-vs-weak writing teaching cards", async ({ page }) => {
  await page.goto("/review-project/index.html");
  const card = page.locator("#panel-synthesis .teach-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".ex-good")).toContainText("Good");
  await expect(card.locator(".ex-weak")).toContainText("Too vague");
  await expect(card.locator(".ex-weak")).toContainText("statistically significant");
  // a stage without a teaching pair has none
  await expect(page.locator("#panel-robustness .teach-card")).toHaveCount(0);
});

test("Focus mode hides the chrome and exits via the floating button and Esc", async ({ page }) => {
  await page.goto("/review-project/index.html");
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator("#focus-exit")).toBeHidden();

  await page.click("#btn-focus");
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator("#focus-exit")).toBeVisible();
  await expect(page.locator("#tabnav")).toBeVisible();   // tabs stay for navigation

  await page.click("#focus-exit");
  await expect(page.locator(".topbar")).toBeVisible();

  // Esc also exits
  await page.click("#btn-focus");
  await expect(page.locator(".topbar")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator(".topbar")).toBeVisible();
});

test("Search and Extraction stages surface the Embase + PDF workflow", async ({ page }) => {
  await page.goto("/review-project/index.html");
  await expect(page.locator("#panel-search .s-desc")).toContainText("Embase");
  await expect(page.locator("#panel-extraction .s-desc")).toContainText("PDF");
  await expect(page.locator("#panel-extraction a", { hasText: "RCT extractor (PDF)" })).toHaveAttribute("href", "../rct-extractor/");
});
