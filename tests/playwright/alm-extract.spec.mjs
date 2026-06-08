// Extract app — deterministic extraction engine (effect sizes + CI, sample sizes,
// events, risk-of-bias, design, PICO), the ma-studies-v1 bus feed, and the AI/CLI
// handoff round-trip. Drives the SHIPPED code via window.__almExtract.
import { test, expect } from "@playwright/test";

const APP = "/extract/index.html";
async function hook(page) {
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__almExtract && !!window.MaStudies);
}

test.describe("Extract · effect sizes + CI", () => {
  test("parses HR with various punctuations", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => ({
      a: window.__almExtract.extractEffects("the hazard ratio was 0.74; 95% CI, 0.65 to 0.85; P<0.001"),
      b: window.__almExtract.extractEffects("reduced events (HR 0.79, 95% CI 0.69-0.90)"),
      c: window.__almExtract.extractEffects("relative risk 0.83 (95% confidence interval 0.71–0.97)"),
      d: window.__almExtract.extractEffects("odds ratio of 1.25 (95% CI: 1.02 to 1.53)"),
    }));
    expect(out.a[0]).toMatchObject({ measure: "HR", point: 0.74, lo: 0.65, hi: 0.85 });
    expect(out.b[0]).toMatchObject({ measure: "HR", point: 0.79, lo: 0.69, hi: 0.90 });
    expect(out.c[0]).toMatchObject({ measure: "RR", point: 0.83, lo: 0.71, hi: 0.97 });
    expect(out.d[0]).toMatchObject({ measure: "OR", point: 1.25, lo: 1.02, hi: 1.53 });
  });

  test("ignores numbers that are not an effect+CI pattern (no false positives)", async ({ page }) => {
    await hook(page);
    const n = await page.evaluate(() => window.__almExtract.extractEffects("We enrolled 4744 patients over 18.2 months in 20 countries.").length);
    expect(n).toBe(0);
  });

  test("swaps reversed CI bounds and rejects an out-of-range point", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => ({
      rev: window.__almExtract.extractEffects("HR 0.74 (95% CI 0.85 to 0.65)"),  // hi/lo reversed in text
      bad: window.__almExtract.extractEffects("HR 9.9 (95% CI 0.65 to 0.85)"),   // point far outside CI
    }));
    expect(out.rev[0]).toMatchObject({ lo: 0.65, hi: 0.85 });
    expect(out.bad.length).toBe(0);
  });
});

test.describe("Extract · counts + RoB + design", () => {
  test("extracts sample size, per-arm n, and events, skipping negated counts", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      const ss = window.__almExtract.extractSampleSizes("4744 patients were randomly assigned to dapagliflozin (n=2373) or placebo (n=2371).");
      const ev = window.__almExtract.extractEvents("events occurred in 386/2373 vs 502/2371 patients");
      const neg = window.__almExtract.extractSampleSizes("Not randomized 1807; randomized 5050 participants");
      return { ss, ev, neg };
    });
    expect(out.ss.total).toBe(4744);
    expect(out.ss.perArm).toEqual([2373, 2371]);
    expect(out.ev).toEqual([{ events: 386, total: 2373 }, { events: 502, total: 2371 }]);
    expect(out.neg.total).toBe(5050);     // "Not randomized 1807" must NOT win
  });

  test("detects randomisation, blinding, ITT, placebo and design", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      const t = "In this randomized, double-blind, placebo-controlled trial analysed by intention-to-treat";
      return { rob: window.__almExtract.extractRoB(t), design: window.__almExtract.extractDesign(t) };
    });
    expect(out.rob.randomized).toBe(true);
    expect(out.rob.blinding).toBe("double");
    expect(out.rob.placeboControlled).toBe(true);
    expect(out.rob.intentionToTreat).toBe(true);
    expect(out.design).toBe("RCT");
  });
});

test.describe("Extract · meta-analysis bus feed", () => {
  test("ratio effect -> ln(point) + SE from CI on the log scale", async ({ page }) => {
    await hook(page);
    const s = await page.evaluate(() => {
      const ex = window.__almExtract.extractRecord({ id: "r1", title: "Trial X", year: "2019",
        abstract: "randomized trial; hazard ratio 0.74; 95% CI 0.65 to 0.85" });
      return window.__almExtract.toMaStudy(ex);
    });
    // est = ln(0.74), se = (ln0.85 - ln0.65)/(2*1.95996)
    expect(s.est).toBeCloseTo(Math.log(0.74), 6);
    expect(s.se).toBeCloseTo((Math.log(0.85) - Math.log(0.65)) / (2 * 1.959963984540054), 6);
    expect(s.year).toBe(2019);
  });

  test("MD effect stays on the natural (linear) scale", async ({ page }) => {
    await hook(page);
    const s = await page.evaluate(() => {
      const ex = window.__almExtract.extractRecord({ id: "r2", title: "Trial Y",
        abstract: "the mean difference was 2.5 (95% CI 1.0 to 4.0)" });
      return window.__almExtract.toMaStudy(ex);
    });
    expect(s.est).toBeCloseTo(2.5, 6);
    expect(s.se).toBeCloseTo((4.0 - 1.0) / (2 * 1.959963984540054), 6);
  });

  test("busStudies writes a valid ma-studies-v1 payload from the example set", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      window.__almExtract.setRecords([
        { id: "a", title: "DAPA-HF", year: "2019", abstract: "randomized double-blind placebo-controlled trial; 4744 patients; hazard ratio 0.74; 95% CI 0.65 to 0.85" },
        { id: "b", title: "EMPEROR", year: "2021", abstract: "randomized trial; hazard ratio 0.79; 95% CI 0.69-0.90" },
      ]);
      const studies = window.__almExtract.busStudies();
      const valid = window.MaStudies.validate(window.MaStudies.buildEnvelope(studies));
      return { n: studies.length, labels: studies.map((s) => s.label), valid: valid.ok };
    });
    expect(out.n).toBe(2);
    expect(out.valid).toBe(true);
    expect(out.labels[0]).toContain("DAPA-HF");
  });
});

test.describe("Extract · end-to-end + AI handoff", () => {
  test("example data extracts 3 RCTs with effects and is MA-ready", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      window.__almExtract.setRecords([
        { id: "ex1", title: "DAPA-HF", year: "2019", abstract: "randomized, double-blind, placebo-controlled trial of 4744 patients; hazard ratio 0.74; 95% CI, 0.65 to 0.85; intention-to-treat" },
        { id: "ex2", title: "EMPEROR-Preserved", year: "2021", abstract: "randomized, double-blind trial; hazard ratio, 0.79; 95% CI 0.69-0.90" },
        { id: "ex3", title: "CANVAS", year: "2017", abstract: "randomized controlled trial; hazard ratio 0.86; 95% CI 0.75 to 0.97" },
      ]);
      return { bus: window.__almExtract.busStudies().length, design: window.__almExtract.extractRecord({ title: "x", abstract: "randomized controlled trial" }).design };
    });
    expect(out.bus).toBe(3);
    expect(out.design).toBe("RCT");
  });

  test("pipeline: Extract imports the INCLUDED records from a Screen project (screen-v1)", async ({ page }) => {
    await page.goto(APP);
    await page.waitForFunction(() => !!window.__almExtract);
    // seed a screen-v1 project: one include (with an effect), one exclude, one dup
    await page.evaluate(() => {
      localStorage.setItem("screen-v1", JSON.stringify({ _schema: "screen-v1", records: [
        { id: "s1", title: "Included trial", abstract: "randomized trial; hazard ratio 0.74; 95% CI 0.65 to 0.85", r1: { d: "include" } },
        { id: "s2", title: "Excluded paper", abstract: "animal study", r1: { d: "exclude" } },
        { id: "s3", title: "Dup", abstract: "x", r1: { d: "include" }, dup: true },
      ] }));
    });
    await page.reload();
    await page.waitForFunction(() => !!window.__almExtract);
    await page.click("#btn-from-screen");
    await page.waitForFunction(() => window.__almExtract.busStudies !== undefined);
    const out = await page.evaluate(() => ({ env: window.__almExtract.envelope(), bus: window.__almExtract.busStudies() }));
    // only the non-dup INCLUDE should arrive and be MA-ready
    expect(out.env.records.length).toBe(1);
    expect(out.env.records[0].title).toBe("Included trial");
    expect(out.bus.length).toBe(1);
  });

  test("AI results re-import overrides the chosen effect", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      window.__almExtract.setRecords([{ id: "z1", title: "Trial Z", abstract: "no machine-readable effect here" }]);
      const before = window.__almExtract.pick("z1");
      const n = window.__almExtract.applyAiResults([{ id: "z1", primaryEffect: { measure: "RR", point: 0.5, lo: 0.3, hi: 0.8 } }]);
      const after = window.__almExtract.pick("z1");
      return { before, n, after };
    });
    expect(out.before).toBeNull();           // engine found nothing
    expect(out.n).toBe(1);
    expect(out.after).toMatchObject({ measure: "RR", point: 0.5, lo: 0.3, hi: 0.8 });
  });
});
