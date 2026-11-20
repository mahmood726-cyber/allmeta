// rare-events-glmm: results and R verdicts must never describe a different analysis than
// the inputs on the page.
//   ALM_PLAYWRIGHT_CORE=<dir of playwright-core> node --test rare-events-glmm/tests/stale.test.cjs
//
// Requirement: editing the Studies box (typing, a loaded benchmark, a restored draft)
// invalidates the displayed fit and the R snapshot until Fit GLMM is pressed; a completed
// "Verify in R" verdict is cleared whenever the analysis is re-run or invalidated. Before the
// fix only Fit / model change re-ran; after an edit the old cards, the old R snapshot (the
// R script still carried the OLD rows) and an already displayed "MATCH n/n" stayed on screen.
// (r-check.js already discarded answers that arrive after the page moved on; this is the
// already-finished case.) WebR is stubbed: this tests page state, not R.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http"), fs = require("fs"), path = require("path");
const PW = process.env.ALM_PLAYWRIGHT_CORE;
const CHROME = process.env.ALM_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const skip = !(PW && fs.existsSync(PW) && fs.existsSync(CHROME)) && "needs ALM_PLAYWRIGHT_CORE and system Chrome";
const ROOT = path.resolve(__dirname, "../..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

test("an edit invalidates the fit and the R snapshot; a finished R verdict is cleared on re-run", { skip }, async () => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { chromium } = require(PW);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + server.address().port + "/rare-events-glmm/", { waitUntil: "load" });
    const r = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      window.AlmWebR = { runR: () => Promise.resolve({ ok: true, stdout: "stub\nMATCH 11/11\n", versions: { webR: "stub" } }) };
      const status = () => document.getElementById("rcheck-status").textContent;
      const before = window.__almRareRState();
      document.getElementById("rcheck-webr").click(); await sleep(50);
      const verdictShown = status();
      const ta = document.getElementById("src");
      ta.value = ta.value + "\nTrial 9, 4, 300, 9, 300";
      ta.dispatchEvent(new Event("input", { bubbles: true })); await sleep(50);
      const afterEdit = { state: window.__almRareRState(), status: status(), summary: document.getElementById("summary").innerText };
      document.getElementById("btn-run").click(); await sleep(50);
      const refit = { rows: window.__almRareRState() && window.__almRareRState().rows.length, status: status() };
      document.getElementById("rcheck-webr").click(); await sleep(50);
      document.getElementById("f-model").value = "CM.EL"; document.getElementById("f-model").dispatchEvent(new Event("change")); await sleep(50);
      return { beforeRows: before && before.rows.length, verdictShown, afterEdit, refit, afterModel: status() };
    });
    assert.strictEqual(r.beforeRows, 8);
    assert.match(r.verdictShown, /MATCH 11\/11/, "stub verdict was not displayed: " + r.verdictShown);
    assert.strictEqual(r.afterEdit.state, null, "R snapshot still holds the pre-edit analysis");
    assert.doesNotMatch(r.afterEdit.status, /MATCH/, "finished R verdict still shown after an edit");
    assert.doesNotMatch(r.afterEdit.summary, /OR \(GLMM\)/i, "pre-edit fit still displayed");
    assert.strictEqual(r.refit.rows, 9);
    assert.doesNotMatch(r.refit.status, /MATCH/);
    assert.doesNotMatch(r.afterModel, /MATCH/, "verdict for UM.FS still shown after switching to CM.EL");
  } finally { await browser.close(); server.close(); }
});
