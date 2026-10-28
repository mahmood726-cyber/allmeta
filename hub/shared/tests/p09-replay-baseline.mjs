// Replay the unchanged regression tests against the pre-fix application.
// Pass-1 feedback was truncated; keep this replay's console output compact.
// Only temporary copies are changed, and their normalized HTML hash must match
// the original source recorded before the P09-R2 fix.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
let html = readFileSync(new URL('proportion-ma/index.html', root), 'utf8').replace(/\r\n/g, '\n');
function replaceBlock(start, end, original) {
  const first = html.indexOf(start);
  const last = html.indexOf(end, first);
  assert.ok(first >= 0 && last > first, 'Find changed source block');
  html = html.slice(0, first) + original + html.slice(last);
}

replaceBlock('    function parseTable(text) {', '    // --- inverse beta', String.raw`    function parseTable(text) {
      return text.trim().split(/\n/).map(function (l, i) {
        var parts = l.split(/,/).map(function (s) { return s.trim(); });
        var x = parseInt(parts[0], 10);
        var n = parseInt(parts[1], 10);
        if (!Number.isFinite(x) || !Number.isFinite(n) || n <= 0 || x < 0 || x > n) return null;
        return { x: x, n: n, label: parts[2] || ('Study ' + (i + 1)) };
      }).filter(Boolean);
    }

`);
replaceBlock('      var parsed = parseTable(text);', '      if (kw) {\n        if (tauEst', `      var rows = parseTable(text);

      // DL k<10 warning
      var kw = document.getElementById('k-warn');
`);
replaceBlock('      run: function () { run({suppressURL:true}); },', '      save: function ()', `      run: function () { run({suppressURL:true}); }, parse: parseTable,
`);
replaceBlock("      var parsed = parseTable(document.getElementById('src').value);", '      var out = [];', `      var rows = parseTable(document.getElementById('src').value);
      if (rows.length < 2) return [];
`);
assert.equal(createHash('sha256').update(html).digest('hex'),
  '56b762ffc1e881e2bf2534bc9eb21b2f3d3b0354820f67a6061679779556a901',
  'Replay must use the exact pre-fix HTML (normalized line endings only)');

const stage = mkdtempSync(join(tmpdir(), 'p09-original-'));
const testPath = 'hub/shared/tests/unit/p09-invalid-rows.test.mjs';
for (const file of [testPath, 'shared/ma-core.js', 'hub/shared/analysis-lifecycle.js',
  'proportion-ma/validate/corpus/corpus.json', 'proportion-ma/validate/corpus/reference.json']) {
  const destination = join(stage, file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(new URL(file, root), destination);
}
writeFileSync(join(stage, 'proportion-ma/index.html'), html);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testPath],
  { cwd: stage, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (result.error) throw result.error;
writeFileSync(join(stage, 'baseline.tap'), result.stdout + result.stderr);
console.log('Original application SHA256 verified; unchanged tests; baseline exit=' + result.status);
for (const line of result.stdout.split(/\r?\n/)) {
  if (/^(?:not ok |ok |# (?:tests|pass|fail|skipped|cancelled) )/.test(line)) console.log(line);
}
if (result.stderr) console.error(result.stderr);
console.log('Full baseline output: ' + join(stage, 'baseline.tap'));
process.exitCode = result.status ?? 1;
