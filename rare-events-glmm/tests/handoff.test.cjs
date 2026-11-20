// rare-events-glmm: no "Continue with" hand-off that cannot carry this page's data.
//   node --test rare-events-glmm/tests/handoff.test.cjs
//
// Requirement: a hand-off button may be offered only if the page writes its current studies
// to the bus first. This page loads no studies-bus helper (MaStudies) and passes no
// getStudies, so shared/app-flow.js could push nothing and still opened forest-plot /
// heterogeneity / bma-tau-priors with ?fromBus=1, i.e. on whatever an earlier session left on
// the bus (LIM-P30 L21). Inverse-variance effects are not the GLMM, so none is invented here.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("no continue bar without a studies push", () => {
  const bar = /attachContinueBar\s*\(/.test(html);
  const push = /getStudies\s*:/.test(html) && /ma-studies-v1\.js/.test(html);
  assert.ok(!bar || push, "a Continue-with bar is attached but the page pushes no studies");
});
