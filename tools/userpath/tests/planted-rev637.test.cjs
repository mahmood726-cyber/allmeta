// rev637 planted tests: (1) foreign/stale MATCH attribution, (2) partial-count parsing, settle early exit.
// Planted by the PR #637 reviewer (F:/claude-temp/lanes/rev637-work/planted.test.cjs); SRC made relative.
"use strict";
const test = require("node:test"); const assert = require("node:assert");
const fs = require("fs"); const path = require("path"); const vm = require("vm");
const SRC = process.env.UP || path.join(__dirname, "..", "userpath.cjs");
const U = require(SRC);
const verify = { id: "btn-verify-r", text: "Verify in R" };
const j = (r) => U.judge(verify, Object.assign({ kind: "inpage", stillBusy: false }, r));

// (1a) MATCH already on page -> not counted (expect FAIL)
test("1a stale identical MATCH not counted", () => { const b = "A panel\nMATCH 8/8\n"; assert.notStrictEqual(j({ before: b, text: b }).verdict, "PASS"); });
// (1b) another control's run (A, still busy when its wait ended) finishes during B's wait
test("1b foreign control's late MATCH credited to this control", () => {
  const b = "Panel A: Installing metafor...\nPanel B: (idle)\n";
  const a = "Panel A: MATCH 8/8\nPanel B: (idle)\n";
  assert.notStrictEqual(j({ before: b, text: a }).verdict, "PASS", "B did nothing but is PASS");
});
// (1c) stale MISMATCH elsewhere + this control's fresh MATCH -> PASS is right
test("1c stale MISMATCH does not taint a fresh MATCH", () => {
  assert.strictEqual(j({ before: "MISMATCH 3/4\n", text: "MISMATCH 3/4\nMATCH 4/4\n" }).verdict, "PASS");
});
// (1d) a re-run that prints the same line again replaces the old one -> multiset sees nothing new
test("1d re-run replacing identical text is not credited (false FAIL, not false PASS)", () => {
  const v = j({ before: "MATCH 8/8\n", text: "MATCH 8/8\n" }); assert.notStrictEqual(v.verdict, "PASS");
});
// (2) partial count wordings
for (const [line, want] of [
  ["MATCH 10 of 13", "notPASS"], ["10/13 MATCH, 3 MISMATCH", "notPASS"], ["MATCH 10/13", "FAIL"],
  ["Result: MATCH 10/13", "FAIL"], ["MATCH 13/13", "PASS"], ["MATCH 10/10 of 13 quantities", "notPASS"],
  ["MATCH 8/8\nx: MISMATCH 1/2", "FAIL"],
  ["MISMATCH 2 of 5 checks differ", "FAIL"],                 // benefit-risk wording
  ["MISMATCH (2 of 10 compared quantities outside the panel tolerance or in error)", "FAIL"], // IPD-Meta-Pro wording
  ["Section 1: MATCH 3/3\nMISMATCH (2 of 10 compared quantities outside the panel tolerance or in error)", "FAIL"],
  ["NOT CHECKED: no quantity could be compared", "notPASS"],
]) test("2 " + JSON.stringify(line), () => {
  const v = j({ before: "", text: line + "\n" });
  if (want === "notPASS") assert.notStrictEqual(v.verdict, "PASS", v.why);
  else assert.strictEqual(v.verdict, want, v.why);
});
// (3) settle: a fresh intermediate MATCH line suppresses BUSY and ends the wait while R is still running
test("3 settle returns early on an intermediate fresh MATCH while page still busy", async () => {
  let src = fs.readFileSync(SRC, "utf8").replace(/if \(require\.main === module\)[^\n]*/, "") + "\nmodule.exports.settle = settle; module.exports.lb = () => lastSettleBusy;";
  let now = 0; const FakeDate = { now: () => now };
  const mod = { exports: {} };
  vm.runInNewContext(src, { require, module: mod, exports: mod.exports, process: { argv: ["n", "s", "app", "out"], env: {} }, Date: FakeDate, console, String, RegExp, Object, JSON, Math });
  // page timeline: t<=4s nothing; 4s..60s "Stage 1: MATCH 3/3" + "running stage 2"; 60s+ final MISMATCH
  const text = () => now < 4000 ? "Verify in R" : now < 60000 ? "Verify in R\nStage 1: MATCH 3/3\nrunning stage 2 ..." : "Verify in R\nStage 1: MATCH 3/3\nMISMATCH 2/3\n";
  const p = { waitForTimeout: async (ms) => { now += ms; }, evaluate: async () => now < 60000 ? "running" : "" };
  p.evaluate = async (fn) => (String(fn).includes("innerText);") || String(fn).includes("document.body.innerText")) && !String(fn).includes("querySelectorAll") ? text() : (now < 60000 ? "running stage 2" : "");
  const t = await mod.exports.settle(p, 420000, /(match|fail)/i, "Verify in R");
  const v = U.judge(verify, { kind: "inpage", before: "Verify in R", text: t, stillBusy: mod.exports.lb() });
  console.log("settle returned at", now, "ms; verdict", v.verdict, v.why);
  assert.notStrictEqual(v.verdict, "PASS", "returned at " + now + " ms with " + JSON.stringify(t));
});
// (4) entry checks
for (const e of ["%2e%2e/hub/index.html", ".%2E/hub/x.html", "..%2fhub", "x.html?y=../../z", "//evil.example/x", "C:/x.html", "\\srv\\x"]) test("4 entry " + e, () => {
  let url; try { url = U.appUrl("https://h.io/allmeta/", "evalue", e); } catch (err) { return; }
  const resolved = new URL(url).href;
  assert.ok(resolved.startsWith("https://h.io/allmeta/evalue/"), e + " -> " + resolved);
});
