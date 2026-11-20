// nma-meta-reg input, state, rendering and R-script limitations (P28 limitation sweep, class a).
// Each test states the REQUIREMENT; the id (L01...) ties it to the sweep.
//   node --test nma-meta-reg/tests/limits.test.cjs
// Browser tests need system Chrome and playwright-core (PLAYWRIGHT_CORE=<dir> or resolvable); they are
// SKIPPED (not run, never passed) without them. Serves this checkout on its own server (NMR_TEST_PORT, default any).
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
const NMR = require(path.join(ROOT, "shared", "nma-meta-regression.js"));

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
  await new Promise((r) => server.listen(+(process.env.NMR_TEST_PORT || 0), "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/nma-meta-reg/";
  browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

const DEFAULT = ["S01, A, B, -0.30, 0.10, 50", "S02, A, B, -0.25, 0.12, 55", "S03, A, B, -0.40, 0.11, 45",
  "S04, A, B, -0.35, 0.10, 65", "S05, A, C, -0.45, 0.13, 50", "S06, A, C, -0.50, 0.12, 60", "S07, A, C, -0.48, 0.11, 70",
  "S08, B, C, -0.15, 0.14, 55", "S09, B, C, -0.20, 0.13, 60", "S10, A, B, -0.32, 0.10, 70"];
async function open() {
  const page = await browser.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* none */ } });
  await page.goto(base, { waitUntil: "load" });
  await page.waitForTimeout(300);
  return page;
}
async function fitWith(p, src, ref, pred) {
  await p.evaluate(([s, r, q]) => {
    document.getElementById("src").value = s;
    if (r !== null) document.getElementById("f-ref").value = r;
    if (q !== null) document.getElementById("f-predict").value = q;
    document.getElementById("btn-run").click();
  }, [src, ref === undefined ? null : ref, pred === undefined ? null : pred]);
  return p.evaluate(() => ({
    summary: document.getElementById("summary").textContent,
    beta: document.querySelectorAll("#beta tbody tr").length,
    fit: window.__almLastNmaMetaReg && window.__almLastNmaMetaReg(),
  }));
}
const failed = (r) => /Fit failed/.test(r.summary) && r.beta === 0 && !r.fit;

test("L01: malformed rows are refused with their line, never dropped, truncated or prefix-parsed", { skip: SKIP }, async () => {
  const p = await open();
  for (const [bad, why] of [["S11, A, B, -0.30, 0.10", "6 comma-separated fields"], ["S11, A, B, -0.30oops, 0.10, 50", "not a number"],
    ["S11, A, B, -0.30, 0.10, 50, extra", "6 comma-separated fields"], ["studyId, trtA, trtB, yi, sei, covariate", "not a number"]]) {
    const r = await fitWith(p, DEFAULT.concat([bad]).join("\n"));
    assert.ok(failed(r), JSON.stringify(bad) + " was fitted: " + r.summary);
    assert.match(r.summary, new RegExp("line 11: .*" + why), r.summary);
  }
  // blank and comment lines are still ignored; the default fits
  const ok = await fitWith(p, "# my data\n\n" + DEFAULT.join("\n"));
  assert.ok(ok.fit && ok.beta === 2);
  await p.close();
});

test("L02: rows the engine excludes (missing values, sei <= 0, trtA = trtB) are counted on the page", { skip: SKIP }, async () => {
  const p = await open();
  const r = await fitWith(p, DEFAULT.concat(["S11, A, B, -0.30, 0, 50", "S12, B, B, -0.1, 0.1, 50", "S13, A, C, NA, 0.1, 50"]).join("\n"));
  assert.ok(r.fit, r.summary);
  assert.match(r.summary, /Invalid rows excluded\s*3/, r.summary);
  const d = await fitWith(p, DEFAULT.join("\n"));
  assert.match(d.summary, /Invalid rows excluded\s*0/);
  await p.close();
});

test("L03: an unknown reference treatment is refused; blank means the first sorted label", { skip: SKIP }, async () => {
  const p = await open();
  const r = await fitWith(p, DEFAULT.join("\n"), "Placebo");
  assert.ok(failed(r), "unknown reference fitted: " + r.summary);
  assert.match(r.summary, /Placebo/);
  const b = await fitWith(p, DEFAULT.join("\n"), "");
  assert.strictEqual(b.fit.reference, "A");
  await p.close();
});

const tri = (sid, pairs, xs) => pairs.map(([a, b, y], i) => ({ studyId: sid, trtA: a, trtB: b, yi: y, sei: 0.15, covariate: xs ? xs[i] : 50 }));
const two = [["S1", "A", "B", -0.3, 40], ["S2", "A", "B", -0.2, 60], ["S3", "A", "C", -0.4, 45], ["S4", "A", "C", -0.5, 65], ["S5", "B", "C", -0.1, 55]]
  .map(([s, a, b, y, x]) => ({ studyId: s, trtA: a, trtB: b, yi: y, sei: 0.12, covariate: x }));
test("L04: a multi-arm study must supply every distinct pair, with one covariate value", () => {
  const dup = two.concat(tri("M1", [["A", "B", -0.3], ["A", "B", -0.25], ["A", "C", -0.4]]));
  assert.throws(() => NMR.fit(dup, ["A", "B", "C"]), /each pair once|duplicate/i);
  const diffx = two.concat(tri("M1", [["A", "B", -0.3], ["A", "C", -0.4], ["B", "C", -0.1]], [50, 50, 70]));
  assert.throws(() => NMR.fit(diffx, ["A", "B", "C"]), /covariate/i);
  // a complete three-arm study with one covariate value still fits
  const good = two.concat(tri("M1", [["A", "B", -0.3], ["A", "C", -0.4], ["B", "C", -0.1]], [50, 50, 50]));
  assert.ok(NMR.fit(good, ["A", "B", "C"]).ok);
});

test("L06: an unconverged or non-finite fit is refused, not displayed", { skip: SKIP }, async () => {
  const p = await open();
  await p.evaluate(() => { const f = window.AlmNmaMetaReg.fit; window.AlmNmaMetaReg.fit = function () { const r = f.apply(this, arguments); r.converged = false; return r; }; });
  const r = await fitWith(p, DEFAULT.join("\n"));
  assert.ok(failed(r), "unconverged fit displayed: " + r.summary);
  assert.match(r.summary, /converge/);
  await p.evaluate(() => { const f = window.AlmNmaMetaReg.fit; window.AlmNmaMetaReg.fit = function () { const r = f.apply(this, arguments); r.converged = true; return r; }; });
  const big = await fitWith(p, DEFAULT.join("\n"), "A", "1e300");
  assert.ok(failed(big), "non-finite prediction displayed: " + big.summary);
  await p.close();
});

test("L08: prediction values are validated and sorted, and extrapolation is flagged", { skip: SKIP }, async () => {
  const p = await open();
  const bad = await fitWith(p, DEFAULT.join("\n"), "A", "40, abc, 60");
  assert.ok(failed(bad), "invalid prediction token dropped silently: " + bad.summary);
  const s = await fitWith(p, DEFAULT.join("\n"), "A", "70, 40, 50");
  assert.deepStrictEqual(s.fit.predictions.map((q) => q.x), [40, 50, 70]);
  assert.doesNotMatch(s.summary, /outside the observed/);
  const ex = await fitWith(p, DEFAULT.join("\n"), "A", "40, 200");
  assert.ok(ex.fit);
  assert.match(ex.summary, /outside the observed covariate range \(45 to 70\)/, ex.summary);
  await p.close();
});

test("L09: editing an input withdraws the displayed fit and the R snapshot", { skip: SKIP }, async () => {
  const p = await open();
  const r = await fitWith(p, DEFAULT.join("\n"));
  assert.ok(r.fit);
  for (const [id, v] of [["src", DEFAULT.slice(0, 9).join("\n")], ["f-ref", "B"], ["f-predict", "45"], ["f-method", "ML"]]) {
    await fitWith(p, DEFAULT.join("\n"), "A", "40, 50, 60, 70");
    await p.evaluate(([i, val]) => { const e = document.getElementById(i); e.value = val; e.dispatchEvent(new Event(i === "f-method" ? "change" : "input", { bubbles: true })); }, [id, v]);
    const st = await p.evaluate(() => ({ beta: document.querySelectorAll("#beta tbody tr").length, fit: window.__almLastNmaMetaReg(),
      dl: document.getElementById("btn-rscript") && document.getElementById("btn-rscript").disabled, summary: document.getElementById("summary").textContent }));
    assert.strictEqual(st.beta, 0, id + ": stale result still shown");
    assert.strictEqual(st.fit, null, id + ": stale fit still exported");
    assert.strictEqual(st.dl, true, id + ": R script still offered for the stale fit");
    assert.match(st.summary, /Inputs changed/);
  }
  await p.close();
});

test("L10: labels and messages are rendered as text, not markup", { skip: SKIP }, async () => {
  const p = await open();
  const src = DEFAULT.join("\n").replace(/, B,/g, ", <b>B</b>,");
  const r = await fitWith(p, src);
  assert.ok(r.fit, r.summary);
  const st = await p.evaluate(() => ({ cell: document.querySelector("#beta tbody tr td").textContent,
    tags: document.querySelectorAll("#beta b, #gamma b, #pred b, #plot-host b, #summary b, #pred-head-host b").length }));
  assert.strictEqual(st.tags, 0, "label markup was parsed");
  assert.match(st.cell, /<b>B<\/b> vs A/);
  const f = await fitWith(p, DEFAULT.join("\n"), "<img src=x onerror=window.__x=1>");
  assert.ok(failed(f));
  assert.strictEqual(await p.evaluate(() => document.querySelectorAll("#summary img").length), 0);
  await p.close();
});

test("L14: the R script's treatment codes keep lexical order beyond 99 treatments, and the panel names what it checks", { skip: SKIP }, async () => {
  const p = await open();
  await fitWith(p, DEFAULT.join("\n"));
  const st = await p.evaluate(() => ({ s: window.AlmRCheck.script(),
    panel: document.getElementById("rcheck-panel").textContent }));
  await p.close();
  assert.ok(st.s, "no buildScript");
  assert.doesNotMatch(st.s, /sprintf\("T%02d"/, "fixed two-digit codes: T100 sorts before T99");
  assert.match(st.s, /formatC\(seq_along\(ord\), width = nchar\(length\(ord\)\), flag = "0"\)/);
  assert.match(st.s, /netmetareg\(net, covar = covariate, method\.tau = method, reference\.group = code\[\[ref\]\], consistency = TRUE, assumption = "independent"\)/);
  assert.doesNotMatch(st.panel, /every displayed number/);
});

test("L16: README and footer describe contrast input, the in-page R check and a bounded agreement", () => {
  const readme = fs.readFileSync(path.join(ROOT, "nma-meta-reg", "README.md"), "utf8");
  assert.doesNotMatch(readme, /one per arm/);
  assert.doesNotMatch(readme, /Shinylive/);
  assert.match(readme, /one row per contrast/i);
  const html = fs.readFileSync(path.join(ROOT, "nma-meta-reg", "index.html"), "utf8");
  const foot = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
  assert.doesNotMatch(foot, /then equal netmetareg's/);
  assert.match(foot, /tolerance/);
});
