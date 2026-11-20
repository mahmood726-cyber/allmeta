// umbrella-overlap engine (shared/umbrella-overlap-v1.js).
//   node --test umbrella-overlap/tests/ids-and-empty.test.cjs
//
// F01 (LIM-P34): any token is a valid study id. Plain-object dictionaries lost "__proto__"
//   and inherited names such as "constructor" made sets[i][k] truthy in a review that does
//   not cite k, so the matrix became asymmetric and phantom shared studies appeared.
// F02 (LIM-P34): a review line with no study ids ("B:") must be refused and named, not
//   silently dropped (which changed c, the number of reviews, and the CCA).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const U = require("../../shared/umbrella-overlap-v1.js");

test("F01: object-property names are ordinary ids", () => {
  const r = U.overlap([{ label: "A", study_ids: ["s1", "s2"] }, { label: "B", study_ids: ["constructor", "__proto__", "toString"] }]);
  assert.ok(r.ok);
  assert.strictEqual(r.nUnique, 5);
  assert.strictEqual(r.nTotal, 5);
  assert.deepStrictEqual(r.matrix, [[2, 0], [0, 3]], "matrix " + JSON.stringify(r.matrix));
  assert.strictEqual(r.sharedCount, 0);
  assert.strictEqual(r.cca, 0);
  const s = U.overlap([{ study_ids: ["__proto__", "x"] }, { study_ids: ["__proto__", "y"] }]);
  assert.strictEqual(s.sharedCount, 1);
  assert.deepStrictEqual(s.mostShared, ["__proto__"]);
  assert.strictEqual(s.frequency["__proto__"], 2);
});

test("F02: an empty review is refused by name", () => {
  const parsed = U.parseReviews("A: x, y\nB:\nC: x, z");
  assert.strictEqual(parsed.length, 3, "the empty review B was dropped by the parser");
  const r = U.overlap(parsed);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /B/);
  const e = U.overlap([{ label: "A", study_ids: ["x"] }, { label: "B", study_ids: [] }]);
  assert.strictEqual(e.ok, false);
  const m = U.overlap([{ label: "A", study_ids: ["x"] }, { label: "B" }, { label: "C", study_ids: ["x"] }]);
  assert.strictEqual(m.ok, false, "a review record without study_ids must not be filtered out");
});
