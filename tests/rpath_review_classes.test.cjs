// R user paths ("Download R script" / "Verify in R (WebR)"): regression tests for the defect classes an
// independent review found, run by EXECUTION in a real page (system Chrome + playwright-core) and, where a
// verdict is computed in R, in fresh Rscript.
//   node --test tests/rpath_review_classes.test.cjs
// Needs system Chrome, playwright-core (PLAYWRIGHT_CORE=<dir>/playwright-core or resolvable) and Rscript
// (RSCRIPT=<path>; default R 4.6.0). Serves this checkout on 127.0.0.1:${RPATH_PORT || 18432}.
//
// Requirements tested (each test states the requirement, not the code's current behaviour):
//  1. Stale WebR verdict: a Verify run started on analysis A that finishes after the page has moved on to
//     analysis B must not show A's verdict beside B; it is discarded and the page says so. Control: when
//     nothing changed, R's verdict IS shown.
//  2. Stale snapshot: a run that fails must not leave the previous analysis behind for the R check.
//  3. Tolerance: a page value that is off by more than half a unit of the decimals the page shows must be
//     reported as differing, at any magnitude (a relative tolerance alone exceeds that for large or tiny values).
//  4. A verdict computed from refusals or counts alone (no estimate compared) must be NOT CHECKED, never MATCH.
//  The MATCH for the default example and for pasted data is checked too, so a fix cannot buy honesty with
//  false DIFFs.
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const RSCRIPT = process.env.RSCRIPT || "C:/Program Files/R/R-4.6.0/bin/Rscript.exe";
const PORT = +(process.env.RPATH_PORT || 18432);
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || "playwright-core").chromium; } catch (e) { /* skipped below */ }
const READY = !!chromium && fs.existsSync(CHROME);
const SKIP = READY ? false : "needs system Chrome and playwright-core";
const SKIP_R = READY && fs.existsSync(RSCRIPT) ? false : "needs system Chrome, playwright-core and Rscript";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
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
  await new Promise((r, j) => { server.once("error", j); server.listen(PORT, "127.0.0.1", r); });
  base = "http://127.0.0.1:" + PORT + "/";
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

function runR(script) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rpath-classes-")), "check.R");
  fs.writeFileSync(f, script);
  const p = spawnSync(RSCRIPT, ["--vanilla", f], { encoding: "utf8", env: process.env, timeout: 180000 });
  assert.strictEqual(p.status, 0, "Rscript failed:\n" + p.stdout + p.stderr);
  return p.stdout;
}
const lastVerdict = (out) => out.trim().split(/\r?\n/).filter((l) => /^(MATCH|MISMATCH|NOT CHECKED)\b/.test(l)).pop() || "(no verdict line)";
const set = (sel, v) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })();`;
const click = (sel) => `document.querySelector(${JSON.stringify(sel)}).click();`;

async function open(app) {
  const page = await browser.newPage();
  page.on("dialog", (d) => d.dismiss());
  await page.goto(base + app + "/", { waitUntil: "load" });
  await page.waitForTimeout(500);
  return page;
}

// ---------------------------------------------------------------------------------------------------------
// 1. Stale WebR verdict. WebR is replaced by a runner whose answer we release by hand, so the race is exact:
//    Verify on A -> (optionally) re-run the page with B -> R returns A's "MATCH 7/7".
const FAKE_R = "R vs page (fake runner)\nMATCH 7/7\n";
const C1 = {
  "p-curve": { A: click("#btn-run"), verify: "#btn-rverify", B: set("#src", "0.001 0.002 0.01 0.03 0.04") + click("#btn-run"), show: ["#rcheck-status", "#rcheck-out"] },
  "reverse-bayes": { A: click("#run"), verify: "#btn-rverify", B: set("#est", "0.5") + click("#run"), show: ["#rcheck-status", "#rcheck-out"] },
  "gsdesign": { A: click("#run"), verify: "#btn-rverify", B: set("#alpha", "0.01") + click("#run"), show: ["#rcheck-status", "#rcheck-out"] },
  "rmst-ma": { A: "0", verify: "#rcheck-webr", B: set("#f-data", "A, 1.0, 0.5\nB, 2.0, 0.4\nC, 0.3, 0.6"), show: ["#rcheck-status", "#rcheck-out"] },
  "fragility": { A: click("#btn-example"), verify: "#rcheck-webr", B: set("#measure", "RR"), show: ["#rcheck-status", "#rcheck-out"] },
  "rare-events-glmm": { A: click("#btn-run"), verify: "#rcheck-webr", B: set("#f-model", "CM.AL"), show: ["#rcheck-status", "#rcheck-out"] },
  "effect-size-converter": { A: click("#btn-convert"), verify: "#btn-verify-r", B: set("#in-est", "2.5") + click("#btn-convert"), show: ["#rcheck-status", "#rcheck-verdict", "#rcheck-out"] },
  "median-to-mean": { A: click("#btn-run"), verify: "#btn-verify-r", B: set("#m", "33") + click("#btn-run"), show: ["#rcheck-status", "#rcheck-verdict", "#rcheck-out"] },
  "umbrella-overlap": { A: click("#btn-example"), verify: "#btn-verify-r", B: set("#f-data", "R1: a, b, c\nR2: b, c, d"), show: ["#r-status", "#r-output"] },
  // The modal does not trap focus: the inputs behind it stay reachable from the keyboard (Tab), so B can run.
  "sequential-ma": { A: click("#btn-run"), verify: "#btn-verify-in-r", B: set("#f-alpha", "0.01"), show: ["#alm-webr-status", "#alm-webr-output"] },
  "powerma": { A: click("#btn-run"), verify: "#btn-verify-in-r", B: set("#alpha", "0.01") + click("#btn-run"), show: ["#alm-webr-status", "#alm-webr-output"] },
  "benefit-risk": { A: click("#btn-example"), verify: "#btn-webr", B: set("#f-seed", "777") + click("#btn-run"), show: ["#r-status", "#r-out"] },
  "transportability": { A: click("#btn-example"), verify: "#btn-webr", B: set("#f-target", "0.9") + click("#btn-run"), show: ["#r-status", "#r-out"] },
  "transported-nma": { A: click("#btn-example"), verify: "#btn-webr", B: click("#f-higher") + click("#btn-run"), show: ["#r-status", "#r-out"] },
  "spec-collapse": { A: click("#btn-example"), verify: "#btn-webr", B: set("#scheme", "reml_only") + click("#btn-run"), show: ["#r-status", "#r-out"] },
  // merged later (#630 pa8, #631 pa2)
  "bayesian-ma": { A: click("#btn-example"), verify: "#btn-r-webr", B: set("#f-mu0", "0.7"), show: ["#r-check-status", "#r-check-out"] },
  "bayesian-mcmc": { A: set("#iter", "600") + set("#burn", "100") + click("#btn-run"), waitA: 5000, verify: "#btn-r-webr", B: click("#btn-run"), waitB: 5000, show: ["#r-check-status", "#r-check-out"] },
  "bma-tau-priors": { A: click("#btn-run"), waitA: 1500, verify: "#btn-r-webr", B: set("#src", ["A, 0.30, 0.012", "B, 0.12, 0.020", "C, 0.55, 0.018", "D, -0.08, 0.025"].join(String.fromCharCode(10))) + click("#btn-run"), waitB: 1500, show: ["#r-check-status", "#r-check-out"] },
  "robma": { A: "0", waitA: 1500, verify: "#btn-r-webr", B: set("#f-data", ["A, 0.30, 0.12", "B, 0.12, 0.20", "C, 0.55, 0.18", "D, -0.08, 0.25"].join(String.fromCharCode(10))), waitB: 1500, show: ["#r-check-status", "#r-check-out"] },
  "poth": { A: click("#btn-example"), verify: "#btn-verify-r", B: set("#data", ["0.9, A", "0.5, B", "0.1, C"].join(String.fromCharCode(10))), show: ["#rcheck-status", "#rcheck-verdict", "#rcheck-out"] },
  "nma-meta-reg": { A: click("#btn-run"), waitA: 1500, verify: "#btn-verify-r", B: set("#f-method", "ML") + click("#btn-run"), waitB: 1500, show: ["#rcheck-status", "#rcheck-verdict", "#rcheck-out"] },
  "multiplicative-ma": { A: click("#btn-example"), verify: "#btn-verify-r", B: set("#scale", "exp"), show: ["#rcheck-status", "#rcheck-verdict", "#rcheck-out"] },
  "multiplicative-nma": { A: click("#btn-example"), verify: "#btn-verify-r", B: set("#scale", "exp"), show: ["#rcheck-status", "#rcheck-verdict", "#rcheck-out"] },
  // HTA: B keeps only the comparator, so the ICER cell is not rewritten (no comparison) while the costs change.
  "HTA": {
    A: "app.project = app.createDemoProject(); app.runBaseCase();", verify: "#btn-verify-r",
    B: "(() => { const s = app.project.strategies, ids = Object.keys(s), c = ids.find((i) => s[i].is_comparator); for (const i of ids) if (i !== c) delete s[i]; app.runBaseCase(); })();",
    show: ["#r-check-status", "#r-check-output"], wait: 2500,
  },
};
async function race(app, rerun) {
  const c = C1[app];
  const page = await open(app);
  if (c.wait) await page.waitForTimeout(c.wait);
  await page.evaluate(c.A); await page.waitForTimeout(c.waitA || 300);
  await page.evaluate(() => {
    window.__pending = [];
    window.AlmWebR = window.AlmWebR || {};
    window.AlmWebR.runR = (o) => new Promise((res) => window.__pending.push({ o, res }));
  });
  await page.evaluate(click(c.verify));
  await page.waitForFunction(() => window.__pending.length > 0, null, { timeout: 10000 });
  if (rerun) { await page.evaluate(c.B); await page.waitForTimeout(c.waitB || 400); }
  await page.evaluate((stdout) => window.__pending[0].res({ ok: true, stdout, versions: { R: "R version 4.5.1", webR: "0.5.5", metafor: "4.8-0", lme4: "2.0-1" } }), FAKE_R);
  await page.waitForTimeout(400);
  const shown = await page.evaluate((sels) => sels.map((s) => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : ""; }).join(" | "), c.show);
  await page.close();
  return shown;
}
for (const app of Object.keys(C1)) {
  test(`class 1, ${app}: R's verdict for an earlier analysis is discarded, not shown beside the re-run`, { skip: SKIP }, async () => {
    const shown = await race(app, true);
    assert.doesNotMatch(shown, /MATCH 7\/7/, "stale verdict shown after the page re-ran:\n" + shown);
    assert.match(shown, /discarded|changed since the last R check/i, "the page must say the earlier result is not current:\n" + shown);
  });
  test(`class 1, ${app} (control): with no re-run R's verdict is shown`, { skip: SKIP }, async () => {
    const shown = await race(app, false);
    assert.match(shown, /MATCH 7\/7/, "the verdict of an unchanged analysis must be shown:\n" + shown);
  });
}

// ---------------------------------------------------------------------------------------------------------
// 2. Stale snapshot after a failed run (rmst-ma: the pooling throws for weights out of range).
test("class 2, rmst-ma: a failed fit leaves nothing for the R check (no stale analysis)", { skip: SKIP }, async () => {
  const page = await open("rmst-ma");
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  assert.ok(await page.evaluate(() => !!window.__almRmstRState()), "default analysis not recorded");
  await page.evaluate(set("#f-data", "A, 1, 1e-200\nB, 2, 1e-200"));
  await page.waitForTimeout(300);
  assert.ok(errs.length >= 1, "expected the pooling to fail for these inputs");
  assert.strictEqual(await page.evaluate(() => window.__almRmstRState()), null, "the previous analysis is still offered to the R check");
  await page.evaluate(click("#rcheck-dl"));
  assert.match(await page.evaluate(() => document.getElementById("rcheck-status").textContent), /Nothing to check/);
  await page.close();
});

test("class 2, bayesian-ma: a failed tau^2 fit leaves nothing for the R check (no stale analysis)", { skip: SKIP }, async () => {
  const page = await open("bayesian-ma");
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.evaluate(click("#btn-example")); await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => !!window.__almRCheckInputs()), "example analysis not recorded");
  await page.evaluate(set("#f-data", ["A, 1e308, 1", "B, -1e308, 1"].join(String.fromCharCode(10))));
  await page.waitForTimeout(300);
  assert.ok(errs.some((m) => /bracketed/.test(m)), "expected the Paule-Mandel fit to fail for these inputs: " + errs.join("; "));
  assert.strictEqual(await page.evaluate(() => window.__almRCheckInputs()), null, "the previous analysis is still offered to the R check");
  await page.close();
});

// ---------------------------------------------------------------------------------------------------------
// 3. Tolerance never looser than the display: plant a page value that changes the shown digits; R must flag it.
const C3 = [
  { app: "median-to-mean", label: /^Wan 2014 mean /m, gen: "window.__almM2MRScript()",
    A: set("#n", "50") + set("#a", "1000000") + set("#q1", "2000000") + set("#m", "3000000") + set("#q3", "4000000") + set("#b", "5000000") + click("#btn-run"),
    plant: "(() => { const r = window.__almLastM2M(), c = JSON.parse(JSON.stringify(r)); c.estimates[0].mean += 0.002; window.__almLastM2M = () => c; return [r.estimates[0].mean.toFixed(3), c.estimates[0].mean.toFixed(3)]; })()" },
  { app: "evalue", label: /^E-value \(point estimate\) /m, gen: "window.__almEValueRScript()",
    A: set("#measure", "RR") + set("#point", "10000000") + set("#lo", "") + set("#hi", "") + click("#btn-run"),
    plant: "(() => { const r = window.__almLastEValue(), c = JSON.parse(JSON.stringify(r)); c.point += 0.001; window.__almLastEValue = () => c; return [r.point.toFixed(4), c.point.toFixed(4)]; })()" },
  { app: "effect-size-converter", label: /^E-value \(point\) /m, gen: "window.__escRScript()",
    A: set("#ev-measure", "RR") + set("#ev-point", "10000000") + set("#ev-lo", "") + set("#ev-hi", ""),
    plant: "(() => { const r = window.__almLastEValue(), c = JSON.parse(JSON.stringify(r)); c.point += 0.002; window.__almLastEValue = () => c; return [r.point.toFixed(3), c.point.toFixed(3)]; })()" },
  // a tiny risk difference is shown as 1.00e-7 (3 significant digits); a relative 1e-9 is looser than that.
  { app: "effect-size-converter", label: /^RD point /m, gen: "window.__escRScript()",
    A: set("#in-type", "RD") + set("#in-est", "0.0000001") + set("#in-se", "0.00000002") + set("#ctx-p0", "") + click("#btn-convert"),
    plant: "(() => { const rows = window.__almResultRows, i = rows.findIndex((r) => r.scale === 'RD'), v = rows[i].point; window.__almResultRows = rows.map((r, j) => j === i ? Object.assign({}, r, { point: v + 8e-10 }) : r); return [v.toExponential(2), (v + 8e-10).toExponential(2)]; })()" },
];
for (const c of C3) {
  test(`class 3, ${c.app}: an error larger than half a displayed unit is reported (${c.label.source})`, { skip: SKIP_R }, async () => {
    const page = await open(c.app);
    await page.evaluate(c.A); await page.waitForTimeout(300);
    const [shownTrue, shownPlanted] = await page.evaluate(c.plant);
    assert.notStrictEqual(shownTrue, shownPlanted, "the planted error must change the displayed value");
    const s = await page.evaluate(c.gen);
    await page.close();
    const out = runR(s);
    const line = out.split(/\r?\n/).find((l) => c.label.test(l)) || "";
    assert.match(line, /DIFFERS/, `planted ${shownTrue} -> ${shownPlanted} passed:\n${line}\n${lastVerdict(out)}`);
    assert.doesNotMatch(lastVerdict(out), /^MATCH/);
  });
}

// ---------------------------------------------------------------------------------------------------------
// 4. No estimate compared -> NOT CHECKED, never MATCH (median-to-mean).
const C4 = [
  ["n = 1 (the page refuses it)", set("#n", "1") + click("#btn-run")],
  ["n = 20 with every summary blank (all estimates shown as dashes)", set("#n", "20") + ["a", "q1", "m", "q3", "b"].map((i) => set("#" + i, "")).join("") + click("#btn-run")],
];
for (const [name, act] of C4) {
  test(`class 4, median-to-mean: ${name} gives NOT CHECKED, not MATCH`, { skip: SKIP_R }, async () => {
    const page = await open("median-to-mean");
    await page.evaluate(act); await page.waitForTimeout(300);
    const s = await page.evaluate(() => window.__almM2MRScript());
    await page.close();
    const v = lastVerdict(runR(s));
    assert.match(v, /^NOT CHECKED\b/, "verdict without any estimate compared: " + v);
  });
}

// 3 (apps merged later, #630): the chk() cap of 5e-4 is half a unit of 3 decimals, but these pages show 4
// decimals (tau^2, mu, SE, CrI) and Bayes factors as exp(log BF) to 2 decimals. Plant an error in the script's
// page value that changes the displayed digits; R must flag it.
const J = (rows) => rows.join(String.fromCharCode(10));
const BIG = J(["A, 120, 6", "B, 165, 7", "C, 90, 5", "D, 140, 8", "E, 105, 6"]);   // raw-unit effects: tau^2 ~ 700
const C3B = [
  { app: "bayesian-ma", A: set("#f-data", BIG) + set("#f-tau0", "1000"), gen: "window.__almBayesMARScript()", field: "tau2", delta: 2e-4, d: 4, label: /^tau\^2 \(plug-in\)/m },
  { app: "bma-tau-priors", A: set("#src", J(["A, 120, 36", "B, 165, 49", "C, 90, 25", "D, 140, 64", "E, 105, 36"])) + click("#btn-run"), gen: "window.__almBMARScript()", field: "mu", delta: 1e-4, d: 4, label: /^BMA mu/m },
  { app: "robma", A: set("#f-data", J(["A, 0.9, 0.10", "B, 1.1, 0.12", "C, 0.8, 0.09", "D, 1.0, 0.11", "E, 0.95, 0.10", "F, 1.05, 0.13"])), gen: "window.__almRoBMARScript()", field: "logBFe", exp: true, label: /^log BF10 \(effect\)/m },
];
for (const c of C3B) {
  test(`class 3, ${c.app}: a page error that changes the displayed ${c.field} is reported`, { skip: SKIP_R }, async () => {
    const page = await open(c.app);
    await page.evaluate(c.A); await page.waitForTimeout(1500);
    const s = await page.evaluate(c.gen);
    await page.close();
    assert.ok(s, "no script");
    const m = new RegExp("(page <- list\\([\\s\\S]*?\\b" + c.field + " = )([-0-9.eE+]+)").exec(s);
    assert.ok(m, "page value " + c.field + " not found in the script");
    const v = +m[2];
    let planted, shownA, shownB;
    if (c.exp) {   // BF shown as exp(log BF) to 2 decimals (below 1e21)
      planted = v + 0.02 / Math.exp(v); shownA = Math.exp(v).toFixed(2); shownB = Math.exp(planted).toFixed(2);
    } else { planted = v + c.delta; shownA = v.toFixed(c.d); shownB = planted.toFixed(c.d); }
    assert.notStrictEqual(shownA, shownB, "precondition: the planted error changes the displayed value");
    assert.ok(Math.abs(planted - v) < 5e-4, "precondition: the planted error is inside the old 5e-4 cap");
    const bad = s.slice(0, m.index) + m[1] + String(planted) + s.slice(m.index + m[0].length);
    const out = runR(bad);
    const line = out.split(/\r?\n/).find((l) => c.label.test(l)) || "";
    assert.match(line, /DIFFERS/, `planted ${shownA} -> ${shownB} passed:\n${line}`);
  });
  test(`kept MATCH, ${c.app}: the same data, unplanted`, { skip: SKIP_R }, async () => {
    const page = await open(c.app);
    await page.evaluate(c.A); await page.waitForTimeout(1500);
    const s = await page.evaluate(c.gen);
    await page.close();
    const out = runR(s);
    const mm = /^MATCH (\d+)\/(\d+)/.exec(lastVerdict(out));
    assert.ok(mm && mm[1] === mm[2], "expected MATCH n/n:\n" + out);
  });
}

// ---------------------------------------------------------------------------------------------------------
// The fixes must keep MATCH for the default example and for pasted data (fresh R).
const KEEP = [
  ["median-to-mean", "default", click("#btn-run"), "window.__almM2MRScript()", 8],
  ["median-to-mean", "pasted C3", set("#scenario", "C3") + set("#n", "37") + set("#q1", "11.5") + set("#m", "14.2") + set("#q3", "19.8") + click("#btn-run"), "window.__almM2MRScript()", 6],
  ["median-to-mean", "pasted large values", set("#n", "50") + set("#a", "1000000") + set("#q1", "2000000") + set("#m", "3000000") + set("#q3", "4000000") + set("#b", "5000000") + click("#btn-run"), "window.__almM2MRScript()", 8],
  ["evalue", "default", click("#btn-run"), "window.__almEValueRScript()", 3],
  ["evalue", "pasted OR with CI", set("#measure", "OR") + set("#point", "0.62") + set("#lo", "0.45") + set("#hi", "0.85") + click("#btn-run"), "window.__almEValueRScript()", 3],
  ["evalue", "pasted large RR", set("#measure", "RR") + set("#point", "10000000") + set("#lo", "") + set("#hi", "") + click("#btn-run"), "window.__almEValueRScript()", 2],
  ["effect-size-converter", "default", click("#btn-convert"), "window.__escRScript()", 10],
  ["effect-size-converter", "pasted tiny RD", set("#in-type", "RD") + set("#in-est", "0.0000001") + set("#in-se", "0.00000002") + set("#ctx-p0", "") + click("#btn-convert"), "window.__escRScript()", 4],
  ["effect-size-converter", "pasted large E-value", set("#ev-measure", "RR") + set("#ev-point", "10000000") + set("#ev-lo", "") + set("#ev-hi", ""), "window.__escRScript()", 4],
  ["rmst-ma", "default", "0", "AlmRmstRCheck.buildScript(window.__almRmstRState())", 8],
  ["rmst-ma", "pasted", set("#f-method", "REML") + set("#f-data", "TrialA, 1.8, 0.6\nTrialB, 0.9, 0.5\nTrialC, 2.6, 0.9\nTrialD, -0.2, 0.7"), "AlmRmstRCheck.buildScript(window.__almRmstRState())", 8],
];
for (const [app, name, act, gen, minN] of KEEP) {
  test(`kept MATCH, ${app}: ${name}`, { skip: SKIP_R }, async () => {
    const page = await open(app);
    await page.evaluate(act); await page.waitForTimeout(300);
    const s = await page.evaluate(gen);
    await page.close();
    const out = runR(s);
    const m = /^MATCH (\d+)\/(\d+)/.exec(lastVerdict(out));
    assert.ok(m && m[1] === m[2] && +m[2] >= minN, `expected MATCH n/n (n >= ${minN}):\n${out}`);
    assert.doesNotMatch(out, /DIFFERS/);
  });
}
