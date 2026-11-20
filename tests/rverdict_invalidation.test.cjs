// A COMPLETED "Verify in R" verdict must not outlive the analysis it was computed for (lane lim8, 2026-11-20;
// limitation sweeps P56 F16, P58 F13, P64 L12).
//   node --test tests/rverdict_invalidation.test.cjs
// Needs system Chrome and playwright-core (PLAYWRIGHT_CORE=<dir>/playwright-core); serves this checkout on
// 127.0.0.1:${RVI_PORT || 18617}. WebR is replaced by a fake runner, so no R is downloaded.
//
// Requirements (each per app):
//  1. Control: Verify on an unchanged analysis shows R's verdict.
//  2. After that verdict is shown, an edit that re-runs the analysis clears the verdict and its output, and
//     the page says the earlier check is no longer current (before: "MATCH" stayed beside the new numbers).
//  3. A runner whose promise REJECTS leaves the Verify button usable and reports that R did not run.
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = +(process.env.RVI_PORT || 18617);
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
const FAKE = "fake R\nMATCH 7/7\n";
const VERS = { R: "R version 4.5.1", webR: "0.5.5", metafor: "4.8-0" };

const APPS = {
  robma: { A: "0", verify: "#btn-r-webr", B: set("#f-data", "A, 0.30, 0.12\nB, 0.12, 0.20\nC, 0.55, 0.18"), show: ["#r-check-status", "#r-check-out"] },
};

async function open(app) {
  const page = await browser.newPage();
  page.on("dialog", (d) => d.dismiss());
  await page.goto(base + app + "/", { waitUntil: "load" });
  await page.waitForTimeout(600);
  return page;
}
const shown = (page, sels) => page.evaluate((s) => s.map((x) => { const e = document.querySelector(x); return e && !e.hidden ? e.textContent : ""; }).join(" | "), sels);

for (const app of Object.keys(APPS)) {
  const c = APPS[app];
  test(`${app}: a completed verdict is shown, then cleared when the analysis changes`, { skip: SKIP }, async () => {
    const page = await open(app);
    await page.evaluate(c.A); await page.waitForTimeout(300);
    await page.evaluate(([out, v]) => { window.AlmWebR = window.AlmWebR || {}; window.AlmWebR.runR = () => Promise.resolve({ ok: true, stdout: out, versions: v }); }, [FAKE, VERS]);
    await page.evaluate(click(c.verify)); await page.waitForTimeout(500);
    assert.match(await shown(page, c.show), /MATCH 7\/7/, "control: the verdict of an unchanged analysis must be shown");
    await page.evaluate(c.B); await page.waitForTimeout(500);
    const after = await shown(page, c.show);
    await page.close();
    assert.doesNotMatch(after, /MATCH 7\/7/, "the completed verdict stayed beside a changed analysis:\n" + after);
    assert.match(after, /changed since the last R check/i, "the page must say the earlier check is not current:\n" + after);
  });
  test(`${app}: a rejected runner leaves Verify usable and says R did not run`, { skip: SKIP }, async () => {
    const page = await open(app);
    await page.evaluate(c.A); await page.waitForTimeout(300);
    await page.evaluate(() => { window.AlmWebR = window.AlmWebR || {}; window.AlmWebR.runR = () => Promise.reject(new Error("worker died")); });
    await page.evaluate(click(c.verify)); await page.waitForTimeout(500);
    const disabled = await page.evaluate((s) => document.querySelector(s).disabled, c.verify);
    const txt = await shown(page, c.show);
    await page.close();
    assert.strictEqual(disabled, false, "Verify stayed disabled after the runner rejected");
    assert.match(txt, /did not run|could not run/i, "the page must report the failure:\n" + txt);
  });
}
