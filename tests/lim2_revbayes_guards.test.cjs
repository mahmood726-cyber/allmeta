// reverse-bayes: inputs that leave no representable or no meaningful answer are REFUSED, never given a verdict.
//   node --test tests/lim2_revbayes_guards.test.cjs
// Requirements (P26 limitations N04, N07):
//  N07  finite entries whose derived quantities are not finite in double precision -- an infinite SE (interval
//       width overflow), an infinite z_alpha (alpha so small that 1 - alpha/2 rounds to 1), an infinite/NaN/zero
//       critical prior variance (s^4 or thetaHat^2 overflow/underflow) -- must be refused by the engine.
//  N04  an estimate outside its own 95% interval must be refused by the page (a ratio estimate <= 0 keeps the
//       existing "must be positive" refusal: that check comes first, as in the archived validation's probes).
// Controls: the default example and ordinary inputs still give their results. Every one of the 1,901 archived
// P26 corpus configurations was also run old-vs-new through this logic with no difference (lane lim2 report).
// The page test needs system Chrome + playwright-core (PLAYWRIGHT_CORE); the engine tests need nothing.
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const E = require(path.join(ROOT, "shared", "reverse-bayes.js"));
const Z95 = 1.959963984540054;

test("N07: an infinite SE is refused, not called 'not significant'", () => {
  assert.ok(E.analyze(0.5, Infinity, { alpha: 0.05 }).error);
});
test("N07: alpha whose z_alpha is not finite is refused, not 'not significant at the 100% level'", () => {
  const r = E.analyze(3, 1, { alpha: 1e-300 });
  assert.ok(r.error, JSON.stringify(r).slice(0, 200));
});
for (const [name, t, s] of [["s^4 overflow (infinite prior variance)", 1e81, 1e80], ["thetaHat^2 overflow (NaN prior variance)", 1e200, 1e199], ["s^4 underflow (zero prior variance)", 1e-99, 1e-100]]) {
  test(`N07: ${name} is refused, not reported as a critical prior`, () => {
    const r = E.analyze(t, s, { alpha: 0.05 });
    assert.ok(r.error, JSON.stringify(r).slice(0, 200));
  });
}
test("control: the default example (OR 1.60, 1.15 to 2.23) still has its critical prior", () => {
  const r = E.analyze(Math.log(1.6), (Math.log(2.23) - Math.log(1.15)) / (2 * Z95), { alpha: 0.05 });
  assert.ok(!r.error && r.sceptical.exists);
  assert.strictEqual(r.sceptical.priorSD.toFixed(4), "0.1677");
});
test("control: very small but representable alpha (1e-4, an archived probe) is still analysed", () => {
  const r = E.analyze(3, 1, { alpha: 1e-4 });
  assert.ok(!r.error && Number.isFinite(r.za));
});

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = +(process.env.LIM2_PORT || 18742);
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
async function runPage(scale, est, lo, hi) {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:" + PORT + "/reverse-bayes/", { waitUntil: "load" });
  await page.selectOption("#scale", scale);
  await page.fill("#est", est); await page.fill("#lo", lo); await page.fill("#hi", hi);
  await page.click("#run");
  const r = await page.evaluate(() => ({ verdict: document.getElementById("verdict").textContent, tbl: document.getElementById("tbl").hidden, last: !!window._almLastRevBayes }));
  await page.close();
  return r;
}
test("N04: a difference estimate outside its 95% interval is refused", { skip: SKIP }, async () => {
  const r = await runPage("diff", "2", "-1", "1");
  assert.ok(r.tbl && !r.last, JSON.stringify(r));
  assert.match(r.verdict, /inside its 95% interval/);
});
test("N04: a ratio estimate outside its interval is refused", { skip: SKIP }, async () => {
  const r = await runPage("ratio", "3", "1.15", "2.23");
  assert.ok(r.tbl && !r.last, JSON.stringify(r));
  assert.match(r.verdict, /inside its 95% interval/);
});
test("N04: a non-positive ratio estimate keeps its own refusal (checked first)", { skip: SKIP }, async () => {
  const r = await runPage("ratio", "0", "1.15", "2.23");
  assert.match(r.verdict, /must be positive/);
});
test("control: an estimate inside its interval is analysed", { skip: SKIP }, async () => {
  const r = await runPage("ratio", "1.60", "1.15", "2.23");
  assert.ok(!r.tbl && r.last, JSON.stringify(r));
});
