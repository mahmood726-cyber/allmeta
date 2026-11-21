// Primary buttons keep readable text in dark mode (P24 L20, P26 N19).
//   node --test tests/lim2_dark_contrast.test.cjs
// Requirement: under prefers-color-scheme: dark the primary buttons' text/background contrast ratio is at
// least 4.5 (WCAG AA for normal text). Before the fix the text was white on the light dark-mode accent
// #6aa6d4 (2.62). Control: the light-mode buttons (white on #2c5e8a, 6.83) are unchanged.
// Needs system Chrome and playwright-core (PLAYWRIGHT_CORE). Port: LIM2_PORT3 || 18743.
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = +(process.env.LIM2_PORT3 || 18743);
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || "playwright-core").chromium; } catch (e) { /* skipped below */ }
const SKIP = chromium && fs.existsSync(CHROME) ? false : "needs system Chrome and playwright-core";
let server, browser;
before(async () => {
  if (SKIP) return;
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r, j) => { server.once("error", j); server.listen(PORT, "127.0.0.1", r); });
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });
async function contrast(app, sel, scheme) {
  const ctx = await browser.newContext({ colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:" + PORT + "/" + app + "/", { waitUntil: "load" });
  const r = await page.evaluate((sel) => {
    const cs = getComputedStyle(document.querySelector(sel));
    const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
    const L = (c) => { const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const a = L(rgb(cs.color)), b = L(rgb(cs.backgroundColor));
    return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), color: cs.color, bg: cs.backgroundColor };
  }, sel);
  await ctx.close();
  return r;
}
for (const [app, sel] of [["median-to-mean", "#btn-run"], ["reverse-bayes", "#run"]]) {
  test(`${app}: dark-mode primary button text contrast >= 4.5`, { skip: SKIP }, async () => {
    const r = await contrast(app, sel, "dark");
    assert.ok(r.ratio >= 4.5, JSON.stringify(r));
  });
  test(`${app} (control): light-mode primary button contrast >= 4.5`, { skip: SKIP }, async () => {
    const r = await contrast(app, sel, "light");
    assert.ok(r.ratio >= 4.5, JSON.stringify(r));
  });
}
