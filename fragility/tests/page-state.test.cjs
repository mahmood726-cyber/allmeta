// fragility: what the page shows must always describe the current input.
//   ALM_PLAYWRIGHT_CORE=<dir of playwright-core> node --test fragility/tests/page-state.test.cjs
//
// L04 (LIM-P33): if the engine throws, the result is replaced by an error; before, run() had
//   no catch, so the previous analysis's table stayed beside the new input (modifications
//   were already cleared). The engine is stubbed to throw: shared/fragility.js is in
//   emailed_deps.txt, and after 09b5d0ad the reported extreme counts no longer reach it.
// L17 (LIM-P33): a finished "Verify in R" verdict is cleared when the analysis re-runs
//   (r-check.js discarded only answers still in flight). WebR is stubbed.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http"), fs = require("fs"), path = require("path");
const PW = process.env.ALM_PLAYWRIGHT_CORE;
const CHROME = process.env.ALM_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const skip = !(PW && fs.existsSync(PW) && fs.existsSync(CHROME)) && "needs ALM_PLAYWRIGHT_CORE and system Chrome";
const ROOT = path.resolve(__dirname, "../..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

async function withPage(fn) {
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
    await page.goto("http://127.0.0.1:" + server.address().port + "/fragility/", { waitUntil: "load" });
    return await fn(page);
  } finally { await browser.close(); server.close(); }
}

test("L04: an engine exception replaces the previous result", { skip }, async () => {
  const r = await withPage((page) => page.evaluate(() => {
    const before = document.getElementById("tbody").innerText;
    const real = window.AlmFragility.fragility;
    window.AlmFragility.fragility = () => { throw new Error("stub failure"); };
    const ta = document.getElementById("data"); ta.value = "1, 10, 5, 10\n2, 10, 6, 10";
    let threw = false; try { ta.dispatchEvent(new Event("input")); } catch (e) { threw = true; }
    window.AlmFragility.fragility = real;
    return { before, after: document.getElementById("tbody").innerText, state: window.__almFragilityRState(), threw };
  }));
  assert.match(r.before, /fragility index/i);
  assert.doesNotMatch(r.after, /fragility index/i, "previous table still shown: " + r.after);
  assert.match(r.after, /failed/i);
  assert.strictEqual(r.state, null);
});
