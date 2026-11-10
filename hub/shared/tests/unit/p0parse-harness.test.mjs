import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const spec = fs.readFileSync(new URL('../features-p0parse.spec.mjs', import.meta.url), 'utf8');
const harnessURL = new URL('../fixtures/p0parse/parser.html', import.meta.url);
function checkHarness(source) {
 assert.match(source, /page\.goto\('\/hub\/shared\/tests\/fixtures\/p0parse\/parser\.html'\)/);
 assert.doesNotMatch(source, /page\.goto\('\/'\)|page\.setContent|page\.addScriptTag/);
}
test('parser browser setup uses an isolated served harness', () => {
 checkHarness(spec);
 const html = fs.readFileSync(harnessURL, 'utf8');
 assert.match(html, /id="mount"/);
 assert.deepEqual([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]), ['../../../csv-upload.js']);
 assert.doesNotMatch(html, /serviceWorker|prefetch|<script>/);
});
test('planted hub navigation is detected by harness isolation control', () => {
 checkHarness(spec);
 assert.throws(() => checkHarness(spec.replace('/hub/shared/tests/fixtures/p0parse/parser.html', '/')));
});

test('each browser case removes both stale exports before navigation', () => {
 const cleanup = spec.indexOf('fs.rmSync');
 assert.ok(cleanup >= 0 && cleanup < spec.indexOf('await page.goto'));
 assert.match(spec, /\[c\.id\+'\.csv',c\.id\+'-refused\.csv'\]/);
 assert.match(spec, /force:true/);
});
