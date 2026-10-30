// Re-run the unchanged regression assertions against the exact pre-fix page.
// Reconstruct only this job's edit, verify the full page hash, and run in TEMP.
// This recovers the baseline results truncated from pass-1 FEEDBACK.md.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../../', import.meta.url);
const page = 'multilevel-ma/index.html';
const originalAxis = `      // Apply axis range override if set
      var xMin = null, xMax = null;
      if (_axisState && Array.isArray(_axisState.x)) {
        if (_axisState.x[0] !== null) xMin = _axisState.x[0];
        if (_axisState.x[1] !== null) xMax = _axisState.x[1];
      }

      var lo = xMin !== null ? xMin : Math.min(0, Math.min.apply(null, allLo), f.mu - Z975 * f.seMu);
      var hi = xMax !== null ? xMax : Math.max(0, Math.max.apply(null, allHi), f.mu + Z975 * f.seMu);
      var pad = (hi - lo) * 0.1 || 0.3;
      var loP = xMin !== null ? lo : lo - pad;
      var hiP = xMax !== null ? hi : hi + pad;
      var X = function (v) { return padL + (v - loP) / (hiP - loP) * plotW; };

      svgParts.push('<line x1="' + X(0) + '" y1="15" x2="' + X(0) + '" y2="' + (H - 25) + '" stroke="currentColor" stroke-dasharray="3 3" opacity="0.4"/>');

`;
const current = readFileSync(new URL(page, root), 'utf8').replace(/\r\n/g, '\n');
const start = current.indexOf('      // Apply axis range override if set\n');
const end = current.indexOf('      // V11-E03', start);
assert.ok(start >= 0 && end > start);
const original = (current.slice(0, start) + originalAxis + current.slice(end))
  .replace('      <p id="forest-axis-error" role="status" aria-live="polite" hidden></p>\n', '');
const hash = createHash('sha256').update(original).digest('hex');
assert.equal(hash, '69865669974dd0f6ec9ab6525b74e4ab2793e9005a65c4734a71249aba16e716',
  'Reconstructed page must match the complete original page (LF-normalized SHA-256)');
console.log(`Original page SHA-256 (LF): ${hash}`);

const scratch = mkdtempSync(join(tmpdir(), 'p07-forest-before-'));
const regression = 'hub/shared/tests/unit/p07-forest-log-axis.test.mjs';
for (const file of [regression, 'shared/stats-qt.js', 'shared/ma-core.js',
  'shared/multilevel-reml.js', 'hub/shared/axis-controls.js']) {
  const dest = join(scratch, file);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(new URL(file, root), dest);
}
mkdirSync(join(scratch, 'multilevel-ma'));
writeFileSync(join(scratch, page), original);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', regression], {
  cwd: scratch, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 120000,
});
assert.ifError(result.error);
writeFileSync(join(scratch, 'baseline-output.txt'), result.stdout + result.stderr);
const outcomes = [...result.stdout.matchAll(/^(not ok|ok) \d+ - (P07-R5 .+)$/gm)];
for (const [, status, name] of outcomes) console.log(`${status === 'ok' ? 'PASS' : 'FAIL'} ${name}`);
for (const line of result.stdout.split('\n')) {
  if (/^# (tests|pass|fail|cancelled|skipped|todo) /.test(line)) console.log(line);
}
const spacing = result.stdout.match(/equal ratios must have equal log-axis gaps: [^\r\n']+/);
if (spacing) console.log(spacing[0]);
console.log(`Full baseline output: ${join(scratch, 'baseline-output.txt')}`);
assert.equal(result.status, 1, 'Original page must fail the planted regressions');
assert.equal(outcomes.length, 17, 'All original regression tests must run');
assert.equal(outcomes.filter(([, , name]) => name.includes(' control:')).length, 2);
for (const [, status, name] of outcomes) {
  assert.equal(status, name.includes(' control:') ? 'ok' : 'not ok', name);
}
console.log('Baseline confirmed: 15 planted failures, 2 passing controls.');
