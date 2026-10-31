// Run the same adapter checks as the feature browser spec without Playwright.
// Useful in restricted environments; this does not replace the browser/R gate.
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const specUrl = pathToFileURL(path.resolve(__dirname, '../../hub/shared/tests/features-mh-peto.spec.mjs')).href;
const source = fs.readFileSync(fileURLToPath(specUrl), 'utf8');
const start = source.indexOf('const reviewRegressions = ');
const end = source.indexOf("const APP = 'mh-peto'", start);
assert.ok(start >= 0 && end > start, 'Feature spec regression block must exist');
const context = { createRequire, fileURLToPath, URL, specUrl, process: { argv: process.argv } };
vm.runInNewContext(source.slice(start, end).replaceAll('import.meta.url', 'specUrl') +
  '\nglobalThis.cases = reviewRegressions.cases;', context);
const cases = Object.entries(context.cases);
assert.ok(cases.length > 0, 'No adapter regressions found');
for (const [name, check] of cases) test(name, check);
