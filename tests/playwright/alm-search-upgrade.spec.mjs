// Search app — 2026-06-08 recall upgrade: free query expansion (synonyms /
// abbreviations / brand-generic / spelling), TF-IDF cosine semantic ranking, and
// OpenAlex citation-chasing (snowballing) URL + seed logic. Drives shipped code.
import { test, expect } from "@playwright/test";

const APP = "/search/index.html";
async function hook(page) {
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__almSearch);
}

test.describe("Search · query expansion", () => {
  test("expands a concept into an OR-group of synonyms + abbreviation", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => window.__almSearch.expandQuery("heart failure AND sglt2"));
    expect(out.query).toContain("cardiac failure");
    expect(out.query).toContain("CHF");
    expect(out.query).toContain("gliflozin");
    expect(out.query).toMatch(/\(\s*"?heart failure"? OR/i);
    expect(out.added).toBeGreaterThan(0);
  });

  test("adds British/American spelling variants", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => window.__almSearch.expandQuery("randomized tumour oedema"));
    expect(out.query).toContain("randomised");
    expect(out.query).toContain("tumor");
    expect(out.query).toContain("edema");
  });

  test("does not nest-expand: longer phrase consumes its sub-words", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => window.__almSearch.expandQuery("randomized controlled trial"));
    // 'randomized controlled trial' is expanded once as a phrase; the bare
    // 'randomized' key must not re-expand inside the produced group.
    expect((out.query.match(/randomised controlled trial/gi) || []).length).toBe(1);
    expect(out.query).toContain("RCT");
    // no doubled "OR randomised OR" artefact from re-matching the inner word
    expect(out.query).not.toMatch(/randomised OR randomised/i);
  });

  test("brand/generic drug names are added", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => window.__almSearch.expandQuery("dapagliflozin"));
    expect(out.query.toLowerCase()).toContain("farxiga");
  });

  test("empty query expands to nothing without throwing", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => window.__almSearch.expandQuery(""));
    expect(out.query).toBe("");
    expect(out.added).toBe(0);
  });
});

test.describe("Search · semantic relevance ranking", () => {
  test("ranks a query-matching record above an unrelated one (TF-IDF cosine)", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => {
      const recs = [
        { title: "SGLT2 inhibitors reduce heart failure hospitalization", abstract: "dapagliflozin empagliflozin cardiovascular mortality outcomes in heart failure" },
        { title: "Photosynthesis in marine algae", abstract: "chlorophyll light harvesting carbon fixation in phytoplankton" },
        { title: "Heart failure with preserved ejection fraction and SGLT2", abstract: "empagliflozin reduced hospitalization in HFpEF cardiovascular" },
      ];
      window.__almSearch.semanticRank(recs, "SGLT2 inhibitors for heart failure");
      return recs.map((r) => r.relevance);
    });
    // the two cardiology records outscore the algae record
    expect(out[0]).toBeGreaterThan(out[1]);
    expect(out[2]).toBeGreaterThan(out[1]);
    expect(out[1]).toBeGreaterThanOrEqual(0);
  });

  test("relevance is deterministic and reproducible", async ({ page }) => {
    await hook(page);
    const [a, b] = await page.evaluate(() => {
      const mk = () => [
        { title: "diabetes management with metformin", abstract: "glycemic control type 2 diabetes" },
        { title: "renal outcomes in chronic kidney disease", abstract: "egfr proteinuria progression" },
      ];
      const r1 = mk(); window.__almSearch.semanticRank(r1, "metformin diabetes");
      const r2 = mk(); window.__almSearch.semanticRank(r2, "metformin diabetes");
      return [r1.map((x) => x.relevance), r2.map((x) => x.relevance)];
    });
    expect(a).toEqual(b);
  });
});

test.describe("Search · snowballing (citation chasing)", () => {
  test("OpenAlex URL builders are well-formed", async ({ page }) => {
    await hook(page);
    const out = await page.evaluate(() => ({
      citing: window.__almSearch.oaCitingUrl("W123", 50),
      ids: window.__almSearch.oaIdsUrl(["W1", "W2", "W3"], 50),
    }));
    expect(out.citing).toBe("https://api.openalex.org/works?filter=cites:W123&per-page=50");
    expect(out.ids).toBe("https://api.openalex.org/works?filter=openalex_id:W1|W2|W3&per-page=50");
  });

  test("seedOaIds harvests OpenAlex ids from results and skips non-OA / dup records", async ({ page }) => {
    await hook(page);
    const ids = await page.evaluate(() => window.__almSearch.seedOaIds([
      { source: "OpenAlex", oaId: "W111", url: "https://openalex.org/W111" },
      { source: "Crossref", oaId: "", url: "https://doi.org/10.1/x" },     // no OA id -> skipped
      { source: "OpenAlex", oaId: "W222", url: "https://openalex.org/W222", dup: true }, // dup -> skipped
      { source: "OpenAlex", oaId: "W333", url: "https://openalex.org/W333" },
    ], 25));
    expect(ids).toEqual(["W111", "W333"]);
  });

  test("mapOpenAlex carries the OpenAlex id for downstream snowballing", async ({ page }) => {
    await hook(page);
    const rec = await page.evaluate(() => window.__almSearch.mapOpenAlex({
      id: "https://openalex.org/W42", display_name: "A trial", publication_year: 2020,
      authorships: [{ author: { display_name: "Smith J" } }],
    }));
    expect(rec.oaId).toBe("W42");
    expect(rec.source).toBe("OpenAlex");
    expect(rec.title).toBe("A trial");
  });
});
