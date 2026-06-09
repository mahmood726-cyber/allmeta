// Screen app — 2026-06-08 upgrade coverage: blocked+multi-field dedup (parity with
// brute force, reformatted-title recall, scale), classifier dual-reviewer labels +
// cross-validated AUC + stopping signal, and serverless reviewer-merge collaboration.
// Drives the SHIPPED code via window.__almScreenpro.
import { test, expect } from "@playwright/test";

const APP = "/screen/index.html";
async function hook(page) {
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__almScreenpro);
}

test.describe("Screen · blocked dedup", () => {
  test("blocked pass agrees with brute force on a 300-record set (no recall loss from blocking)", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      // 150 genuinely-distinct titles (drawn from a wide pseudo-vocabulary so they
      // are NOT cross-similar), each with one reformatted near-duplicate copy.
      function rnd(seed) { return function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }
      const r = rnd(42), recs = [];
      for (let i = 0; i < 150; i++) {
        const ws = []; for (let k = 0; k < 10; k++) ws.push("w" + Math.floor(r() * 4000));
        const t = ws.join(" ") + " s" + i;
        recs.push({ id: "a" + i, title: t });
        recs.push({ id: "b" + i, title: t.toUpperCase() + "." });   // reformatted duplicate
      }
      window.__almScreenpro.setState({ records: recs });
      window.__almScreenpro.dedupBlocked();
      const blocked = new Set(window.__almScreenpro.dupIds());
      window.__almScreenpro.setState({ records: recs });
      window.__almScreenpro.dedupBrute();
      const brute = new Set(window.__almScreenpro.dupIds());
      let missedByBlocking = 0; brute.forEach((id) => { if (!blocked.has(id)) missedByBlocking++; });
      return { blocked: blocked.size, brute: brute.size, missedByBlocking };
    });
    expect(out.brute).toBeGreaterThanOrEqual(150);   // each pair detected
    expect(out.blocked).toBe(out.brute);             // blocking loses none
    expect(out.missedByBlocking).toBe(0);
  });

  test("multi-field assist: reformatted title + same author/year, different DOI -> merged", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: "a", title: "Dapagliflozin in patients with heart failure and reduced ejection fraction: the DAPA-HF trial", authors: ["McMurray JJV"], year: "2019", doi: "10.1056/x" },
        // reformatted (truncated trailing clause), DIFFERENT doi, same first author+year
        { id: "b", title: "Dapagliflozin in patients with heart failure and reduced ejection", authors: ["McMurray J"], year: "2019", doi: "10.9999/y" },
        // same title family but different year -> must NOT merge via assist
        { id: "c", title: "Dapagliflozin in patients with heart failure and reduced ejection", authors: ["McMurray J"], year: "2021", doi: "10.3/z" },
      ]});
      window.__almScreenpro.dedupBlocked();
      return { b: window.__almScreenpro.recordById("b").dup, c: window.__almScreenpro.recordById("c").dup };
    });
    expect(out.b).toBe(true);   // recovered by author+year assist despite different DOI
    expect(out.c).toBe(false);  // different year -> not merged on the relaxed threshold
  });

  test("multi-field assist does not false-merge distinct same-author/year papers", async ({ page }) => {
    await hook(page);
    const c = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: "a", title: "Effects of statins on cardiovascular mortality in older adults", authors: ["Smith J"], year: "2020", doi: "" },
        { id: "b", title: "Aspirin for primary prevention of stroke in women", authors: ["Smith J"], year: "2020", doi: "" },
      ]});
      return window.__almScreenpro.dedupBlocked().merges;
    });
    expect(c).toBe(0);
  });
});

test.describe("Screen · classifier quality", () => {
  // Two cleanly separable classes (cardiology vs molecular-biology vocabulary), 8 docs
  // each. Vocabulary is rotated so no single signature term appears in >40% of the 16
  // docs — otherwise the shipped max-df=0.4 cut (correct on real hundred/thousand-doc
  // corpora) would filter the discriminative terms out of this toy fixture.
  const SEP = [
    { id: "i1", title: "cardiac heart failure mortality", abstract: "ejection fraction reduced hospitalization", r1: { d: "include" } },
    { id: "i2", title: "heart failure ejection outcomes", abstract: "cardiac ventricular mortality reduced", r1: { d: "include" } },
    { id: "i3", title: "myocardial infarction coronary disease", abstract: "cardiovascular mortality hospitalization outcomes", r1: { d: "include" } },
    { id: "i4", title: "ventricular dysfunction cardiac", abstract: "ejection fraction myocardial reduced", r1: { d: "include" } },
    { id: "i5", title: "coronary artery disease prognosis", abstract: "cardiovascular heart mortality hospitalization", r1: { d: "include" } },
    { id: "i6", title: "dilated cardiomyopathy heart", abstract: "ventricular ejection hospitalization outcomes", r1: { d: "include" } },
    { id: "i7", title: "cardiovascular outcomes mortality", abstract: "coronary myocardial reduced fraction", r1: { d: "include" } },
    { id: "i8", title: "heart failure hospitalization", abstract: "cardiac mortality ejection ventricular", r1: { d: "include" } },
    { id: "e1", title: "molecular murine signaling", abstract: "vitro pathway cellular receptor", r1: { d: "exclude" } },
    { id: "e2", title: "murine signaling pathway kinase", abstract: "molecular cellular receptor expression", r1: { d: "exclude" } },
    { id: "e3", title: "protein kinase assay", abstract: "murine receptor expression vitro", r1: { d: "exclude" } },
    { id: "e4", title: "cellular receptor expression", abstract: "molecular protein signaling pathway", r1: { d: "exclude" } },
    { id: "e5", title: "gene expression profiling murine", abstract: "cellular kinase assay vitro", r1: { d: "exclude" } },
    { id: "e6", title: "vitro cellular assay", abstract: "protein receptor signaling molecular", r1: { d: "exclude" } },
    { id: "e7", title: "signaling pathway kinase", abstract: "gene murine expression cellular", r1: { d: "exclude" } },
    { id: "e8", title: "molecular biology protein assay", abstract: "kinase receptor expression vitro", r1: { d: "exclude" } },
  ];

  test("training reports a 5-fold cross-validated AUC", async ({ page }) => {
    await hook(page);
    const res = await page.evaluate((recs) => {
      window.__almScreenpro.setState({ records: recs });
      const r = window.__almScreenpro.mlTrain();
      return { r, cv: window.__almScreenpro.mlCrossVal() };
    }, SEP);
    expect(res.r.ok).toBe(true);
    expect(res.cv).not.toBeNull();
    expect(res.cv.auc).toBeGreaterThan(0.5);   // separable set -> better than chance
    expect(res.cv.auc).toBeLessThanOrEqual(1);
    expect(res.cv.folds).toBeGreaterThanOrEqual(2);
    expect(res.r.msg).toMatch(/CV AUC/);
  });

  test("dual-reviewer mode uses R2 labels (previously ignored)", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      // All labels live on R2 only; in single mode this can't train, in dual it must.
      const recs = [
        { id: "i1", title: "cardiac heart failure outcomes", abstract: "ejection fraction reduced hospitalization mortality cardiovascular", r2: { d: "include" } },
        { id: "i2", title: "heart failure ejection fraction", abstract: "cardiac hospitalization mortality cardiovascular outcomes", r2: { d: "include" } },
        { id: "e1", title: "molecular murine signaling", abstract: "vitro pathway cellular receptor expression", r2: { d: "exclude" } },
        { id: "e2", title: "murine signaling pathway", abstract: "molecular cellular receptor expression vitro", r2: { d: "exclude" } },
      ];
      window.__almScreenpro.setState({ records: recs, mode: "single" });
      const single = window.__almScreenpro.mlTrain();
      window.__almScreenpro.setState({ records: recs, mode: "dual", active: "r1" });
      const dual = window.__almScreenpro.mlTrain();
      return { single: single.ok, dual: dual.ok, dualInc: dual.inc, dualExc: dual.exc };
    });
    expect(out.single).toBe(false); // R1 has no labels -> can't train in single mode
    expect(out.dual).toBe(true);    // R2 labels are now used in dual mode
    expect(out.dualInc).toBe(2);
    expect(out.dualExc).toBe(2);
  });

  test("unigram features are learnable (distinctive words carry signal)", async ({ page }) => {
    // Shipped default is unigrams (ML_NGRAM_MAX=1, matching ASReview) — the
    // 2026-06-09 kaizen ablation found bigrams add no measured WSS@95 here. This
    // verifies the unigram ranker surfaces the distinctive include-class vocabulary.
    await hook(page);
    const terms = await page.evaluate((recs) => {
      window.__almScreenpro.setState({ records: recs });
      window.__almScreenpro.mlTrain();
      return window.__almScreenpro.mlTopTerms();
    }, SEP);
    const allPos = terms.pos.map((p) => p[0]);
    // at least one informative include-predicting term surfaces among the explanations
    expect(allPos.length).toBeGreaterThan(0);
    expect(allPos.some((t) => /heart|failure|cardiac|ejection|fraction/i.test(t))).toBe(true);
  });
});

test.describe("Screen · active-learning simulation", () => {
  test("ranks relevant records to the top: recall@20% far exceeds prevalence on a planted set", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      // 400 records, 40 'relevant' that share a distinctive vocabulary.
      const recs = [];
      for (let i = 0; i < 40; i++) recs.push({ id: "p" + i, title: "cardiac heart failure ejection fraction trial " + i, abstract: "cardiovascular mortality hospitalization outcomes reduced sglt2 dapagliflozin", gold: 1 });
      for (let i = 0; i < 360; i++) recs.push({ id: "n" + i, title: "molecular cellular signaling pathway study " + i, abstract: "receptor expression vitro murine kinase assay protein gene", gold: 0 });
      return window.__almScreenpro.simulateActiveLearning({ records: recs, batch: 20, seed: 8 });
    });
    expect(out.ok).toBe(true);
    expect(out.totalPos).toBe(40);
    // a useful ranker finds most relevant after screening only 20% of the pile
    expect(out.recallAt20pct).toBeGreaterThan(0.8);
    // and saves real work to reach 95% recall (random baseline WSS@95 = 0)
    expect(out.wss95).toBeGreaterThan(0.4);
  });
});

test.describe("Screen · collaboration merge", () => {
  test("merging a reviewer file fills the other column and flags disagreements as conflicts", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      window.__almScreenpro.setState({ mode: "dual", active: "r1", records: [
        { id: "a", title: "Paper A about hearts", doi: "10.1/a", r1: { d: "include" } },
        { id: "b", title: "Paper B about kidneys", doi: "10.1/b", r1: { d: "exclude" } },
        { id: "c", title: "Paper C about lungs", doi: "10.1/c", r1: { d: "include" } },
      ]});
      // incoming R2 file: agrees on A, DISAGREES on B (include vs exclude), matches C by DOI
      const payload = { _schema: "sr-reviewer-v1", reviewer: "r2", decisions: [
        { id: "a", d: "include" },
        { id: "b", d: "include" },               // conflict with R1's exclude
        { doi: "10.1/c", d: "include" },         // matched by DOI, not id
        { id: "zzz", d: "exclude" },             // unmatched
      ]};
      const res = window.__almScreenpro.mergeReviewer(payload, "auto");
      return {
        res,
        bR2: window.__almScreenpro.recordById("b").r2.d,
        cR2: window.__almScreenpro.recordById("c").r2.d,
        bEff: window.__almScreenpro.effDecision(window.__almScreenpro.recordById("b")),
      };
    });
    expect(out.res.slot).toBe("r2");
    expect(out.res.matched).toBe(3);
    expect(out.res.unmatched).toBe(1);
    expect(out.res.filled).toBe(3);
    expect(out.res.conflicts).toBe(1);    // B
    expect(out.bR2).toBe("include");
    expect(out.cR2).toBe("include");      // matched by DOI
    expect(out.bEff).toBe("conflict");
  });

  test("reviewer export -> merge round-trips decisions into a second project", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: "a", title: "Alpha", doi: "10.1/a", r1: { d: "include" } },
        { id: "b", title: "Beta", doi: "10.1/b", r1: { d: "exclude", reason: "Wrong population" } },
      ]});
      const exported = window.__almScreenpro.reviewerExport();
      // fresh project (same records, no decisions) receives the file as R2
      window.__almScreenpro.setState({ mode: "dual", active: "r2", records: [
        { id: "a", title: "Alpha", doi: "10.1/a" },
        { id: "b", title: "Beta", doi: "10.1/b" },
      ]});
      const res = window.__almScreenpro.mergeReviewer({ _schema: "sr-reviewer-v1", reviewer: "r1", decisions: exported.decisions }, "auto");
      return { res, aR1: window.__almScreenpro.recordById("a").r1.d, bReason: window.__almScreenpro.recordById("b").r1.reason };
    });
    expect(out.res.slot).toBe("r1");
    expect(out.res.filled).toBe(2);
    expect(out.aR1).toBe("include");
    expect(out.bReason).toBe("Wrong population");
  });
});
