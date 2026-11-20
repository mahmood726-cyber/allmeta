// Written by the PR #637 second-round reviewer (lane rev637b, F:/claude-temp/lanes/rev637b-work/rev637b.test.cjs),
// copied unchanged except SRC, which defaults to this repo's userpath.cjs. Credit: rev637b.
// rev637b independent planted tests (written by reviewer lane rev637b; not derived from planted-rev637).
"use strict";
const test = require("node:test"); const assert = require("node:assert");
const fs = require("fs"); const vm = require("vm");
const SRC = process.env.UP || require("path").join(__dirname, "..", "userpath.cjs");
const U = require(SRC);
const C = { id: "btn-verify-r", text: "Verify in R" };
const j = (r) => U.judge(C, Object.assign({ kind: "inpage", stillBusy: false }, r));

// Load settle()/waitIdle() with a fake clock.
function loadInternals() {
  const src = fs.readFileSync(SRC, "utf8").replace(/if \(require\.main === module\)[^\n]*/, "") +
    "\nmodule.exports.settle = settle; module.exports.lb = () => lastSettleBusy; module.exports.waitIdle = waitIdle;";
  const clock = { now: 0 };
  const mod = { exports: {} };
  vm.runInNewContext(src, { require, module: mod, exports: mod.exports, process: { argv: ["n", "s", "app", "out"], env: {} },
    Date: { now: () => clock.now }, console, String, RegExp, Object, JSON, Math, Array, Number, Error, URL });
  return { M: mod.exports, clock };
}
// fake page: body(now) gives body innerText, status(now) gives live/status region text
function fakePage(clock, body, status) {
  return { waitForTimeout: async (ms) => { clock.now += ms; },
    evaluate: async (fn) => String(fn).includes("querySelectorAll") ? status(clock.now) : body(clock.now) };
}

// ---- MAJOR 1: interim stage MATCH while busy ----
test("M1a interim MATCH, busy shown in a live region -> not PASS", async () => {
  const { M, clock } = loadInternals();
  const body = (t) => t < 4000 ? "Verify" : t < 90000 ? "Verify\nStage 1: MATCH 3/3" : "Verify\nStage 1: MATCH 3/3\nStage 2: MISMATCH 1/3";
  const st = (t) => t < 90000 ? "Running stage 2 ..." : "Done";
  const out = await M.settle(fakePage(clock, body, st), 420000, /match/i, "Verify");
  const v = j({ before: "Verify", text: out, stillBusy: M.lb() });
  assert.notStrictEqual(v.verdict, "PASS", `returned at ${clock.now} ms: ${v.why}`);
});
test("M1b [8b97cd9d] interim MATCH, busy text in plain page prose (no live region) -> not PASS", async () => {
  const { M, clock } = loadInternals();
  const body = (t) => t < 4000 ? "Verify" : t < 90000 ? "Verify\nStage 1: MATCH 3/3\nStage 2: running WebR ..." : "Verify\nStage 1: MATCH 3/3\nStage 2: MISMATCH 1/3";
  const st = () => ""; // page has no [role=status]/[aria-live]
  const out = await M.settle(fakePage(clock, body, st), 420000, /match/i, "Verify");
  const v = j({ before: "Verify", text: out, stillBusy: M.lb() });
  assert.notStrictEqual(v.verdict, "PASS", `settle returned at ${clock.now} ms with ${JSON.stringify(out)} -> ${v.verdict}`);
});
test("M1c final result printed, page idle -> PASS (no over-blocking)", async () => {
  const { M, clock } = loadInternals();
  const body = (t) => t < 10000 ? "Verify" : "Verify\nR: MATCH 5/5";
  const out = await M.settle(fakePage(clock, body, (t) => t < 10000 ? "Running R..." : "Done"), 420000, /match/i, "Verify");
  assert.strictEqual(j({ before: "Verify", text: out, stillBusy: M.lb() }).verdict, "PASS");
});

// ---- MAJOR 2: entry escape ----
for (const e of ["%2e%2e/hub/index.html", ".%2E/x.html", "%2E%2e%2Fhub", ".\t./hub/x.html", "..\n/hub/x.html", "a/../../hub/x.html",
  "sub/%2e%2e/%2e%2e/hub", "%5c..%5chub", "https://evil.example/", "//evil.example/x", "/abs.html", "\\\\srv\\x", "?q=1", "#frag", "./", ".", "..", "javascript:alert(1)"]) {
  test("M2 entry " + JSON.stringify(e) + " stays inside or is refused", () => {
    let url; try { url = U.appUrl("https://h.io/allmeta/", "evalue", e); } catch (err) { return; }
    const u = new URL(url);
    assert.ok(u.origin === "https://h.io" && u.pathname.startsWith("/allmeta/evalue/") && u.pathname !== "/allmeta/evalue/", e + " -> " + url);
  });
}
test("M2 legit entries accepted", () => {
  assert.strictEqual(U.appUrl("https://h.io/allmeta/", "IPD-Meta-Pro", null), "https://h.io/allmeta/IPD-Meta-Pro/ipd-meta-pro.html");
  assert.strictEqual(U.appUrl("https://h.io/allmeta/", "evalue", "sub/app.html"), "https://h.io/allmeta/evalue/sub/app.html");
  assert.strictEqual(U.appUrl("file:///F:/allmeta/", "evalue", "index.html"), "file:///F:/allmeta/evalue/index.html");
});

// ---- MINOR 1: foreign MATCH ----
test("m1a own region: MATCH printed in another panel is not this control's", () => {
  const v = j({ before: "x", text: "x\nPanel A: MATCH 8/8", region: { before: "Panel B ready", text: "Panel B ready" } });
  assert.notStrictEqual(v.verdict, "PASS", v.why);
});
test("m1b no region, busyBefore true, late foreign MATCH -> not PASS", () => {
  assert.notStrictEqual(j({ before: "A: Installing metafor...\n", text: "A: MATCH 8/8\n", busyBefore: true }).verdict, "PASS");
});
test("m1c [8b97cd9d] no region, busy text in prose so harness recorded busyBefore=false, late foreign MATCH -> not PASS", () => {
  const v = j({ before: "Panel A: Installing metafor...\nPanel B: idle\n", text: "Panel A: MATCH 8/8\nPanel B: idle\n", busyBefore: false });
  assert.notStrictEqual(v.verdict, "PASS", v.why);
});
test("m1d shared own region, busyBefore true (waitIdle timed out), earlier run's MATCH lands in it -> not PASS", () => {
  const v = j({ before: "", text: "", busyBefore: true, region: { before: "Installing metafor ...", text: "MATCH 8/8" } });
  assert.notStrictEqual(v.verdict, "PASS", v.why);
});

// ---- MINOR 2/3: wordings and MISMATCH dominance ----
for (const [txt, want] of [
  ["MISMATCH (3 of 9 compared quantities outside tolerance)", "FAIL"],
  ["NOT CHECKED: no quantity was comparable", "UNKNOWN"],
  ["MISMATCH 4 of 6 checks differ", "FAIL"],
  ["Section A: MATCH 3/3\nSection B: MISMATCH 4 of 6 checks differ", "FAIL"],
  ["MISMATCH 1/2\nSection: MATCH 3/3", "FAIL"],
  ["Overall: MATCH 3/3\n  pooled: MISMATCH", "FAIL"],
  ["MATCH 4/4 (1 more NOT CHECKED: see above)", "PASS"],
  ["Help: the panel ends with MATCH n/n or MISMATCH\nR: MATCH 2/2", "PASS"],
  ["MATCH 2/3", "FAIL"],
  ["MATCH 0/0", "UNKNOWN"],
]) test("m23 " + JSON.stringify(txt), () => assert.strictEqual(j({ before: "", text: txt + "\n" }).verdict, want, j({ before: "", text: txt }).why));

// ---- New false-PASS probes ----
test("N1 interim MATCH then an R error line (no MISMATCH word) -> not PASS", () => {
  const v = j({ before: "", text: "Stage 1: MATCH 3/3\nError in rma(yi, vi): fitting failed\n" });
  assert.notStrictEqual(v.verdict, "PASS", v.why);
});
test("N2 'MISMATCHES' plural next to a MATCH -> not PASS", () => {
  const v = j({ before: "", text: "Section: MATCH 3/3\n2 MISMATCHES in tau2 section\n" });
  assert.notStrictEqual(v.verdict, "PASS", v.why);
});
