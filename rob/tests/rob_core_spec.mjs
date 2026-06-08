// Deterministic engine tests for shared/rob-core.js (exit 1 on any failure).
// Run: node rob/tests/rob_core_spec.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const RC = require("../../shared/rob-core.js");

let fails = 0;
function ok(cond, msg) { if (!cond) { console.error("FAIL: " + msg); fails++; } else console.log("ok - " + msg); }
function eq(a, b, msg) { ok(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

// --- low-risk RCT text: should suggest low across randomization domains ----
const lowText = "The allocation sequence was computer-generated in permuted blocks of four, stratified by centre. "
  + "Allocation was concealed using sequentially numbered, opaque, sealed envelopes. "
  + "Participants and outcome assessors were blinded to treatment assignment. "
  + "The analysis was by intention-to-treat with no loss to follow-up. "
  + "The trial was prospectively registered (NCT01234567) and all pre-specified outcomes were reported.";

eq(RC.scoreDomain(lowText, RC.DOMAINS.sequence).judgment, "low", "computer-generated -> sequence low");
eq(RC.scoreDomain(lowText, RC.DOMAINS.allocation).judgment, "low", "opaque sealed envelopes -> allocation low");
eq(RC.scoreDomain(lowText, RC.DOMAINS.performance).judgment, "low", "blinded participants -> performance low");
eq(RC.scoreDomain(lowText, RC.DOMAINS.detection).judgment, "low", "blinded assessors -> detection low");
eq(RC.scoreDomain(lowText, RC.DOMAINS.attrition).judgment, "low", "ITT/no loss -> attrition low");
eq(RC.scoreDomain(lowText, RC.DOMAINS.reporting).judgment, "low", "registered/pre-specified -> reporting low");

const r2 = RC.suggestRoB2(lowText);
eq(r2.verdicts.overall, "low", "low-risk RCT -> RoB2 overall low");
ok(r2.support.D1 && r2.support.D1.length > 0, "D1 carries a supporting sentence");
ok(/computer|envelope|random/i.test(r2.support.D1), "D1 sentence mentions the cue it keyed on");

// --- high-risk text: quasi-random + open label -----------------------------
const highText = "Participants were allocated by alternation according to date of birth. "
  + "This was an open-label study with no blinding of participants or assessors.";
eq(RC.scoreDomain(highText, RC.DOMAINS.sequence).judgment, "high", "alternation/date of birth -> sequence high");
eq(RC.scoreDomain(highText, RC.DOMAINS.performance).judgment, "high", "open-label/no blinding -> performance high");

// --- negation guard: "not blinded" must not read as low --------------------
const negText = "Outcome assessors were not blinded to the allocated intervention.";
ok(RC.scoreDomain(negText, RC.DOMAINS.detection).judgment !== "low", "negated blinding not read as low");

// --- no-signal text: unclear, low confidence -------------------------------
const vague = "We compared two treatments in patients with the condition over twelve weeks.";
eq(RC.scoreDomain(vague, RC.DOMAINS.sequence).judgment, "unclear", "no method described -> unclear");
ok(RC.scoreDomain(vague, RC.DOMAINS.sequence).confidence < 0.4, "unclear has low confidence");

// --- canonical domain mapping ----------------------------------------------
eq(RC.canonicalDomain("random sequence generation (selection bias)"), "sequence", "maps sequence");
eq(RC.canonicalDomain("allocation concealment (selection bias)"), "allocation", "maps allocation");
eq(RC.canonicalDomain("blinding of outcome assessment (detection bias) all outcomes"), "detection", "maps detection");
eq(RC.canonicalDomain("incomplete outcome data (attrition bias)"), "attrition", "maps attrition");

// --- ROBINS-I scaffold -----------------------------------------------------
const ri = RC.suggestRobinsI(lowText);
ok(ri.verdicts.D1 && ri.verdicts.overall, "ROBINS-I returns 7 domains + overall");
ok(["low", "moderate", "serious", "critical"].indexOf(ri.verdicts.overall) >= 0, "ROBINS-I overall in scale");

// --- Sterne overall logic --------------------------------------------------
eq(RC.overallRoB2({ D1: "low", D2: "low", D3: "low", D4: "low", D5: "low" }), "low", "all low -> low");
eq(RC.overallRoB2({ D1: "low", D2: "high", D3: "low", D4: "low", D5: "low" }), "high", "any high -> high");
eq(RC.overallRoB2({ D1: "low", D2: "some", D3: "low", D4: "low", D5: "low" }), "some", "any some -> some");

console.log("\n" + (fails ? fails + " FAILURES" : "ALL PASS"));
process.exit(fails ? 1 : 0);
