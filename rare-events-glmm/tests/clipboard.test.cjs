// rare-events-glmm: "Copy R script" (UM.RS) must report success only when the clipboard
// write succeeded.
//   ALM_PLAYWRIGHT_CORE=<dir of playwright-core> node --test rare-events-glmm/tests/clipboard.test.cjs
//
// Before the fix the button set "Copied ✓" synchronously; writeText() returns a promise, so a
// refused write (no permission, insecure context) was never caught (LIM-P30 L24).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http"), fs = require("fs"), path = require("path");
const PW = process.env.ALM_PLAYWRIGHT_CORE;
const CHROME = process.env.ALM_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const skip = !(PW && fs.existsSync(PW) && fs.existsSync(CHROME)) && "needs ALM_PLAYWRIGHT_CORE and system Chrome";
const ROOT = path.resolve(__dirname, "../..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

test("a refused clipboard write is reported as not copied; a successful one as copied", { skip }, async () => {
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
      const m = document.getElementById("f-model"); m.value = "UM.RS"; m.dispatchEvent(new Event("change"));
      const res = {};
      for (const [k, impl] of [["refused", () => Promise.reject(new Error("NotAllowedError"))], ["ok", () => Promise.resolve()]]) {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: impl } });
        const b = document.getElementById("umrs-copy"); b.click(); await sleep(50); res[k] = b.textContent;
        m.dispatchEvent(new Event("change"));   // re-render a fresh button
      }
      return res;
    });
    assert.doesNotMatch(r.refused, /Copied/, "refused write reported as copied: " + r.refused);
    assert.match(r.ok, /Copied/);
  } finally { await browser.close(); server.close(); }
});
