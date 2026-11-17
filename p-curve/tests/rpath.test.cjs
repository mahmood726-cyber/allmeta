// p-curve R user path: the generated R script carries the page's CURRENT inputs
// and, run in fresh R, prints an honest MATCH n/n for the default example and for
// pasted data (plus MISMATCH when a page value is tampered with).
//   node --test p-curve/tests/rpath.test.cjs
// Needs system Chrome, playwright-core (PLAYWRIGHT_CORE=<dir> or resolvable) and
// Rscript (RSCRIPT=<path>; default R 4.6.0). R_LIBS is passed through (puniform).
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const RSCRIPT = process.env.RSCRIPT || "C:/Program Files/R/R-4.6.0/bin/Rscript.exe";
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || "playwright-core").chromium; } catch (e) { /* skipped below */ }
const READY = !!chromium && fs.existsSync(CHROME) && fs.existsSync(RSCRIPT);
const SKIP = READY ? false : "needs system Chrome, playwright-core and Rscript";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
let server, base, browser;
before(async () => {
  if (!READY) return;
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/";
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

function runR(script) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pcurve-r-")), "check.R");
  fs.writeFileSync(f, script);
  return execFileSync(RSCRIPT, ["--vanilla", f], { encoding: "utf8", env: process.env, timeout: 120000 });
}
async function scriptFor(setup) {
  const page = await browser.newPage();
  await page.goto(base + "p-curve/", { waitUntil: "load" });
  await setup(page);
  const s = await page.evaluate(() => window.PCurveRCheck.buildScript(window._almLastPcurve()));
  const shown = await page.evaluate(() => document.querySelector('[data-q="fisher_chisq"]').textContent);
  await page.close();
  return { s, shown };
}
function assertMatch(out) {
  const m = /^MATCH (\d+)\/(\d+)/m.exec(out);
  assert.ok(m, "no MATCH line:\n" + out);
  assert.strictEqual(m[1], m[2]);
  assert.ok(+m[2] >= 12, "fewer than the 12 base-R quantities were checked:\n" + out);
  assert.doesNotMatch(out, /DIFFERS|MISMATCH/);
}

test("default example: script carries the example p-values and R prints MATCH", { skip: SKIP }, async () => {
  const { s } = await scriptFor(async (p) => { await p.click("#btn-run"); });
  assert.match(s, /^p <- c\(0\.001, 0\.003, 0\.002, 0\.008, 0\.012, 0\.004, 0\.006, 0\.001, 0\.017, 0\.005, 0\.009, 0\.002\)/m);
  assert.match(s, /^test_family <- "z"/m);
  assertMatch(runR(s));
});

test("pasted data, t family df=30: script carries the user's inputs and R prints MATCH", { skip: SKIP }, async () => {
  const { s, shown } = await scriptFor(async (p) => {
    await p.fill("#src", "0.004\n0.021\n0.038\n0.011\n0.049\n0.002\n0.027\n0.016\n0.0007");
    await p.selectOption("#test", "t"); await p.fill("#df", "30"); await p.click("#btn-run");
  });
  assert.match(s, /^p <- c\(0\.004, 0\.021, 0\.038, 0\.011, 0\.049, 0\.002, 0\.027, 0\.016, 0\.0007\)/m);
  assert.match(s, /^test_family <- "t"/m);
  assert.match(s, /^df <- 30 /m);
  assert.ok(!/0\.017/.test(s.split("\n").find((l) => l.startsWith("p <- "))), "stale example data in script");
  const out = runR(s);
  assertMatch(out);
  // the page's displayed chi-square appears (rounded) in R's own value
  const rv = +/^fisher_chisq\s+\S+\s+(\S+)/m.exec(out)[1];
  assert.strictEqual(rv.toFixed(2), shown.replace(/^.*=\s*/, ""));
});

test("honesty: a tampered page value makes R print MISMATCH", { skip: SKIP }, async () => {
  const { s } = await scriptFor(async (p) => { await p.click("#btn-run"); });
  const bad = s.replace(/fisher_chisq = ([0-9.]+)/, (m, v) => "fisher_chisq = " + (parseFloat(v) + 0.01));
  assert.notStrictEqual(bad, s);
  const out = runR(bad);
  assert.match(out, /^MISMATCH \d+\/\d+/m);
  assert.match(out, /^fisher_chisq .* DIFFERS$/m);
});
