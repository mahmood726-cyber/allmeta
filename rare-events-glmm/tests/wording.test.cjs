// rare-events-glmm: the page and engine must not claim more than the code does.
//   node --test rare-events-glmm/tests/wording.test.cjs
//
// Requirement (LIM-P30 L22): no "any meta-analysis", no categorical "the GLMM doesn't [bias]",
// no "no continuity correction needed" (the fixed-baseline fit adds 1/2 to a control arm with
// 0 or all events when fixing its baseline, shared/rare-events-glmm.js _logL_study), no claim
// that UM.RS "can't be reproduced in-browser" (this page simply does not implement it), and
// no engine comment asserting equivalence with, or greater robustness than, metafor.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const page = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const eng = fs.readFileSync(path.join(__dirname, "..", "..", "shared", "rare-events-glmm.js"), "utf8");

test("page wording", () => {
  for (const re of [/any meta-analysis/i, /the GLMM doesn't/i, /no continuity correction needed/i,
    /can't be reproduced in-browser/i, /avoids the \+0\.5 continuity correction bias/i]) assert.doesNotMatch(page, re);
});
test("engine comments", () => {
  for (const re of [/Equivalent to metafor/i, /0-event cells are HANDLED\s+NATIVELY/i, /More robust than\s+metafor/i]) assert.doesNotMatch(eng, re);
});
