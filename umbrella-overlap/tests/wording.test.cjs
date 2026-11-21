// umbrella-overlap: the verdict must not claim more than aggregate CCA shows.
//   node --test umbrella-overlap/tests/wording.test.cjs
//
// F07 (LIM-P34): a low aggregate CCA can coexist with two reviews sharing their whole study
//   list, so "the reviews are largely independent" is not established; the verdict must
//   point to the pairwise matrix instead.
// F09 (LIM-P34): the band uses the unrounded CCA (classification unchanged, it is correct),
//   so a CCA of 4.996% shows "5.0%" with "Slight"; the verdict must say the band uses the
//   unrounded value.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const U = require("../../shared/umbrella-overlap-v1.js");

test("F07: low CCA with a fully shared pair is not called independent", () => {
  const ids = (p, n) => Array.from({ length: n }, (_, i) => p + i);
  const revs = [{ label: "A", study_ids: ["s1", "s2"] }, { label: "B", study_ids: ["s1", "s2"] },
    { label: "C", study_ids: ids("c", 40) }, { label: "D", study_ids: ids("d", 40) }];
  const r = U.overlap(revs);
  assert.ok(r.cca < 0.05, "probe must be in the Slight band, cca " + r.cca);
  assert.strictEqual(r.matrix[0][1], 2);
  assert.doesNotMatch(r.verdict, /largely independent/i);
  assert.match(r.verdict, /does not establish/i);
  assert.match(r.verdict, /pairwise/i);
});

test("F09: band boundary disclosed; classification still on the unrounded value", () => {
  assert.strictEqual(U.classifyGroove(0.04996), "Slight");
  const r = U.overlap([{ label: "A", study_ids: ["x"] }, { label: "B", study_ids: ["x", "y"] }]);
  assert.match(r.verdict, /unrounded/i);
});
