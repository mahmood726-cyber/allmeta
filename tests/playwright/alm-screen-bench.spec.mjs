// Evidence guard: runs the SHIPPED Screen active-learning classifier over a REAL
// labelled SR corpus (Cohen Triptans, 671 records / 24 relevant) and pins the
// measured work-savings, so the "competitive recall" claim cannot silently
// regress. The full headline run (Cohen ACE 2544, WSS@95≈0.67) lives in
// benchmark/run_benchmark.mjs; this keeps a fast subset in CI.
import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const h = rows.shift().map((x) => x.trim());
  return rows.filter((r) => r.length > 1).map((r) => { const o = {}; h.forEach((k, i) => (o[k] = r[i] ?? "")); return o; });
}

test("active learning on the real Cohen Triptans corpus saves measurable work (WSS@95)", async ({ page }) => {
  test.setTimeout(120_000);
  const csv = parseCSV(readFileSync(join(__dirname, "..", "..", "benchmark", "data", "cohen_triptans.csv"), "utf8"));
  const recs = csv.map((r, i) => ({ id: "r" + i, title: r.title || "", abstract: r.abstract || "", gold: String(r.label_included).trim() === "1" ? 1 : 0 }));
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.__almScreenpro);
  const out = await page.evaluate((recs) => window.__almScreenpro.simulateActiveLearning({ records: recs, batch: 50 }), recs);
  expect(out.ok).toBe(true);
  expect(out.N).toBe(671);
  expect(out.totalPos).toBe(24);
  // A random screener has WSS@95 ≈ 0; the classifier must beat that by a clear margin.
  expect(out.wss95).toBeGreaterThan(0.2);
  expect(out.recallAt50pct).toBeGreaterThan(0.7);  // ≥70% of relevant found in the first half
});
