// Phase 4: extract/ loads the canonical shared/sr-records-v1 module, the
// schema authority is live in-page, and the envelope round-trips through
// localStorage exactly as the pipeline relies on.
import { test, expect } from "@playwright/test";

test("extract exposes SrRecords and round-trips the canonical envelope", async ({ page }) => {
  await page.goto("/extract/index.html");

  const api = await page.evaluate(() => ({
    has: !!(window.SrRecords && window.SrRecords.normalizeRecord && window.SrRecords.read),
    key: window.SrRecords && window.SrRecords.KEY,
  }));
  expect(api.has).toBe(true);
  expect(api.key).toBe("sr-records-v1");

  // write through the module, read it back normalised
  const out = await page.evaluate(() => {
    window.SrRecords.write([{ title: "  A  Trial ", doi: "https://doi.org/10.1/x", year: "pub 2020" }]);
    const recs = window.SrRecords.read();
    return { n: recs.length, title: recs[0].title, doi: recs[0].doi, year: recs[0].year, hasSlots: !!(recs[0].r1 && recs[0].r2) };
  });
  expect(out.n).toBe(1);
  expect(out.title).toBe("A Trial");
  expect(out.doi).toBe("10.1/x");      // doi.org prefix stripped
  expect(out.year).toBe("2020");        // 4-digit extracted
  expect(out.hasSlots).toBe(true);      // decision slots always present
});
