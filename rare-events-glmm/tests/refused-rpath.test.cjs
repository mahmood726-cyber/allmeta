// rare-events-glmm: when the page refuses a browser fit for valid counts, the R script must
// still be available (to see what metafor does with the data), and it must say NOT A
// CHECK rather than compare anything.
//   ALM_PLAYWRIGHT_CORE=<dir of playwright-core> node --test rare-events-glmm/tests/refused-rpath.test.cjs
//
// Before the fix _rstate stayed null after a refused fit, so both R buttons said "Nothing
// to check" although the parsed counts were valid (LIM-P30 L18). Invalid input and fewer
// than two rows still give no script.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http"), fs = require("fs"), path = require("path");
const RC = require("../r-check.js");
const PW = process.env.ALM_PLAYWRIGHT_CORE;
const CHROME = process.env.ALM_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const skip = !(PW && fs.existsSync(PW) && fs.existsSync(CHROME)) && "needs ALM_PLAYWRIGHT_CORE and system Chrome";
const ROOT = path.resolve(__dirname, "../..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

test("script for a refused fit fits in R, compares nothing and says why", () => {
  const s = RC.buildScript({ model: "UM.FS", rows: [{ label: "A", events_T: 3, n_T: 50, events_C: 0, n_C: 50 }, { label: "B", events_T: 5, n_T: 60, events_C: 0, n_C: 60 }], page: null, refused: "Complete separation: every control arm has 0 events" });
  assert.match(s, /rma\.glmm\(/);
  assert.match(s, /NOT A CHECK: the page refused this fit/);
  assert.match(s, /Complete separation/);
  assert.doesNotMatch(s, /UM\.RS is R-only/);
  assert.doesNotMatch(s, /\nchk\(/, "nothing may be compared");
});

test("a refused browser fit keeps the parsed rows for the R script", { skip }, async () => {
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
    const r = await page.evaluate(() => {
      const ta = document.getElementById("src");
      ta.value = "A, 3, 50, 0, 50\nB, 5, 60, 0, 60"; document.getElementById("btn-run").click();
      const st = window.__almRareRState();
      const refused = { summary: document.getElementById("summary").innerText, rows: st && st.rows.length, page: st && st.page, refused: st && st.refused };
      ta.value = "A, 3, 50, 0, 50"; document.getElementById("btn-run").click();
      return { refused, one: window.__almRareRState() };
    });
    assert.match(r.refused.summary, /fit failed/i);
    assert.strictEqual(r.refused.rows, 2);
    assert.strictEqual(r.refused.page, null);
    assert.match(String(r.refused.refused), /separation/i);
    assert.strictEqual(r.one, null, "one study: still nothing to check");
  } finally { await browser.close(); server.close(); }
});
