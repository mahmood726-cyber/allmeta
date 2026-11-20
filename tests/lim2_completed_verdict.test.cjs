// A COMPLETED "Verify in R" verdict must describe the analysis now on the page.
//   node --test tests/lim2_completed_verdict.test.cjs
// Requirement: after R has answered for analysis A and its verdict is shown, re-running the page with a
// different analysis B (or with an input the page refuses) must remove A's verdict and say the analysis
// changed since the last R check. (tests/rpath_review_classes.test.cjs class 1 covers the in-flight race:
// an answer arriving AFTER the re-run. This covers an answer that arrived BEFORE it.)
// Control: with no re-run, the verdict stays. WebR is replaced by a runner whose answer is released by hand.
// Needs system Chrome and playwright-core (PLAYWRIGHT_CORE=<dir>/playwright-core). Port: LIM2_PORT || 18741.
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = +(process.env.LIM2_PORT || 18741);
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || "playwright-core").chromium; } catch (e) { /* skipped below */ }
const SKIP = chromium && fs.existsSync(CHROME) ? false : "needs system Chrome and playwright-core";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
let server, base, browser;
before(async () => {
  if (SKIP) return;
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r, j) => { server.once("error", j); server.listen(PORT, "127.0.0.1", r); });
  base = "http://127.0.0.1:" + PORT + "/";
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

const set = (sel, v) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })();`;
const click = (sel) => `document.querySelector(${JSON.stringify(sel)}).click();`;
const FAKE_R = "R vs page (fake runner)\nMATCH 7/7\n";
const APPS = {
  "median-to-mean": { A: click("#btn-run"), verify: "#btn-verify-r", B: set("#m", "5.2") + click("#btn-run"),
    refuse: set("#n", "0") + click("#btn-run"), scen: set("#scenario", "C3"), show: ["#rcheck-status", "#rcheck-verdict", "#rcheck-out"] },
  "p-curve": { A: click("#btn-run"), verify: "#btn-rverify", B: set("#src", "0.001 0.002 0.01 0.03 0.04") + click("#btn-run"),
    refuse: set("#src", "0.01") + click("#btn-run"), show: ["#rcheck-status", "#rcheck-out"] },
  "reverse-bayes": { A: click("#run"), verify: "#btn-rverify", B: set("#est", "1.7") + click("#run"),
    refuse: set("#est", "-1") + click("#run"), show: ["#rcheck-status", "#rcheck-out"] },
};
async function afterVerdict(app, then) {
  const c = APPS[app];
  const page = await browser.newPage();
  page.on("dialog", (d) => d.dismiss());
  await page.goto(base + app + "/", { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.evaluate(c.A); await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__pending = [];
    window.AlmWebR = window.AlmWebR || {};
    window.AlmWebR.runR = (o) => new Promise((res) => window.__pending.push({ o, res }));
    // median-to-mean asks the same-origin WebR package list first; answer it without the runtime.
    const f0 = window.fetch; window.fetch = (u, o) => /manifest\.json/.test(String(u)) ? Promise.resolve(new Response('{"packages":[]}')) : f0(u, o);
  });
  await page.evaluate(click(c.verify));
  await page.waitForFunction(() => window.__pending.length > 0, null, { timeout: 10000 });
  await page.evaluate((stdout) => window.__pending[0].res({ ok: true, stdout, versions: { R: "R version 4.5.1", webR: "0.5.5" } }), FAKE_R);
  await page.waitForTimeout(400);
  const read = () => page.evaluate((sels) => sels.map((s) => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : ""; }).join(" | "), c.show);
  const before = await read();
  if (then) { await page.evaluate(then); await page.waitForTimeout(400); }
  const afterText = await read();
  await page.close();
  return { before, after: afterText };
}
for (const app of Object.keys(APPS)) {
  const c = APPS[app];
  test(`${app} (control): a completed R verdict stays while the analysis is unchanged`, { skip: SKIP }, async () => {
    const r = await afterVerdict(app, null);
    assert.match(r.after, /MATCH 7\/7/, r.after);
  });
  const cases = { "re-run with new input": c.B, "re-run refused": c.refuse };
  if (c.scen) cases["scenario changed"] = c.scen;
  for (const [name, then] of Object.entries(cases)) {
    test(`${app}: a completed R verdict is removed when the page is ${name}`, { skip: SKIP }, async () => {
      const r = await afterVerdict(app, then);
      assert.match(r.before, /MATCH 7\/7/, "precondition: the verdict was shown:\n" + r.before);
      assert.doesNotMatch(r.after, /MATCH 7\/7/, "completed verdict for the earlier analysis still shown:\n" + r.after);
      assert.match(r.after, /changed since the last R check/i, "the page must say the earlier verdict is not current:\n" + r.after);
    });
  }
}
