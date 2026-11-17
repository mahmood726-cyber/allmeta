// reverse-bayes R user path: the generated R script carries the page's CURRENT
// inputs and, run in fresh R, prints an honest MATCH n/n for the default example
// and for user-entered data (plus MISMATCH when a page value is tampered with).
//   node --test reverse-bayes/tests/rpath.test.cjs
// Needs system Chrome, playwright-core (PLAYWRIGHT_CORE=<dir> or resolvable) and
// Rscript (RSCRIPT=<path>; default R 4.6.0). R_LIBS is passed through.
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
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "revbayes-r-")), "check.R");
  fs.writeFileSync(f, script);
  return execFileSync(RSCRIPT, ["--vanilla", f], { encoding: "utf8", env: process.env, timeout: 120000 });
}
async function scriptFor(setup) {
  const page = await browser.newPage();
  await page.goto(base + "reverse-bayes/", { waitUntil: "load" });
  await setup(page);
  const s = await page.evaluate(() => window.RevBayesRCheck.buildScript(window._almLastRevBayes));
  const shown = await page.evaluate(() => document.getElementById("rtau").textContent);
  await page.close();
  return { s, shown };
}
function assertMatch(out, nmin) {
  const m = /^MATCH (\d+)\/(\d+)/m.exec(out);
  assert.ok(m, "no MATCH line:\n" + out);
  assert.strictEqual(m[1], m[2]);
  assert.ok(+m[2] >= nmin, "fewer quantities checked than displayed:\n" + out);
  assert.doesNotMatch(out, /DIFFERS|MISMATCH/);
}

test("default example: script carries OR 1.60 (1.15-2.23) and R prints MATCH", { skip: SKIP }, async () => {
  const { s } = await scriptFor(async (p) => { await p.click("#run"); });
  assert.match(s, /^scale <- "ratio"/m);
  assert.match(s, /^est <- 1\.6; lo <- 1\.15; hi <- 2\.23/m);
  assert.match(s, /^alpha <- 0\.05 /m);
  assertMatch(runR(s), 11);
});

test("user-entered SMD 0.35 (0.12-0.58), then OR 0.78 at alpha 0.01: inputs carried, R prints MATCH", { skip: SKIP }, async () => {
  const a = await scriptFor(async (p) => {
    await p.selectOption("#scale", "diff"); await p.fill("#est", "0.35"); await p.fill("#lo", "0.12"); await p.fill("#hi", "0.58"); await p.click("#run");
  });
  assert.match(a.s, /^scale <- "diff"/m);
  assert.match(a.s, /^est <- 0\.35; lo <- 0\.12; hi <- 0\.58/m);
  const out = runR(a.s);
  assertMatch(out, 11);
  const rv = +/^tau_s\s+\S+\s+(\S+)/m.exec(out)[1];
  assert.strictEqual(rv.toFixed(4), a.shown.split(/\s+/)[0]);   // R's value rounds to what the page shows
  const b = await scriptFor(async (p) => {
    await p.fill("#est", "0.78"); await p.fill("#lo", "0.66"); await p.fill("#hi", "0.92"); await p.fill("#alpha", "0.01"); await p.click("#run");
  });
  assert.match(b.s, /^est <- 0\.78; lo <- 0\.66; hi <- 0\.92/m);
  assert.match(b.s, /^alpha <- 0\.01 /m);
  assertMatch(runR(b.s), 11);
});

test("not significant (OR 1.2, 0.9-1.6): no sceptical prior on either side, R prints MATCH", { skip: SKIP }, async () => {
  const { s } = await scriptFor(async (p) => { await p.fill("#est", "1.2"); await p.fill("#lo", "0.9"); await p.fill("#hi", "1.6"); await p.click("#run"); });
  assert.match(s, /tau_s = NA/);
  assertMatch(runR(s), 11);
});

test("honesty: a tampered page value makes R print MISMATCH", { skip: SKIP }, async () => {
  const { s } = await scriptFor(async (p) => { await p.click("#run"); });
  const bad = s.replace(/tau_s = ([0-9.]+)/, (m, v) => "tau_s = " + (parseFloat(v) + 0.001));
  assert.notStrictEqual(bad, s);
  const out = runR(bad);
  assert.match(out, /^MISMATCH \d+\/\d+/m);
  assert.match(out, /^tau_s .* DIFFERS$/m);
});
