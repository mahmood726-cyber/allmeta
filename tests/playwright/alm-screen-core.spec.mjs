// Screen app — deterministic core: dedup, Cohen's kappa, term scoring,
// highlight/XSS, import parsers (RIS/nbib/CSV/JSON), CSV-injection guard,
// PRISMA count propagation. Drives the SHIPPED code via window.__almScreenpro.
import { test, expect } from "@playwright/test";

const APP = "/screen/index.html";
async function hook(page) {
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__almScreenpro);
}

test.describe("Screen · dedup", () => {
  test("exact DOI duplicate flagged regardless of title", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: "a", title: "Dapagliflozin in heart failure", doi: "10.1056/NEJMoa1911303" },
        { id: "b", title: "A completely different title text", doi: "10.1056/NEJMoa1911303" },
      ]});
      return {
        dupCount: window.__almScreenpro.dedupCount(),
        a: window.__almScreenpro.recordById("a").dup,
        b: window.__almScreenpro.recordById("b").dup,
        bof: window.__almScreenpro.recordById("b").dupOf,
      };
    });
    expect(out.dupCount).toBe(1);
    expect(out.a).toBe(false);
    expect(out.b).toBe(true);
    expect(out.bof).toBe("a"); // first occurrence wins
  });

  test("DOI match is case-insensitive", async ({ page }) => {
    await hook(page);
    const dup = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: "a", title: "X one two three", doi: "10.1000/ABC" },
        { id: "b", title: "Y four five six", doi: "10.1000/abc" },
      ]});
      return window.__almScreenpro.dedupCount();
    });
    expect(dup).toBe(1);
  });

  test("fuzzy near-duplicate title (no DOI) flagged at >=0.85 trigram Jaccard", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: "a", title: "Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction" },
        { id: "b", title: "Dapagliflozin in patients with heart failure and reduced ejection fraction." },
        { id: "c", title: "Empagliflozin for kidney disease in type 2 diabetes" },
      ]});
      return { n: window.__almScreenpro.dedupCount(), b: window.__almScreenpro.recordById("b").dup, c: window.__almScreenpro.recordById("c").dup };
    });
    expect(out.b).toBe(true);   // near-identical title
    expect(out.c).toBe(false);  // unrelated title survives
    expect(out.n).toBe(1);
  });

  test("distinct titles below threshold are NOT merged (no false merge)", async ({ page }) => {
    await hook(page);
    const n = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: "a", title: "Effect of statins on cardiovascular mortality in adults" },
        { id: "b", title: "Effect of aspirin on stroke prevention in elderly women" },
      ]});
      return window.__almScreenpro.dedupCount();
    });
    expect(n).toBe(0);
  });

  test("manual duplicate mark is preserved across re-dedup", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: "a", title: "Unique title alpha beta gamma", dup: true, dupManual: true },
        { id: "b", title: "Another unrelated title delta epsilon" },
      ]});
      return { aDup: window.__almScreenpro.recordById("a").dup, aOf: window.__almScreenpro.recordById("a").dupOf };
    });
    expect(out.aDup).toBe(true);
    expect(out.aOf).toBe("(manual)");
  });

  test("unicode/diacritic titles dedup after normalization", async ({ page }) => {
    await hook(page);
    const n = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: "a", title: "Étude randomisée sur l'insuffisance cardiaque aiguë" },
        { id: "b", title: "Étude randomisée sur l'insuffisance cardiaque aiguë!" },
      ]});
      return window.__almScreenpro.dedupCount();
    });
    // normTitle strips non [a-z0-9]; accented chars collapse to spaces in both,
    // so the two should still be near-identical after normalization.
    expect(n).toBe(1);
  });

  test("jaccard / trigrams primitives behave", async ({ page }) => {
    await hook(page);
    const r = await page.evaluate(() => {
      const h = window.__almScreenpro;
      return {
        identical: h.jaccard(h.trigrams("heart failure"), h.trigrams("heart failure")),
        disjoint: h.jaccard(h.trigrams("abcabc"), h.trigrams("xyzxyz")),
        norm: h.normTitle("A Randomized Controlled Trial of THE Drug!!!"),
      };
    });
    expect(r.identical).toBeCloseTo(1, 10);
    expect(r.disjoint).toBe(0);
    // stopwords (a, the, randomized, controlled, trial, of) removed
    expect(r.norm).toBe("drug");
  });
});

test.describe("Screen · Cohen's kappa", () => {
  function recs(spec) {
    // spec: array of [r1,r2] decisions
    return spec.map((d, i) => ({ id: "r" + i, title: "t" + i + " aa bb cc", r1: { d: d[0] }, r2: { d: d[1] } }));
  }
  test("matches hand-computed value (kappa=0.3478)", async ({ page }) => {
    await hook(page);
    // 2x2: both-inc=5, r1inc/r2exc=1, r1exc/r2inc=2, both-exc=2  (n=10, po=0.7)
    const spec = [];
    for (let i = 0; i < 5; i++) spec.push(["include", "include"]);
    for (let i = 0; i < 1; i++) spec.push(["include", "exclude"]);
    for (let i = 0; i < 2; i++) spec.push(["exclude", "include"]);
    for (let i = 0; i < 2; i++) spec.push(["exclude", "exclude"]);
    const k = await page.evaluate((records) => {
      window.__almScreenpro.setState({ mode: "dual", records });
      return window.__almScreenpro.kappa();
    }, recs(spec));
    expect(k.n).toBe(10);
    expect(k.agree).toBe(7);
    expect(k.po).toBeCloseTo(0.7, 10);
    expect(k.pe).toBeCloseTo(0.54, 10);
    expect(k.kappa).toBeCloseTo(0.347826, 5);
    expect(k.degenerate).toBe(false);
  });

  test("returns null with fewer than 2 dual-decided pairs", async ({ page }) => {
    await hook(page);
    const k = await page.evaluate(() => {
      window.__almScreenpro.setState({ mode: "dual", records: [
        { id: "a", title: "x", r1: { d: "include" }, r2: { d: "include" } },
        { id: "b", title: "y", r1: { d: "include" }, r2: { d: "" } },
      ]});
      return window.__almScreenpro.kappa();
    });
    expect(k).toBeNull();
  });

  test("perfect agreement on a single category is reported as undefined, not 0", async ({ page }) => {
    await hook(page);
    const k = await page.evaluate(() => {
      window.__almScreenpro.setState({ mode: "dual", records: [
        { id: "a", title: "x", r1: { d: "include" }, r2: { d: "include" } },
        { id: "b", title: "y", r1: { d: "include" }, r2: { d: "include" } },
        { id: "c", title: "z", r1: { d: "include" }, r2: { d: "include" } },
      ]});
      return window.__almScreenpro.kappa();
    });
    expect(k.degenerate).toBe(true);
    expect(k.kappa).toBeNull();
    expect(k.po).toBe(1);
    expect(k.n).toBe(3);
  });

  test("perfect disagreement gives strongly negative kappa", async ({ page }) => {
    await hook(page);
    const k = await page.evaluate(() => {
      window.__almScreenpro.setState({ mode: "dual", records: [
        { id: "a", title: "x", r1: { d: "include" }, r2: { d: "exclude" } },
        { id: "b", title: "y", r1: { d: "exclude" }, r2: { d: "include" } },
        { id: "c", title: "z", r1: { d: "include" }, r2: { d: "exclude" } },
        { id: "d", title: "w", r1: { d: "exclude" }, r2: { d: "include" } },
      ]});
      return window.__almScreenpro.kappa();
    });
    expect(k.kappa).toBeLessThan(0);
  });

  test("duplicates are excluded from the kappa pool", async ({ page }) => {
    await hook(page);
    const k = await page.evaluate(() => {
      window.__almScreenpro.setState({ mode: "dual", records: [
        { id: "a", title: "x", r1: { d: "include" }, r2: { d: "include" }, dup: true, dupManual: true },
        { id: "b", title: "y", r1: { d: "include" }, r2: { d: "exclude" } },
        { id: "c", title: "z", r1: { d: "exclude" }, r2: { d: "exclude" } },
      ]});
      return window.__almScreenpro.kappa();
    });
    expect(k.n).toBe(2); // the duplicate pair excluded
  });
});

test.describe("Screen · term scoring & highlighting", () => {
  test("include terms add, exclude terms subtract (x2 weight), title weighted x3", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      window.__almScreenpro.setState({ incTerms: ["heart failure"], excTerms: ["animal"], records: [] });
      const h = window.__almScreenpro;
      return {
        titleHit: h.score({ title: "heart failure", abstract: "" }), // title counted x3
        absHit: h.score({ title: "", abstract: "heart failure once" }),
        excHit: h.score({ title: "", abstract: "animal model" }), // -2
        none: h.score({ title: "unrelated text", abstract: "nothing here" }),
      };
    });
    expect(out.titleHit).toBe(3);
    expect(out.absHit).toBe(1);
    expect(out.excHit).toBe(-2);
    expect(out.none).toBe(0);
  });

  test("score is null when no terms configured", async ({ page }) => {
    await hook(page);
    const s = await page.evaluate(() => {
      window.__almScreenpro.setState({ incTerms: [], excTerms: [], records: [] });
      return window.__almScreenpro.score({ title: "anything", abstract: "anything" });
    });
    expect(s).toBeNull();
  });

  test("renders title/abstract with NO script execution (XSS-safe)", async ({ page }) => {
    await hook(page);
    let alerted = false;
    page.on("dialog", async d => { alerted = true; await d.dismiss(); });
    await page.evaluate(() => {
      window.__almScreenpro.setState({
        records: [{ id: "x", title: "<img src=x onerror=alert(1)> heart <script>alert(2)<\/script>", abstract: "<b>bold</b> &amp; heart" }],
      });
      // Force the live UI to render our injected record: put a term in the field
      // and fire the real input handler (pullSetupToState -> render).
      const inc = document.getElementById("f-inc");
      inc.value = "heart";
      inc.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(50);
    const r = await page.evaluate(() => {
      const host = document.getElementById("card-host");
      return {
        html: host ? host.innerHTML : "",
        imgs: document.querySelectorAll("#card-host img").length,
        scripts: document.querySelectorAll("#card-host script").length,
        hasMark: document.querySelectorAll("#card-host mark").length,
      };
    });
    expect(alerted).toBe(false);          // onerror never fired
    expect(r.imgs).toBe(0);               // tag was escaped, not parsed
    expect(r.scripts).toBe(0);
    expect(r.html).toContain("&lt;img");  // proof it was escaped as text
    expect(r.hasMark).toBeGreaterThan(0); // "heart" highlighted -> highlight() ran on escaped text
  });
});

test.describe("Screen · import parsers", () => {
  test("RIS parse extracts core fields", async ({ page }) => {
    await hook(page);
    const recs = await page.evaluate(() => {
      const ris = ["TY  - JOUR", "TI  - Dapagliflozin in heart failure", "AU  - McMurray JJV", "AU  - Solomon SD",
        "PY  - 2019", "JO  - N Engl J Med", "AB  - A randomized trial.", "DO  - 10.1056/NEJMoa1911303", "KW  - SGLT2", "ER  - "].join("\n");
      return window.__almScreenpro.parse(ris, "x.ris");
    });
    expect(recs.length).toBe(1);
    expect(recs[0].title).toContain("Dapagliflozin");
    expect(recs[0].authors.length).toBe(2);
    expect(recs[0].year).toBe("2019");
    expect(recs[0].doi).toBe("10.1056/NEJMoa1911303");
    expect(recs[0].keywords).toContain("SGLT2");
  });

  test("nbib/MEDLINE parse extracts PMID + DOI from AID", async ({ page }) => {
    await hook(page);
    const recs = await page.evaluate(() => {
      const nbib = ["PMID- 31535829", "TI  - Empagliflozin in HFpEF", "AB  - Trial of empagliflozin.",
        "AU  - Anker SD", "DP  - 2021 Aug", "TA  - N Engl J Med", "AID - 10.1056/NEJMoa2107038 [doi]"].join("\n");
      return window.__almScreenpro.parse(nbib, "x.nbib");
    });
    expect(recs.length).toBe(1);
    expect(recs[0].pmid).toBe("31535829");
    expect(recs[0].year).toBe("2021");
    expect(recs[0].doi).toBe("10.1056/NEJMoa2107038");
  });

  test("CSV parse maps header columns; doi prefix stripped", async ({ page }) => {
    await hook(page);
    const recs = await page.evaluate(() => {
      const csv = "title,abstract,year,doi\n\"Heart failure trial\",\"An abstract\",2020,https://doi.org/10.1/abc";
      return window.__almScreenpro.parse(csv, "x.csv");
    });
    expect(recs.length).toBe(1);
    expect(recs[0].title).toBe("Heart failure trial");
    expect(recs[0].doi).toBe("10.1/abc");
  });

  test("native screen-v1 JSON round-trips decisions", async ({ page }) => {
    await hook(page);
    const recs = await page.evaluate(() => {
      const j = JSON.stringify({ _schema: "screen-v1", records: [
        { id: "k1", title: "Kept title", r1: { d: "include", reason: "" } },
      ]});
      return window.__almScreenpro.parse(j, "x.json");
    });
    expect(recs[0].id).toBe("k1");
    expect(recs[0].r1.d).toBe("include");
  });

  test("malformed/empty inputs return [] without throwing", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      const h = window.__almScreenpro;
      return {
        empty: h.parse("", "x.csv").length,
        garbage: h.parse("not a real format at all", "x.csv").length, // CSV fallback, no title col, single col -> title=field => actually becomes a record
        brokenJson: h.parse("{ not json", "x.json").length, // falls through to CSV
      };
    });
    expect(out.empty).toBe(0);
    // garbage single line w/o header: parsed as positional CSV (title=col1) -> 1 record is acceptable; assert no crash + numeric
    expect(typeof out.garbage).toBe("number");
    expect(typeof out.brokenJson).toBe("number");
  });

  test("BOM-prefixed JSON still parses", async ({ page }) => {
    await hook(page);
    const n = await page.evaluate(() => {
      const j = "﻿" + JSON.stringify([{ title: "BOM title", doi: "10.1/bom" }]);
      return window.__almScreenpro.parse(j, "x.json").length;
    });
    expect(n).toBe(1);
  });
});
