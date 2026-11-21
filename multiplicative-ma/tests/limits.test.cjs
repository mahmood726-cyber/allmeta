// multiplicative-ma (pairwise UWLS) input, range, scale, wording and R-panel limitations (P29 sweep, class a).
// Each test states the REQUIREMENT; the id (F02...) ties it to the sweep.
//   node --test multiplicative-ma/tests/limits.test.cjs
// Needs system Chrome and playwright-core (PLAYWRIGHT_CORE=<dir> or resolvable); SKIPPED (not run, never
// passed) without them. Serves this checkout on its own server (MMA_TEST_PORT, default any free port).
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || "playwright-core").chromium; } catch (e) { /* skipped below */ }
const READY = !!chromium && fs.existsSync(CHROME);
const SKIP = READY ? false : "needs system Chrome and playwright-core";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
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
  await new Promise((r) => server.listen(+(process.env.MMA_TEST_PORT || 0), "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/multiplicative-ma/";
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function open() {
  const page = await browser.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(base, { waitUntil: "load" });
  return page;
}
async function enter(p, data, scale) {
  await p.evaluate(([d, s]) => {
    if (s) document.getElementById("scale").value = s;
    document.getElementById("data").value = d; document.getElementById("btn-run").click();
  }, [data, scale || null]);
  return p.evaluate(() => ({ out: document.getElementById("out").textContent, interp: document.getElementById("interp").textContent,
    head: document.querySelector("thead").textContent, snap: window.AlmRCheck && window.AlmRCheck._state() }));
}
const SIX = ["0.42, 0.18", "0.10, 0.22", "0.61, 0.25", "-0.05, 0.15", "0.33, 0.12", "0.27, 0.30"];

test("F02: a line with surplus fields (or a decimal-comma line) is not read as different data", { skip: SKIP }, async () => {
  const p = await open();
  const r = await enter(p, SIX.concat(["0,2, 0,3"]).join("\n"));
  assert.strictEqual(r.snap.yi.length, 6, "decimal-comma line was fitted as yi=0, SE=2");
  const r2 = await enter(p, SIX.concat(["0.5, 0.2, trial X, 2019"]).join("\n"));
  assert.strictEqual(r2.snap.yi.length, 6, "a 4-field line was fitted");
  const ok = await enter(p, SIX.concat(["0.5\t0.2\ttrial X"]).join("\n"));
  assert.strictEqual(ok.snap.yi.length, 7, "tab-separated effect, SE, label must still be read");
  await p.close();
});

test("F03: an unsupported numerical range is reported and the previous results are cleared", { skip: SKIP }, async () => {
  const p = await open();
  await enter(p, SIX.join("\n"));
  const r = await enter(p, "0.1, 1e-200\n0.3, 1e-200\n0.2, 1e-200");
  assert.deepStrictEqual(p.errors, [], "uncaught error: " + p.errors.join(" | "));
  assert.doesNotMatch(r.out, /Fixed-effect/, "previous table left on screen: " + r.out);
  assert.match(r.out + r.interp, /cannot be computed|not supported/i);
  assert.strictEqual(r.snap, null);
  await p.close();
});

test("F04: exponentiated output never prints Infinity, and the SE column says it stays on the analysis scale", { skip: SKIP }, async () => {
  const p = await open();
  const r = await enter(p, "800, 0.5\n801, 0.5\n799, 0.6", "exp");
  assert.doesNotMatch(r.out, /Infinity/);
  assert.match(r.head, /SE \(analysis scale\)/);
  const lin = await enter(p, SIX.join("\n"), "linear");
  assert.doesNotMatch(lin.head, /analysis scale/);
  await p.close();
});

test("F05: phi = 1 is not called > 1, and phi < 1 does not claim the UWLS interval is narrower", { skip: SKIP }, async () => {
  const p = await open();
  await p.evaluate(() => { const u = window.AlmUWLS.uwls; window.AlmUWLS.uwls = function () { const r = u.apply(this, arguments); r.phi = 1; return r; }; });
  const one = await enter(p, SIX.join("\n"));
  assert.doesNotMatch(one.interp, /> 1/, one.interp);
  assert.match(one.interp, /φ = 1\.00/);
  await p.evaluate(() => { const u = window.AlmUWLS.uwls; window.AlmUWLS.uwls = function () { const r = u.apply(this, arguments); r.phi = 0.5; return r; }; });
  const lt = await enter(p, SIX.join("\n"));
  assert.doesNotMatch(lt.interp, /narrows the CI/, lt.interp);
  await p.close();
});

test("F13: the R panel says it checks the numbers computed from the accepted rows, not the input parsing or display", { skip: SKIP }, async () => {
  const p = await open();
  const t = await p.evaluate(() => document.getElementById("rcheck-panel").textContent);
  await p.close();
  assert.doesNotMatch(t, /every displayed number/);
  assert.match(t, /accepted/);
});

// F16 (CSP lacks 'wasm-unsafe-eval') is NOT a requirement: Verify in R runs WebR to MATCH 17/17 in system Chrome
// under the current policy (lim3 lane user path, 21 Nov 2026), so no test asserts the directive.
test("F17: results, errors and the R verdict are announced", { skip: SKIP }, async () => {
  const p = await open();
  const a = await p.evaluate(() => ({ out: document.getElementById("out").closest("[aria-live]") !== null,
    interp: document.getElementById("interp").getAttribute("aria-live"),
    verdict: document.getElementById("rcheck-verdict").getAttribute("aria-live") }));
  await p.close();
  assert.strictEqual(a.interp, "polite");
  assert.ok(a.out, "result table not in a live region");
  assert.strictEqual(a.verdict, "polite");
});
