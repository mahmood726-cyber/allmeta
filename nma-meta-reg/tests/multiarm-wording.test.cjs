// nma-meta-reg: what the page tells the user about multi-arm input must match what the
// engine accepts.  node --test nma-meta-reg/tests/multiarm-wording.test.cjs
//
// The engine (shared/nma-meta-regression.js, the "wrong number of comparisons" check)
// refuses a multi-arm study unless it supplies ALL m(m-1)/2 pairwise contrasts, exactly as
// netmeta does; only after that does it keep the contrasts against the study baseline.
// The header and footer used to say only "Multi-arm studies use (only) contrasts against
// the study baseline", which reads as if baseline-only input were fine. A user who pasted
// baseline-only contrasts for a 3-arm study (Nov 2026 user-path run) got the refusal.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const NMR = require("../../shared/nma-meta-regression.js");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");

const base = [
  { studyId: "S1", trtA: "A", trtB: "B", yi: -0.3, sei: 0.1, covariate: 50 },
  { studyId: "S2", trtA: "A", trtB: "C", yi: -0.4, sei: 0.12, covariate: 55 },
  { studyId: "S3", trtA: "B", trtB: "C", yi: -0.1, sei: 0.11, covariate: 60 },
  { studyId: "S4", trtA: "A", trtB: "B", yi: -0.2, sei: 0.1, covariate: 65 },
  // 3-arm study, baseline contrasts only (A-B, A-C): 2 of the 3 required
  { studyId: "M1", trtA: "A", trtB: "B", yi: -0.25, sei: 0.13, covariate: 52 },
  { studyId: "M1", trtA: "A", trtB: "C", yi: -0.35, sei: 0.14, covariate: 52 },
];

test("engine refuses a 3-arm study given only its baseline contrasts (as netmeta)", () => {
  assert.throws(() => NMR.fit(base, ["A", "B", "C"], { method: "REML" }), /wrong number of comparisons: 3 treatments need 3 contrasts, 2 supplied/);
  const full = base.concat([{ studyId: "M1", trtA: "B", trtB: "C", yi: -0.1, sei: 0.15, covariate: 52 }]);
  assert.doesNotThrow(() => NMR.fit(full, ["A", "B", "C"], { method: "REML" }));
});

test("page says a multi-arm study must supply all m(m-1)/2 contrasts", () => {
  assert.match(text, /multi-arm stud(y|ies) must (supply|give) (all|every)[^.]*m\(m\s*[-−]\s*1\)\/2/i, "page does not state the all-contrasts requirement");
});

test("page never says baseline-only multi-arm input is used as given", () => {
  // the old wording, which a user reads as an input instruction
  assert.doesNotMatch(text, /Multi-arm studies use study-baseline contrasts with/);
  assert.doesNotMatch(text, /Multi-arm studies use only contrasts against the study baseline, as netmetareg;/);
});
