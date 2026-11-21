// rare-events-glmm: the Studies box must never change the analysis silently.
//   ALM_PLAYWRIGHT_CORE=<dir of playwright-core> node --test rare-events-glmm/tests/parse.test.cjs
//
// Requirement: a row is "label, events_T, n_T, events_C, n_C" with four whole non-negative
// counts (digits only, exactly representable), positive arm totals and events <= totals.
// Any other non-comment row blocks the fit and is named by line number; it is never
// truncated ("2.7" -> 2, "3abc" -> 3, "1e1" -> 1, "-0.5" -> 0), padded or dropped. Before the
// fix parseInt() did all of these and an impossible row (9 events of 5) vanished, so the page
// fitted fewer or different studies than the user typed with no notice. A header line of
// column names (no digits in the count fields) as the first data line is still skipped.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http"), fs = require("fs"), path = require("path");
const PW = process.env.ALM_PLAYWRIGHT_CORE;
const CHROME = process.env.ALM_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const skip = !(PW && fs.existsSync(PW) && fs.existsSync(CHROME)) && "needs ALM_PLAYWRIGHT_CORE and system Chrome";
const ROOT = path.resolve(__dirname, "../..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const BAD = {
  "decimal count": "A, 2.7, 100, 5, 100\nB, 1, 120, 4, 118\nC, 3, 90, 6, 95",
  "numeric prefix": "A, 3abc, 100, 5, 100\nB, 1, 120, 4, 118\nC, 3, 90, 6, 95",
  "scientific notation": "A, 1e1, 100, 5, 100\nB, 1, 120, 4, 118\nC, 3, 90, 6, 95",
  "negative fraction": "A, -0.5, 100, 5, 100\nB, 1, 120, 4, 118\nC, 3, 90, 6, 95",
  "extra field": "A, 2, 100, 5, 100, 999\nB, 1, 120, 4, 118\nC, 3, 90, 6, 95",
  "missing field": "A, 2, 100, 5\nB, 1, 120, 4, 118\nC, 3, 90, 6, 95",
  "events exceed total": "A, 2, 100, 5, 100\nB, 1, 120, 4, 118\nC, 9, 5, 1, 50",
  "zero total": "A, 0, 0, 5, 100\nB, 1, 120, 4, 118\nC, 3, 90, 6, 95",
  "unsafe integer": "A, 2, 9007199254740993, 5, 100\nB, 1, 120, 4, 118\nC, 3, 90, 6, 95",
};

test("malformed rows block the fit and are named; valid data and a header still fit", { skip }, async () => {
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
    const runCase = (text) => page.evaluate((t) => {
      document.getElementById("src").value = t; document.getElementById("btn-run").click();
      const st = window.__almRareRState();
      return { summary: document.getElementById("summary").innerText, rows: st ? st.rows.length : null };
    }, text);
    for (const [name, text] of Object.entries(BAD)) {
      const r = await runCase(text);
      assert.strictEqual(r.rows, null, name + ": the page fitted " + r.rows + " rows: " + r.summary);
      assert.match(r.summary, /line 1|line 3/, name + ": the bad line is not named: " + r.summary);
    }
    const ok = await runCase("label, events_T, n_T, events_C, n_C\n# comment\nA, 2, 100, 5, 100\nB, 1, 120, 4, 118\nC, 3, 90, 6, 95");
    assert.strictEqual(ok.rows, 3, ok.summary);
    assert.match(ok.summary, /K STUDIES\s*3|k studies\s*3/i);
  } finally { await browser.close(); server.close(); }
});
