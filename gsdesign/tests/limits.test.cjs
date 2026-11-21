// gsdesign input, state and R-check limitations (P27 limitation sweep, class a).
// Each test states the REQUIREMENT; a limitation id (L05...) ties it to the sweep.
//   node --test gsdesign/tests/limits.test.cjs
// Needs system Chrome and playwright-core (PLAYWRIGHT_CORE=<dir> or resolvable);
// SKIPPED (reported as not run, never passed) without them. Serves this checkout
// on its own fresh server (GSD_TEST_PORT, default 0 = any free port).
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
const G = require(path.join(ROOT, "shared", "gsdesign.js"));

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
  await new Promise((r) => server.listen(+(process.env.GSD_TEST_PORT || 0), "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/gsdesign/";
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function open(hash) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + (hash || ""), { waitUntil: "load" });
  page.errors = errors;
  return page;
}
const rows = (p) => p.evaluate(() => document.querySelectorAll("#tb tr").length);
const summary = (p) => p.evaluate(() => document.getElementById("summary").textContent);
const simText = (p) => p.evaluate(() => document.getElementById("simtbl").textContent + " | " + document.getElementById("simnote").textContent);
const zeff = (p) => p.evaluate(() => [...document.querySelectorAll("#tb tr")].map((tr) => tr.children[2].textContent));

test("L05: K must be a whole number from 1 to 10 (no silent truncation or clamping)", { skip: SKIP }, async () => {
  const p = await open();
  for (const k of ["0", "2.9", "11", ""]) {
    await p.fill("#K", k); await p.click("#run");
    assert.strictEqual(await rows(p), 0, "K=" + JSON.stringify(k) + " computed a design");
    assert.match(await summary(p), /Looks \(K\)/, "K=" + k);
  }
  await p.close();
});

test("L05: the information fractions must number K and be valid (no bypass of K or its limit)", { skip: SKIP }, async () => {
  const p = await open();
  await p.fill("#K", "4"); await p.fill("#timing", "0.5, 1"); await p.click("#run");
  assert.strictEqual(await rows(p), 0, "4 looks with 2 fractions computed a design");
  assert.match(await summary(p), /Information fractions/);
  await p.fill("#K", "10"); await p.fill("#timing", "0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.95,1"); await p.click("#run");
  assert.strictEqual(await rows(p), 0, "11 fractions computed an 11-look design");
  await p.fill("#K", "2"); await p.fill("#timing", ","); await p.click("#run");
  assert.strictEqual(await rows(p), 0);
  assert.match(await summary(p), /Information fractions/);
  await p.fill("#timing", "0.5, x"); await p.click("#run");
  assert.strictEqual(await rows(p), 0);
  assert.deepStrictEqual(p.errors, []);
  // a valid explicit timing still computes
  await p.fill("#K", "3"); await p.fill("#timing", "0.3, 0.6, 1"); await p.click("#run");
  assert.strictEqual(await rows(p), 3);
  await p.close();
});

test("L06: alpha and power outside the page's stated ranges are refused", { skip: SKIP }, async () => {
  const p = await open();
  await p.fill("#power", "0.4"); await p.click("#run");
  assert.strictEqual(await rows(p), 0, "power 0.4 accepted");
  assert.match(await summary(p), /Power/);
  await p.fill("#power", "0.9"); await p.fill("#alpha", "0.45"); await p.click("#run");
  assert.strictEqual(await rows(p), 0, "alpha 0.45 accepted");
  await p.fill("#alpha", ""); await p.click("#run");
  assert.strictEqual(await rows(p), 0);
  await p.fill("#alpha", "0.025"); await p.click("#run");
  assert.strictEqual(await rows(p), 4);
  await p.close();
});

test("L07: a hidden spending parameter never changes the O'Brien-Fleming or Pocock design", { skip: SKIP }, async () => {
  const p = await open();
  await p.click("#run");
  const ref = await zeff(p);
  await p.selectOption("#spend", "landemets"); await p.fill("#param", "3");
  await p.selectOption("#spend", "obf"); await p.click("#run");
  assert.deepStrictEqual(await zeff(p), ref, "hidden rho=3 changed the OBF bounds");
  const s = await p.evaluate(() => window.GSDesignRCheck.buildScript(window._almLastGSD));
  assert.match(s, /^sfu <- "sfLDOF"; sfupar <- 1 /m);
  await p.close();
  // the same through a shared link
  const q = await open("#spend=obf&param=3");
  assert.deepStrictEqual(await zeff(q), ref, "link param=3 changed the OBF bounds");
  await q.close();
});

test("L08: invalid spending parameters are refused, never a table of NaN (engine and page)", () => {
  assert.throws(() => G.boundaries({ alpha: 0.025, infoFracs: [0.5, 1], spend: "landemets", param: -1, beta: 0.1 }), /spending/i);
  assert.throws(() => G.boundaries({ alpha: 0.025, infoFracs: [0.5, 1], spend: "landemets", param: 0, beta: 0.1 }), /spending/i);
  assert.throws(() => G.boundaries({ alpha: 0.025, infoFracs: [0.5, 1], spend: "hsd", param: 1e-300, beta: 0.1 }), /spending/i);
  assert.throws(() => G.boundaries({ alpha: 0.025, infoFracs: [0.5, 1], spend: "hsd", param: NaN, beta: 0.1 }), /spending/i);
  assert.throws(() => G.boundaries({ alpha: 0.025, infoFracs: [0.5, 1], spend: "obf", futility: "betaspend", futSpend: "landemets", futParam: -2, beta: 0.1 }), /spending/i);
  // valid parameters are unaffected
  const ok = G.boundaries({ alpha: 0.025, infoFracs: [0.5, 1], spend: "hsd", param: -4, beta: 0.1 });
  assert.ok(ok.every((r) => Number.isFinite(r.z_eff)));
});

test("L08: the page shows an error, not NaN, for a degenerate HSD gamma", { skip: SKIP }, async () => {
  const p = await open();
  await p.selectOption("#spend", "hsd"); await p.fill("#param", "1e-300"); await p.click("#run");
  const t = await p.evaluate(() => document.getElementById("tbl").textContent);
  assert.doesNotMatch(t, /NaN/);
  assert.strictEqual(await rows(p), 0);
  assert.match(await summary(p), /Cannot compute/);
  await p.close();
});

test("L09: invalid re-estimation inputs and alternatives are refused", { skip: SKIP }, async () => {
  const p = await open();
  await p.click("#run"); await p.selectOption("#ssr", "1");
  const bad = [["#cp", ""], ["#cp", "-0.5"], ["#cp", "1"], ["#smin", "-5"], ["#smin", "80", "#smax", "20"], ["#th1", "abc"], ["#alts", "0, Infinity"]];
  for (const b of bad) {
    await p.fill("#cp", "0.8"); await p.fill("#smin", "20"); await p.fill("#smax", "80"); await p.fill("#th1", ""); await p.fill("#alts", "0, 1, 2");
    await p.fill(b[0], b[1]); if (b[2]) await p.fill(b[2], b[3]);
    await p.click("#simrun");
    const t = await simText(p);
    assert.doesNotMatch(t, /NaN/, JSON.stringify(b));
    assert.match(t, /Check|must/, JSON.stringify(b) + " was accepted: " + t);
    assert.strictEqual(await p.evaluate(() => document.querySelectorAll("#simtb tr td.err").length), 1, JSON.stringify(b));
  }
  await p.close();
});

test("L10: the iteration count and seed are refused when invalid, never silently replaced", { skip: SKIP }, async () => {
  const p = await open();
  await p.click("#run");
  for (const [id, v] of [["#iter", "1"], ["#iter", "2.5"], ["#iter", ""], ["#iter", "2000000"], ["#seed", ""], ["#seed", "-3"], ["#seed", "1.5"]]) {
    await p.fill("#iter", "1000"); await p.fill("#seed", "20261021");
    await p.fill(id, v); await p.click("#simrun");
    const t = await simText(p);
    assert.doesNotMatch(t, /Simulated \d+ trials/, id + "=" + v + " ran: " + t);
  }
  await p.fill("#iter", "1000"); await p.fill("#seed", "7"); await p.click("#simrun");
  assert.match(await simText(p), /Simulated 1000 trials per mean difference \(seed 7\)/);
  await p.close();
});

test("L11: pooled-statistic re-estimation carries a calibration warning", { skip: SKIP }, async () => {
  const p = await open();
  await p.click("#run");
  await p.selectOption("#comb", "groupSequential"); await p.selectOption("#ssr", "1"); await p.fill("#iter", "200");
  await p.click("#simrun");
  assert.match(await simText(p), /not controlled|not calibrated/i);
  await p.selectOption("#comb", "inverseNormal"); await p.click("#simrun");
  assert.doesNotMatch(await simText(p), /not controlled|not calibrated/i);
  await p.close();
});

test("L12: editing a design input invalidates the boundaries, simulation and R output that depend on it", { skip: SKIP }, async () => {
  const p = await open();
  await p.click("#run"); await p.fill("#iter", "200"); await p.click("#simrun");
  assert.ok(await p.evaluate(() => document.querySelectorAll("#simtb tr").length) > 0);
  await p.fill("#alpha", "0.01");
  assert.strictEqual(await rows(p), 0, "stale boundaries still shown after alpha was edited");
  assert.strictEqual(await p.evaluate(() => window._almLastGSD), null);
  assert.strictEqual(await p.evaluate(() => document.querySelectorAll("#simtb tr").length), 0, "stale simulation shown");
  await p.click("#simrun");
  assert.match(await simText(p), /Compute a valid design first/);
  assert.doesNotMatch(await p.evaluate(() => location.hash), /alpha=0\.01/, "link written for a design never computed");
  // recomputing clears an earlier simulation
  await p.click("#run"); await p.click("#simrun");
  await p.click("#run");
  assert.strictEqual(await p.evaluate(() => document.querySelectorAll("#simtb tr").length), 0, "simulation of the earlier design still shown");
  // editing a simulation input clears the simulation table only
  await p.click("#simrun"); await p.fill("#sd", "4");
  assert.strictEqual(await p.evaluate(() => document.querySelectorAll("#simtb tr").length), 0);
  assert.strictEqual(await rows(p), 4);
  await p.close();
});

test("L13: a malformed link is reported, not an aborted page", { skip: SKIP }, async () => {
  const p = await open("#alpha=%E0%A4%A&K=3");
  assert.deepStrictEqual(p.errors, []);
  assert.match(await summary(p), /link/i);
  await p.close();
});

test("L15: stage-size labels say planned (not an adaptive cap) and unreached stages show a dash", { skip: SKIP }, async () => {
  const p = await open();
  const lbl = await p.evaluate(() => document.getElementById("nmax").closest("label").textContent);
  assert.doesNotMatch(lbl, /Maximum/);
  await p.click("#run"); await p.selectOption("#ssr", "1"); await p.fill("#alts", "50"); await p.fill("#iter", "200");
  await p.click("#simrun");
  const head = await p.evaluate(() => document.getElementById("simth").textContent);
  assert.match(head, /if reached/);
  const cells = await p.evaluate(() => [...document.querySelectorAll("#simtb tr td")].map((c) => c.textContent));
  assert.strictEqual(cells[cells.length - 1], "—", "unreached stage shown as " + cells[cells.length - 1]);
  await p.close();
});

// (Verify still starts WebR: tests/rpath_review_classes.test.cjs class 1 exercises its stale-verdict guard.)
test("L17: when WebR fails, Verify in R still says NOT CHECKED and points to the R script", { skip: SKIP }, async () => {
  const p = await open();
  await p.click("#run");
  await p.evaluate(() => { window.AlmWebR = { runR: async (o) => { o.onStatus("Fetching runtime..."); return { ok: false, error: "could not fetch webr manifest" }; } }; });
  await p.click("#btn-rverify");
  await p.waitForTimeout(300);
  const st = await p.evaluate(() => document.getElementById("rcheck-status").textContent);
  assert.match(st, /^NOT CHECKED/, st);
  assert.match(st, /Download R script/, st);
  assert.match(st, /could not fetch webr manifest/, st);
  await p.close();
});

test("L18: the R verdict counts only finite, available values and reports a failed refit as NOT CHECKED", { skip: SKIP }, async () => {
  const p = await open();
  await p.click("#run");
  const s = await p.evaluate(() => window.GSDesignRCheck.buildScript(window._almLastGSD));
  await p.close();
  assert.doesNotMatch(s, /\(is\.na\(a\) && is\.na\(b\)\)/, "two missing values still count as agreement");
  assert.match(s, /tryCatch\(do\.call\(gsDesign::gsDesign/);
  assert.match(s, /NOT CHECKED 0\/%d \(gsDesign could not refit/);
  // versions are printed before the refit, so a failed refit still reports them
  assert.ok(s.indexOf("packageVersion(\"gsDesign\")") < s.indexOf("do.call(gsDesign::gsDesign"));
});

test("L22: results are announced, alpha's accessible name follows its label, wide tables scroll", { skip: SKIP }, async () => {
  const p = await open();
  assert.strictEqual(await p.evaluate(() => document.getElementById("summary").getAttribute("aria-live")), "polite");
  assert.strictEqual(await p.evaluate(() => document.getElementById("simnote").getAttribute("aria-live")), "polite");
  await p.selectOption("#sided", "2");
  assert.strictEqual(await p.evaluate(() => document.getElementById("alpha").getAttribute("aria-label")), "Two-sided α (total)");
  await p.selectOption("#spend", "hsd");
  assert.strictEqual(await p.evaluate(() => document.getElementById("param").getAttribute("aria-label")), "γ (HSD)");
  for (const id of ["tbl", "simtbl"]) {
    const ov = await p.evaluate((i) => getComputedStyle(document.getElementById(i).parentElement).overflowX, id);
    assert.strictEqual(ov, "auto", id + " has no scroll region");
  }
  await p.close();
});
