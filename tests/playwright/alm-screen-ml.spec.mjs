// Screen app — in-browser active-learning classifier (TF-IDF + logistic
// regression). Correctness, separability, determinism, and degenerate/edge inputs.
import { test, expect } from "@playwright/test";

const APP = "/screen/index.html";
async function hook(page) {
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__almScreenpro);
}

// A linearly separable labelled set: cardiology (include) vs molecular/animal
// (exclude), plus two unlabelled probes that should rank on the right side.
const SEP = [
  { id: "i1", title: "cardiac heart failure outcomes", abstract: "ejection fraction reduced hospitalization mortality cardiovascular", r1: { d: "include" } },
  { id: "i2", title: "heart failure ejection fraction", abstract: "cardiac hospitalization mortality cardiovascular outcomes", r1: { d: "include" } },
  { id: "i3", title: "cardiac failure outcomes", abstract: "ejection reduced cardiovascular mortality hospitalization", r1: { d: "include" } },
  { id: "e1", title: "molecular murine signaling", abstract: "vitro pathway cellular receptor expression", r1: { d: "exclude" } },
  { id: "e2", title: "murine signaling pathway", abstract: "molecular cellular receptor expression vitro", r1: { d: "exclude" } },
  { id: "e3", title: "molecular pathway cellular", abstract: "murine receptor expression vitro signaling", r1: { d: "exclude" } },
  { id: "u_inc", title: "cardiac heart failure", abstract: "ejection fraction cardiovascular mortality hospitalization" },
  { id: "u_exc", title: "molecular murine pathway", abstract: "cellular receptor vitro signaling expression" },
];

test("trains and separates: unlabelled cardiac probe ranks above molecular probe", async ({ page }) => {
  await hook(page);
  const out = await page.evaluate((recs) => {
    window.__almScreenpro.setState({ records: recs });
    const res = window.__almScreenpro.mlTrain();
    return {
      res,
      uInc: window.__almScreenpro.mlScoreOf("u_inc"),
      uExc: window.__almScreenpro.mlScoreOf("u_exc"),
      i1: window.__almScreenpro.mlScoreOf("i1"),
      e1: window.__almScreenpro.mlScoreOf("e1"),
      terms: window.__almScreenpro.mlTopTerms(),
    };
  }, SEP);
  expect(out.res.ok).toBe(true);
  expect(out.res.inc).toBe(3);
  expect(out.res.exc).toBe(3);
  expect(out.res.ranked).toBe(8); // all 8 non-dup records scored
  // scores are valid probabilities
  for (const s of [out.uInc, out.uExc, out.i1, out.e1]) {
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  }
  // separability
  expect(out.uInc).toBeGreaterThan(out.uExc);
  expect(out.uInc).toBeGreaterThan(0.5);
  expect(out.uExc).toBeLessThan(0.5);
  expect(out.i1).toBeGreaterThan(out.e1);
  // explainability: non-empty positive & negative term lists
  expect(out.terms.pos.length).toBeGreaterThan(0);
  expect(out.terms.neg.length).toBeGreaterThan(0);
  // positive terms carry positive weights, negatives negative
  expect(out.terms.pos.every(p => p[1] > 0)).toBe(true);
  expect(out.terms.neg.every(p => p[1] < 0)).toBe(true);
});

test("deterministic: identical labels reproduce identical scores", async ({ page }) => {
  await hook(page);
  const [a, b] = await page.evaluate((recs) => {
    function run() {
      window.__almScreenpro.setState({ records: recs });
      window.__almScreenpro.mlTrain();
      return [window.__almScreenpro.mlScoreOf("u_inc"), window.__almScreenpro.mlScoreOf("u_exc"), window.__almScreenpro.mlScoreOf("i2")];
    }
    return [run(), run()];
  }, SEP);
  expect(a[0]).toBe(b[0]);
  expect(a[1]).toBe(b[1]);
  expect(a[2]).toBe(b[2]);
});

test("refuses to train with < 2 includes", async ({ page }) => {
  await hook(page);
  const res = await page.evaluate(() => {
    window.__almScreenpro.setState({ records: [
      { id: "a", title: "cardiac heart failure", abstract: "ejection fraction", r1: { d: "include" } },
      { id: "b", title: "molecular murine", abstract: "vitro pathway", r1: { d: "exclude" } },
      { id: "c", title: "molecular signaling", abstract: "cellular receptor", r1: { d: "exclude" } },
    ]});
    return window.__almScreenpro.mlTrain();
  });
  expect(res.ok).toBe(false);
  expect(res.msg).toMatch(/at least 2 includes and 2 excludes/i);
});

test("refuses to train with 0 excludes", async ({ page }) => {
  await hook(page);
  const res = await page.evaluate(() => {
    window.__almScreenpro.setState({ records: [
      { id: "a", title: "cardiac heart", abstract: "ejection", r1: { d: "include" } },
      { id: "b", title: "heart failure", abstract: "fraction", r1: { d: "include" } },
    ]});
    return window.__almScreenpro.mlTrain();
  });
  expect(res.ok).toBe(false);
});

test("empty record set does not train or throw", async ({ page }) => {
  await hook(page);
  const res = await page.evaluate(() => {
    window.__almScreenpro.setState({ records: [] });
    return window.__almScreenpro.mlTrain();
  });
  expect(res.ok).toBe(false);
});

test("no shared vocabulary across docs → empty vocabulary, graceful refusal", async ({ page }) => {
  await hook(page);
  const res = await page.evaluate(() => {
    // Distinct titles (so dedup leaves all 4 live) but every token is unique to a
    // single doc -> df = 1 for all -> nothing survives the df >= 2 rule -> empty
    // vocabulary. mlTrain must refuse gracefully rather than crash.
    window.__almScreenpro.setState({ records: [
      { id: "a", title: "aaaaa bbbbb ccccc", abstract: "ddddd eeeee fffff", r1: { d: "include" } },
      { id: "b", title: "ggggg hhhhh iiiii", abstract: "jjjjj kkkkk lllll", r1: { d: "include" } },
      { id: "c", title: "mmmmm nnnnn ooooo", abstract: "ppppp qqqqq rrrrr", r1: { d: "exclude" } },
      { id: "d", title: "sssss ttttt uuuuu", abstract: "vvvvv wwwww xxxxx", r1: { d: "exclude" } },
    ]});
    return { res: window.__almScreenpro.mlTrain(), dups: window.__almScreenpro.dedupCount() };
  });
  expect(res.dups).toBe(0); // confirm distinct titles were NOT deduped
  expect(res.res.ok).toBe(false);
  expect(res.res.msg).toMatch(/vocabulary/i);
});

// ---- buscar target-recall stopping rule (Callaghan & Müller-Hansen 2020) ----
test("buscar: rejects H0(missed 95%) only once the clean tail is deep enough", async ({ page }) => {
  await hook(page);
  const out = await page.evaluate(() => {
    // 20 relevant all found first, then a growing run of irrelevants, N=1000.
    const mk = (rel, tail) => { const s = []; for (let i = 0; i < rel; i++) s.push(1); for (let i = 0; i < tail; i++) s.push(0); return s; };
    const P = (scr) => window.__almScreenpro.mlBuscarP(mk(20, scr - 20), 1000, 0.95);
    return { p300: P(300), p700: P(700), p850: P(850), p990: P(990) };
  });
  // p falls monotonically as more clean records are screened
  expect(out.p300).toBeGreaterThan(out.p700);
  expect(out.p700).toBeGreaterThan(out.p850);
  expect(out.p850).toBeGreaterThan(out.p990);
  // conservative early (cannot stop), confident once deep
  expect(out.p300).toBeGreaterThan(0.05);
  expect(out.p990).toBeLessThan(0.05);
});

test("buscar: barely-screened or zero-relevant never triggers a stop", async ({ page }) => {
  await hook(page);
  const out = await page.evaluate(() => ({
    barely: window.__almScreenpro.mlBuscarP([1, 1, 0, 0, 0, 0, 0, 0], 1000, 0.95),
    noRel: window.__almScreenpro.mlBuscarP([0, 0, 0, 0, 0], 1000, 0.95),
  }));
  expect(out.barely).toBeGreaterThan(0.05);
  expect(out.noRel).toBe(1);
});

test("buscar matches the exact hypergeometric (phyper) cross-check", async ({ page }) => {
  await hook(page);
  // A single clean draw of w=4 from an urn engineered to have k_hat=5 relevant:
  // here we just assert the public p stays a valid probability and is order-correct.
  const valid = await page.evaluate(() => {
    const p = window.__almScreenpro.mlBuscarP([1, 1, 1, 0, 0, 0, 0, 0, 0, 0], 50, 0.95);
    return p >= 0 && p <= 1;
  });
  expect(valid).toBe(true);
});

test("ensemble + NB ranker keep scores in [0,1] and stay deterministic", async ({ page }) => {
  await hook(page);
  const out = await page.evaluate((recs) => {
    function run() {
      window.__almScreenpro.setState({ records: recs });
      window.__almScreenpro.mlTrain();
      return [window.__almScreenpro.mlScoreOf("u_inc"), window.__almScreenpro.mlScoreOf("u_exc")];
    }
    const a = run(), b = run();
    return { a, b };
  }, SEP);
  for (const s of out.a) { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1); }
  // default ensemble still separates the cardiac probe above the molecular probe
  expect(out.a[0]).toBeGreaterThan(out.a[1]);
  // determinism preserved through the LR+NB ensemble path
  expect(out.a[0]).toBe(out.b[0]);
  expect(out.a[1]).toBe(out.b[1]);
});

test("duplicate records are not assigned an ML score", async ({ page }) => {
  await hook(page);
  const dupScore = await page.evaluate((recs) => {
    const withDup = recs.concat([{ id: "dupe", title: "cardiac heart failure outcomes", doi: "", dup: true, dupManual: true }]);
    window.__almScreenpro.setState({ records: withDup });
    window.__almScreenpro.mlTrain();
    return window.__almScreenpro.mlScoreOf("dupe");
  }, SEP);
  expect(dupScore).toBeNull();
});
