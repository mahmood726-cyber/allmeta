// rare-events-glmm: page-level accessibility requirements (LIM-P30 L23, the parts in this page).
//   node --test rare-events-glmm/tests/a11y.test.cjs
// The fit summary and refusals are announced (live region); the model select is named
// "Model" (was "F model"); generated hero/citation controls are not nested inside the
// Studies <label>. The citation dialog's focus handling lives in shared/citation.js, which
// is in emailed_deps.txt and is not changed here.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
test("live summary, model name, no controls inside the Studies label", () => {
  assert.match(html, /<div id="summary"[^>]*aria-live="polite"/);
  assert.match(html, /<select id="f-model"[^>]*aria-label="Model"/);
  const label = html.slice(html.indexOf('<textarea id="src"'), html.indexOf("</label>", html.indexOf('<textarea id="src"')));
  assert.doesNotMatch(label, /alm-hero-mount|alm-cite-mount/);
});
