// umbrella-overlap: no unqualified "offline" claim (LIM-P34 F15).
//   node --test umbrella-overlap/tests/offline-wording.test.cjs
// The CCA calculation uses only local scripts, but "Verify in R" imports WebR and fetches
// its package manifest from the site (shared/webr-runner.js) and the page registers no
// service worker, so "Free, offline." / "Everything runs on your device." overstated it.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
test("offline claim is qualified", () => {
  assert.doesNotMatch(html, /Free, offline\./);
  assert.doesNotMatch(html, /Everything runs on your device/);
  assert.match(html, /Verify in R needs the WebR runtime/);
});
