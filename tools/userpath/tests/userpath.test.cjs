// Offline tests for tools/userpath/userpath.cjs.
//   node --test tools/userpath/tests/
// The overlay test drives the system Chrome on a local fixture (no network). It needs
// playwright-core: set PLAYWRIGHT_CORE to its path if it is not resolvable from here.
// Without it that test is reported as SKIPPED by node:test -- a skipped test is not a pass.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const U = require("../userpath.cjs");

// ---- 1. entry file ------------------------------------------------------------------
test("appUrl: default entry is the app folder (unchanged)", () => {
  assert.strictEqual(U.appUrl("https://x.io/allmeta/", "evalue", null), "https://x.io/allmeta/evalue/");
});
test("appUrl: IPD-Meta-Pro opens ipd-meta-pro.html, not its landing index", () => {
  // IPD-Meta-Pro/index.html is a landing page that only links to ipd-meta-pro.html,
  // so opening the folder exercises no R control at all (exit 3).
  assert.strictEqual(U.appUrl("https://x.io/allmeta/", "IPD-Meta-Pro", null), "https://x.io/allmeta/IPD-Meta-Pro/ipd-meta-pro.html");
});
test("appUrl: --entry overrides the map and the default", () => {
  assert.strictEqual(U.appUrl("http://127.0.0.1:18080/", "evalue", "index.html"), "http://127.0.0.1:18080/evalue/index.html");
  assert.strictEqual(U.appUrl("http://127.0.0.1:18080/", "IPD-Meta-Pro", "index.html"), "http://127.0.0.1:18080/IPD-Meta-Pro/index.html");
});
test("appUrl: an entry may not leave the app folder", () => {
  assert.throws(() => U.appUrl("https://x.io/", "evalue", "../hub/index.html"), /--entry/);
  assert.throws(() => U.appUrl("https://x.io/", "evalue", "https://evil.example/x.html"), /--entry/);
});

// ---- 2. in-page Verify in R ---------------------------------------------------------
const verify = { id: "btn-verify-r", text: "Verify in R" };
const panelBefore = "CHECK THESE NUMBERS IN R\nOne R script ... ends with MATCH n/n or MISMATCH.\nVerify in R\nDownload R script\n";
const j = (c, r) => U.judge(c, r);

test("in-page Verify in R that completed with MATCH is scored by its own result, with counts", () => {
  // the median-to-mean (P24) panel text on the 18 Nov live build
  const t = panelBefore + "R version 4.5.1 in WebR 0.5.5 ran the same script.\n\nMATCH 8/8 (2 more NOT CHECKED: see above)\n\nWan 2014 mean   R 5.1  page 5.1  |diff| 0.0e+00  ok\nMATCH 8/8 (2 more NOT CHECKED: see above)\n";
  const v = j(verify, { kind: "inpage", text: t, before: panelBefore, stillBusy: false });
  assert.strictEqual(v.verdict, "PASS");
  assert.match(v.why, /in-page R comparison: MATCH 8\/8/);
  assert.deepStrictEqual([v.match, v.total], [8, 8]);
  assert.doesNotMatch(v.why, /no validator tab/);
});
test("in-page MATCH with a 'prefix: ' summary line (rare-events-glmm, HTA status) counts", () => {
  const t = panelBefore + "R (WebR 0.5.5, metafor 4.8-0, lme4 2.0-1): MATCH 11/11\nR version 4.5.1\nMATCH 11/11\n";
  const v = j({ id: "rcheck-webr", text: "Verify in R (WebR)" }, { kind: "inpage", text: t, before: panelBefore });
  assert.strictEqual(v.verdict, "PASS");
  const h = j(verify, { kind: "inpage", text: panelBefore + "WebR 0.5.5 · R 4.5.1 — base-R checks: MATCH 10/10. heemod is not available in WebR", before: panelBefore });
  assert.strictEqual(h.verdict, "PASS");
  assert.deepStrictEqual([h.match, h.total], [10, 10]);
});
test("in-page MISMATCH is a FAIL carrying its counts (all three wordings)", () => {
  for (const [line, m, n] of [["MISMATCH (7 of 8 quantities agree)", 7, 8], ["MISMATCH 9/11 agree", 9, 11], ["MISMATCH 3/4", 3, 4]]) {
    const v = j(verify, { kind: "inpage", text: panelBefore + "R says: " + line + "\n", before: panelBefore });
    assert.strictEqual(v.verdict, "FAIL", line);
    assert.match(v.why, /in-page R comparison: MISMATCH/, line);
    assert.deepStrictEqual([v.match, v.total], [m, n], line);
  }
});
test("in-page comparison that did not complete stays a FAIL (but not 'no validator tab')", () => {
  const busy = j(verify, { kind: "inpage", text: panelBefore + "Installing metafor...", before: panelBefore, stillBusy: true });
  assert.strictEqual(busy.verdict, "FAIL");
  assert.match(busy.why, /blocked/);
  const none = j(verify, { kind: "inpage", text: panelBefore + "R check could not run: WebR failed", before: panelBefore, stillBusy: false });
  assert.strictEqual(none.verdict, "FAIL");
  assert.match(none.why, /did not complete/);
  assert.doesNotMatch(none.why, /no validator tab/);
});
test("a MATCH already on the page before the click is not this control's result", () => {
  const old = panelBefore + "MATCH 8/8\n";
  const v = j(verify, { kind: "inpage", text: old, before: old, stillBusy: false });
  assert.strictEqual(v.verdict, "FAIL");
  assert.match(v.why, /did not complete/);
});
test("MATCH 0/0 and 'NOT CHECKED (no estimate ...)' are never a pass", () => {
  assert.strictEqual(j(verify, { kind: "inpage", text: panelBefore + "MATCH 0/0\n", before: panelBefore }).verdict, "UNKNOWN");
  assert.strictEqual(j(verify, { kind: "inpage", text: panelBefore + "NOT CHECKED (no estimate was compared: the page shows none for these inputs)\n", before: panelBefore }).verdict, "UNKNOWN");
  assert.strictEqual(j(verify, { kind: "inpage", text: panelBefore + "MISMATCH (nothing could be checked)\n", before: panelBefore }).verdict, "FAIL");
});
test("help text 'ends with MATCH n/n or MISMATCH' is not a result", () => {
  const t = panelBefore + "Saved x.R - run it with Rscript; it ends with MATCH n/n or MISMATCH.\n";
  assert.strictEqual(j(verify, { kind: "inpage", text: t, before: panelBefore }).verdict, "FAIL");
});
test("validator-tab path unchanged: a tab with MATCH passes, without MATCH fails", () => {
  assert.strictEqual(j(verify, { kind: "newtab", text: "Browser vs R (Match)\nBROWSER VS R (MATCH)" }).verdict, "PASS");
  assert.strictEqual(j(verify, { kind: "newtab", text: "Browser vs R (Mismatch)" }).verdict, "FAIL");
  // a control that neither opened a tab nor ran anything in the page
  assert.strictEqual(j(verify, { kind: null }).verdict, "FAIL");
});
test("existing in-page 'live R quantities' semantics are kept", () => {
  const c = { id: "btn-extras", text: "Validate the extras in R" };
  const before = "Main panel: 5/5 live R quantities passed";
  assert.strictEqual(j(c, { kind: "inpage", text: before + "\nExtras: 3/3 live R quantities passed", before }).verdict, "PASS");
  assert.strictEqual(j(c, { kind: "inpage", text: before, before }).verdict, "UNKNOWN");
  assert.strictEqual(j(c, { kind: "inpage", text: before + "\nx\t3\tFAIL", before }).verdict, "FAIL");
});

// ---- 3. onboarding overlays ---------------------------------------------------------
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || "playwright-core").chromium; } catch (e) { chromium = null; }
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

test("dismissOverlays closes the HTA tutorial and welcome overlays by their close controls", { skip: !chromium && "playwright-core not resolvable" }, async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
  try {
    const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await p.setContent(fixture("hta-overlays.html"));
    // before: the target control is covered, so a user click cannot reach it
    assert.notStrictEqual(await p.evaluate(() => { const r = document.getElementById("target").getBoundingClientRect(); return document.elementFromPoint(r.x + 5, r.y + 5).id; }), "target");
    const rep = await U.dismissOverlays(p);
    assert.deepStrictEqual(rep.remaining, [], JSON.stringify(rep));
    assert.deepStrictEqual(rep.dismissed.map((d) => d.name).sort(), ["HTA quick-start tutorial", "HTA welcome"]);
    // closed by the page's own handlers (which record that), not by the harness deleting nodes
    assert.deepStrictEqual(await p.evaluate(() => window.__closedBy.sort()), ["tutorial-close", "welcome-skip"]);
    await p.click("#target", { timeout: 15000 }); // generous: under 100% CPU a click can stall after "stable"
    assert.strictEqual(await p.evaluate(() => window.__targetClicked), true);
  } finally { await b.close().catch(() => {}); }
});
test("dismissOverlays reports an overlay it could not dismiss", { skip: !chromium && "playwright-core not resolvable" }, async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
  try {
    const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await p.setContent(fixture("stuck-overlay.html"));
    const rep = await U.dismissOverlays(p);
    assert.strictEqual(rep.remaining.length, 1);
    assert.match(rep.remaining[0].name, /stuck-modal/);
    // the harness did not remove it
    assert.strictEqual(await p.evaluate(() => !!document.getElementById("stuck-modal")), true);
    // an undismissed known/covering overlay becomes a verdict, so the run cannot look clean
    const v = U.overlayVerdicts("default", rep);
    assert.strictEqual(v.length, 1);
    assert.notStrictEqual(v[0].verdict, "PASS");
  } finally { await b.close().catch(() => {}); }
});
test("dismissOverlays on a page with no overlay does nothing", { skip: !chromium && "playwright-core not resolvable" }, async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
  try {
    const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await p.setContent("<main><h1>App</h1><button id=x>Run</button></main>");
    const rep = await U.dismissOverlays(p);
    assert.deepStrictEqual([rep.dismissed, rep.remaining], [[], []]);
    assert.deepStrictEqual(U.overlayVerdicts("default", rep), []);
  } finally { await b.close().catch(() => {}); }
});
