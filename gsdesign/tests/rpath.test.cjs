// gsdesign R user path: the generated R script carries the page's CURRENT design
// and, run in fresh R with gsDesign, prints an honest MATCH n/n for the default
// design and for a user-entered design (plus MISMATCH when a page value is
// tampered with, and NOT CHECKED - never MATCH - when gsDesign is absent).
//   node --test gsdesign/tests/rpath.test.cjs
// Needs system Chrome, playwright-core (PLAYWRIGHT_CORE=<dir> or resolvable) and
// Rscript (RSCRIPT=<path>; default R 4.6.0). R_LIBS must contain gsDesign for the
// MATCH tests: without it they are SKIPPED (reported as not run), never passed.
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
let HAVE_GS = false;
if (READY) {
  try { HAVE_GS = /TRUE/.test(execFileSync(RSCRIPT, ["--vanilla", "-e", "cat(requireNamespace('gsDesign', quietly=TRUE))"], { encoding: "utf8", env: process.env })); }
  catch (e) { HAVE_GS = false; }
}
const SKIP_GS = SKIP || (HAVE_GS ? false : "gsDesign is not installed in this R (set R_LIBS): the MATCH check did NOT run");

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
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gsdesign-r-")), "check.R");
  fs.writeFileSync(f, script);
  return execFileSync(RSCRIPT, ["--vanilla", f], { encoding: "utf8", env: process.env, timeout: 120000 });
}
async function scriptFor(setup) {
  const page = await browser.newPage();
  await page.goto(base + "gsdesign/", { waitUntil: "load" });
  await setup(page);
  const s = await page.evaluate(() => window.GSDesignRCheck.buildScript(window._almLastGSD));
  const shown = await page.evaluate(() => [...document.querySelectorAll("#tb tr")].map((tr) => tr.children[2].textContent));
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
const pocockHsd = async (p) => {
  await p.selectOption("#spend", "pocock"); await p.fill("#K", "3"); await p.fill("#timing", "0.3, 0.6, 1");
  await p.selectOption("#fut", "hsd"); await p.fill("#fparam", "-2"); await p.fill("#power", "0.8"); await p.click("#run");
};

test("script carries the user's design after it is changed", { skip: SKIP }, async () => {
  const d = await scriptFor(async (p) => { await p.click("#run"); });
  assert.match(d.s, /^k <- 4; test\.type <- 1 /m);
  assert.match(d.s, /^sfu <- "sfLDOF"/m);
  const u = await scriptFor(pocockHsd);
  assert.match(u.s, /^k <- 3; test\.type <- 4 /m);
  assert.match(u.s, /^timing <- c\(0\.3, 0\.6, 1\)/m);
  assert.match(u.s, /^sfu <- "sfLDPocock"/m);
  assert.match(u.s, /^sfl <- "sfHSD"; sflpar <- -2 /m);
  assert.match(u.s, /z_fut_3 = /);
});

test("without gsDesign the script says NOT CHECKED and never prints MATCH", { skip: SKIP }, async () => {
  const { s } = await scriptFor(async (p) => { await p.click("#run"); });
  const absent = s.replace('requireNamespace("gsDesign", quietly = TRUE)', 'requireNamespace("gsDesignAbsentPkg", quietly = TRUE)');
  assert.notStrictEqual(absent, s);
  const out = runR(absent);
  assert.match(out, /^NOT CHECKED 0\/\d+ \(package gsDesign not available\)/m);
  assert.doesNotMatch(out, /^MATCH/m);
});

test("default design: R (gsDesign) prints MATCH", { skip: SKIP_GS }, async () => {
  const { s } = await scriptFor(async (p) => { await p.click("#run"); });
  assertMatch(runR(s), 24);
});

test("user design (Pocock, HSD futility, uneven timing): R prints MATCH", { skip: SKIP_GS }, async () => {
  const { s, shown } = await scriptFor(pocockHsd);
  const out = runR(s);
  assertMatch(out, 22);
  const rv = +/^z_eff_1\s+\S+\s+(\S+)/m.exec(out)[1];
  assert.strictEqual(rv.toFixed(4), shown[0]);   // R's bound rounds to what the page shows
});

test("honesty: a tampered page value makes R print MISMATCH", { skip: SKIP_GS }, async () => {
  const { s } = await scriptFor(async (p) => { await p.click("#run"); });
  const bad = s.replace(/z_eff_2 = ([0-9.]+)/, (m, v) => "z_eff_2 = " + (parseFloat(v) + 0.001));
  assert.notStrictEqual(bad, s);
  const out = runR(bad);
  assert.match(out, /^MISMATCH \d+\/\d+/m);
  assert.match(out, /^z_eff_2 .* DIFFERS$/m);
});
