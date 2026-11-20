// PR #637 round 3 (lane uptool2): the in-page "Verify in R" score is FAIL-CLOSED.
// PASS needs ALL of: new output ends with MATCH n/n (n > 0); no MISMATCH(ES) / NOT CHECKED verdict /
// error or refusal in it; no busy text new or changed since the click anywhere on the page;
// stable for STABLE_MS; every earlier control idle before the click. Anything else is FAIL or UNKNOWN.
"use strict";
const test = require("node:test"); const assert = require("node:assert");
const fs = require("fs"); const path = require("path"); const vm = require("vm");
const SRC = process.env.UP || path.join(__dirname, "..", "userpath.cjs");
const U = require(SRC);
const C = { id: "btn-verify-r", text: "Verify in R" };
const ok = { kind: "inpage", stillBusy: false, busyBefore: false, stableMs: 12000 };
const j = (r) => U.judge(C, Object.assign({}, ok, r));
const P = "Check in R\nVerify in R\n"; // panel before the click

function loadInternals() {
  const src = fs.readFileSync(SRC, "utf8").replace(/if \(require\.main === module\)[^\n]*/, "") +
    "\nmodule.exports.settle = settle; module.exports.lb = () => lastSettleBusy; module.exports.ls = () => lastSettleStableMs; module.exports.waitIdle = waitIdle;";
  const clock = { now: 0 }; const mod = { exports: {} };
  vm.runInNewContext(src, { require, module: mod, exports: mod.exports, process: { argv: ["n", "s", "app", "out"], env: {} }, Date: { now: () => clock.now }, console });
  return { M: mod.exports, clock };
}
const fakePage = (clock, body, status) => ({ waitForTimeout: async (ms) => { clock.now += ms; },
  evaluate: async (fn) => String(fn).includes("querySelectorAll") ? status(clock.now) : body(clock.now) });

// ---- condition 1: the LAST verdict line is MATCH n/n --------------------------------
test("R3-1 a MATCH followed by a NOT CHECKED verdict is not PASS", () => {
  assert.notStrictEqual(j({ before: P, text: P + "MATCH 3/3\nNOT CHECKED: no tau2 was compared\n" }).verdict, "PASS");
  assert.notStrictEqual(j({ before: P, text: P + "Pooled: NOT CHECKED (no estimate)\nMATCH 3/3\n" }).verdict, "PASS");
});
test("R3-1 partial, zero and absent counts are never PASS", () => {
  for (const t of ["MATCH 2/3", "MATCH 3/3 of 5", "MATCH 0/0", "R finished.", ""]) assert.notStrictEqual(j({ before: P, text: P + t + "\n" }).verdict, "PASS", t);
});

// ---- condition 2: MISMATCH(ES), NOT CHECKED, errors ---------------------------------
for (const line of ["MISMATCHES: 2", "2 MISMATCHES in tau2", "Error in rma(yi, vi): fitting failed", "Error: object 'yi' not found",
  "Fehler in rma(yi, vi) : Optimierer fehlgeschlagen", "Validation refused: data changed", "live R comparison unavailable",
  "WebR unavailable in this browser", "tau2\t0.1\t0.2\tFAIL", "ERROR loading metafor", "wr.captureR is not a function", "Model fit failed to converge"])
  test("R3-2 new output line " + JSON.stringify(line) + " next to a final MATCH is not PASS", () => {
    const v = j({ before: P, text: P + line + "\nMATCH 4/4\n" });
    assert.notStrictEqual(v.verdict, "PASS", v.why);
    assert.strictEqual(v.verdict, "FAIL", v.why);
  });
test("R3-2 prose that only looks like an error word does not block a real MATCH", () => {
  // R's own print: "se" columns and the word "standard error" appear in normal output
  const t = P + "estimate  standard error: 0.31\nStd. Error column shown\nMATCH 5/5\n";
  assert.strictEqual(j({ before: P, text: t }).verdict, "PASS", j({ before: P, text: t }).why);
});
test("R3-2 an undeclared NOT CHECKED row is not PASS; a declared one is, with the count kept", () => {
  assert.strictEqual(j({ before: P, text: P + "tau2   NOT CHECKED (package missing)\nMATCH 3/3\n" }).verdict, "UNKNOWN");
  const v = j({ before: P, text: P + "MATCH 3/3 (1 more NOT CHECKED: see above)\ntau2   NOT CHECKED (package missing)\nMATCH 3/3 (1 more NOT CHECKED: see above)\n" });
  assert.strictEqual(v.verdict, "PASS", v.why); assert.strictEqual(v.notChecked, 1);
});
test("R3-2 an old MISMATCH or error already on the page before the click does not taint this control", () => {
  const b = P + "Other panel: MISMATCH 1/2\nError in foo(): bar\n";
  assert.strictEqual(j({ before: b, text: b + "MATCH 4/4\n" }).verdict, "PASS");
});

// ---- condition 3: busy text new or changed since the click, anywhere ----------------
test("R3-3 new busy text in plain page prose (no status region) after an interim MATCH -> FAIL blocked", () => {
  const v = j({ before: P, text: P + "Stage 1: MATCH 3/3\nStage 2: running WebR ...\n" });
  assert.strictEqual(v.verdict, "FAIL"); assert.match(v.why, /blocked/);
});
test("R3-3 busy text elsewhere on the page (another panel) that appeared since the click -> not PASS", () => {
  const v = j({ before: "A: idle\n" + P, text: "A: Installing metafor ...\n" + P + "MATCH 3/3\n", region: { before: P, text: P + "MATCH 3/3\n" } });
  assert.notStrictEqual(v.verdict, "PASS", v.why);
});
test("R3-3 static busy prose present before and unchanged after is ignored (HTA 'Loading...')", () => {
  const tail = "Loading Data\nSurvival Fitting\nLoading...\n";
  assert.strictEqual(j({ before: P + tail, text: P + tail + "MATCH 14/14\n" }).verdict, "PASS");
});
test("R3-3 static busy prose that CHANGED during the run is not ignored", () => {
  const v = j({ before: P + "Loading...\n", text: P + "Loading 2 of 5 ...\nMATCH 14/14\n" });
  assert.notStrictEqual(v.verdict, "PASS", v.why);
});
test("R3-3 busy text that was there before the click and vanished during the run -> UNKNOWN (another run finished)", () => {
  const v = j({ before: "A: Installing metafor...\n" + P, text: "A: done\n" + P + "MATCH 8/8\n", region: { before: P, text: P + "MATCH 8/8\n" } });
  assert.strictEqual(v.verdict, "UNKNOWN", v.why);
});
test("R3-3 status region: new busy -> FAIL; unchanged static busy status -> PASS", () => {
  assert.strictEqual(j({ before: P, text: P + "MATCH 3/3\n", statusBefore: "Ready", statusAfter: "Running R in WebR..." }).verdict, "FAIL");
  assert.strictEqual(j({ before: P, text: P + "MATCH 3/3\n", statusBefore: "Loading...", statusAfter: "Loading..." }).verdict, "PASS");
  assert.strictEqual(j({ before: P, text: P + "MATCH 3/3\n", statusBefore: "Installing metafor ...", statusAfter: "Done" }).verdict, "UNKNOWN");
});

// ---- condition 4: stable --------------------------------------------------------------
test("R3-4 a page still changing when read (stable < STABLE_MS) is UNKNOWN", () => {
  assert.strictEqual(j({ before: P, text: P + "MATCH 3/3\n", stableMs: U.STABLE_MS - 1 }).verdict, "UNKNOWN");
  assert.strictEqual(j({ before: P, text: P + "MATCH 3/3\n", stableMs: U.STABLE_MS }).verdict, "PASS");
});

// ---- condition 5: earlier controls idle ---------------------------------------------
test("R3-5 busyBefore true is UNKNOWN even with the control's own region (round-2 guard `!own` removed)", () => {
  assert.strictEqual(j({ busyBefore: true, before: P, text: P + "MATCH 8/8\n", region: { before: "", text: "MATCH 8/8" } }).verdict, "UNKNOWN");
});
test("R3-5 busyBefore not recorded and busy text before the click -> UNKNOWN; none -> judged normally", () => {
  assert.strictEqual(j({ busyBefore: undefined, before: P + "Loading...\n", text: P + "Loading...\nMATCH 3/3\n" }).verdict, "UNKNOWN");
  assert.strictEqual(j({ busyBefore: undefined, before: P, text: P + "MATCH 3/3\n" }).verdict, "PASS");
});

// ---- settle / waitIdle with a fake clock ---------------------------------------------
test("R3-S settle: interim MATCH + plain-prose busy waits for the final line; result FAIL", async () => {
  const { M, clock } = loadInternals();
  const body = (t) => t < 4000 ? P : t < 90000 ? P + "Stage 1: MATCH 3/3\nStage 2: running WebR ..." : P + "Stage 1: MATCH 3/3\nStage 2: MISMATCH 1/3";
  const out = await M.settle(fakePage(clock, body, () => ""), 420000, /match/i, P, "");
  assert.ok(clock.now >= 90000 + U.STABLE_MS, "returned at " + clock.now);
  const v = j({ before: P, text: out, stillBusy: M.lb(), stableMs: M.ls(), statusBefore: "", statusAfter: "" });
  assert.strictEqual(v.verdict, "FAIL", v.why);
});
test("R3-S settle: static 'Loading...' in prose and an unchanged busy status do not hold the wait", async () => {
  const { M, clock } = loadInternals();
  const tail = "\nLoading Data\nLoading...";
  const body = (t) => (t < 20000 ? P : P + "MATCH 14/14") + tail;
  const out = await M.settle(fakePage(clock, body, () => "Loading..."), 420000, /match/i, P + tail, "Loading...");
  assert.ok(clock.now < 60000, "waited until " + clock.now);
  assert.ok(M.ls() >= U.STABLE_MS);
  const v = j({ before: P + tail, text: out, stillBusy: M.lb(), stableMs: M.ls(), statusBefore: "Loading...", statusAfter: "Loading..." });
  assert.strictEqual(v.verdict, "PASS", v.why);
});
test("R3-S settle: a page whose text never stops changing times out as not PASS", async () => {
  const { M, clock } = loadInternals();
  const body = (t) => P + "MATCH 3/3\nclock " + t;
  const out = await M.settle(fakePage(clock, body, () => ""), 60000, /match/i, P, "");
  const v = j({ before: P, text: out, stillBusy: M.lb(), stableMs: M.ls() });
  assert.notStrictEqual(v.verdict, "PASS", v.why);
});
test("R3-W waitIdle: static busy prose in the baseline is idle; a new busy line is not", async () => {
  const { M, clock } = loadInternals();
  const base = { body: P + "Loading...", status: "" };
  assert.strictEqual(await M.waitIdle(fakePage(clock, () => P + "Loading...", () => ""), 20000, base), true);
  assert.ok(clock.now < 5000);
  clock.now = 0;
  assert.strictEqual(await M.waitIdle(fakePage(clock, () => P + "Loading...\nA: Installing metafor ...", () => ""), 20000, base), false);
  clock.now = 0;
  assert.strictEqual(await M.waitIdle(fakePage(clock, () => P, () => "Running R..."), 20000, base), false);
});

// ---- real page text from the 2026-11-20 live runs (lane uptool r3) -----------------------
// Records copied from live verdict runs; evalue's predates busyBefore and is given busyBefore false.
const LIVE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "live-inpage-2026-11-20.json"), "utf8"));
const want = { "median-to-mean": "PASS", "rare-events-glmm": "PASS", HTA: "PASS", evalue: "FAIL" };
for (const r of LIVE) test("R3-L live " + r.app + " " + r.control.id + " -> " + want[r.app], () => {
  const v = U.judge(r.control, Object.assign({ stableMs: 12000 }, r));
  assert.strictEqual(v.verdict, want[r.app], v.why);
});
test("R3-L live HTA with its 'Loading...' help text CHANGED during the run is not PASS", () => {
  const r = LIVE.find((x) => x.app === "HTA");
  assert.ok(/Loading\.\.\./.test(r.before));
  const v = U.judge(r.control, Object.assign({}, r, { text: r.text.replace("Loading...", "Loading 3/9 ..."), stableMs: 12000 }));
  assert.notStrictEqual(v.verdict, "PASS", v.why);
});
