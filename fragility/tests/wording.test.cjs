// fragility: page wording must match what the code does (LIM-P33 L22, page parts).
//   node --test fragility/tests/wording.test.cjs
// The search is greedy (frag.ma), so it does not guarantee the FEWEST changes; "matches the
// fragility R package" needs its scope (FI, FQ and path of frag.ma(method = "DL") on the
// validated inputs; paths can differ after floating-point near-ties); the footer must state
// the stop rule (stop when significance flips, i.e. the watched limit reaches the null).
// shared/fragility.js comments are not changed: that file is in emailed_deps.txt.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
test("no minimality or unscoped parity claim", () => {
  assert.doesNotMatch(html, /the fewest single-patient/);
  assert.doesNotMatch(html, /the algorithm matches the <code>fragility<\/code> R package\./);
  assert.match(html, /near-ties/);
  assert.match(html, /reaches the null/);
});
