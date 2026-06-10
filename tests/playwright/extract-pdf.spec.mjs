// P0 de-risk + feature smoke: extract/ loads the vendored pdf.js under CSP,
// SrPdf extracts the text layer from a real PDF in headless Chrome, and the
// grounding module locates the source sentence for an extracted value.
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "..", "..", "extract", "tests", "fixtures", "sample-rct.pdf");

test("extract ingests a PDF offline (pdf.js under CSP) and grounds a value", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  await page.goto("/extract/index.html");

  // modules + vendored lib are live in-page
  const ready = await page.evaluate(() => ({
    pdfjs: typeof window.pdfjsLib !== "undefined" && !!window.pdfjsLib.getDocument,
    srpdf: !!(window.SrPdf && window.SrPdf.extractText),
    grounding: !!(window.SrGrounding && window.SrGrounding.validateQuote),
  }));
  expect(ready).toEqual({ pdfjs: true, srpdf: true, grounding: true });

  // fetch the committed fixture PDF and extract its text layer entirely client-side
  const out = await page.evaluate(async () => {
    const buf = await (await fetch("/extract/tests/fixtures/sample-rct.pdf")).arrayBuffer();
    const res = await window.SrPdf.extractText(buf);
    const g = window.SrGrounding.validateQuote(res.text, "Hazard ratio 0.86 (95% CI 0.78 to 0.95)");
    return { text: res.text, pages: res.pages.length, grounded: g.grounded, sentence: g.sentence };
  });

  expect(out.pages).toBe(1);
  expect(out.text).toMatch(/Hazard ratio/i);
  expect(out.text).toMatch(/0\.86/);
  expect(out.text).toMatch(/0\.78/);
  expect(out.text).toMatch(/4744/);
  expect(out.grounded).toBe(true);                 // the quote is genuinely in the PDF
  expect(out.sentence).toMatch(/Hazard ratio/i);

  // a fabricated quote must NOT validate
  const fake = await page.evaluate(() =>
    window.SrGrounding.validateQuote("Hazard ratio 0.86 in the trial.", "Odds ratio 2.50 (95% CI 1.10 to 5.00)").grounded);
  expect(fake).toBe(false);

  // no eval/CSP violations from pdf.js
  expect(consoleErrors.join("\n")).not.toMatch(/Content Security Policy|unsafe-eval|eval/i);
});

test("importing a PDF through the UI extracts a row and shows a grounded source", async ({ page }) => {
  await page.goto("/extract/index.html");
  await page.setInputFiles("#file-pdf", FIXTURE);

  // a row for the PDF appears (title from filename) and is extracted
  const firstRow = page.locator("#etable tbody tr.row-click").first();
  await expect(firstRow).toContainText("sample-rct", { timeout: 10000 });
  await expect(firstRow).toContainText("HR 0.86");        // deterministic effect from the PDF text

  // expand it -> the primary effect shows its grounded source sentence
  await firstRow.click();
  const detail = page.locator("#etable tbody tr.detail").first();
  await expect(detail).toContainText("grounded");
  await expect(detail).toContainText(/Hazard ratio 0\.86/i);
});

test("LLM-proposed values are accepted only when their quote is grounded", async ({ page }) => {
  await page.goto("/extract/index.html");

  const res = await page.evaluate(() => {
    window.__almExtract.appendRecords([{ id: "g1", title: "Trial G", abstract: "The hazard ratio was 0.80 (95% CI 0.70 to 0.92) for the primary outcome." }]);
    // one grounded quote (verbatim in the abstract), one fabricated
    window.__almExtract.applyAndRender([
      { id: "g1", primaryEffect: { measure: "HR", point: 0.80, lo: 0.70, hi: 0.92, quote: "The hazard ratio was 0.80 (95% CI 0.70 to 0.92)" } },
    ]);
    const good = window.__almExtract.grounding("g1");

    window.__almExtract.appendRecords([{ id: "g2", title: "Trial H", abstract: "The hazard ratio was 0.80 (95% CI 0.70 to 0.92) for the primary outcome." }]);
    window.__almExtract.applyAndRender([
      { id: "g2", primaryEffect: { measure: "OR", point: 2.5, lo: 1.1, hi: 5.0, quote: "Odds ratio 2.50 (95% CI 1.10 to 5.00)" } },
    ]);
    const bad = window.__almExtract.grounding("g2");
    return { good, bad };
  });

  expect(res.good.grounded).toBe(true);
  expect(res.bad.grounded).toBe(false);   // fabricated quote -> flagged, not trusted
});
