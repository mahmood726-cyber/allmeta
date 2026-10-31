// Compact wrapper output, with complete TAP diagnostics kept in the OS temp directory.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

function runSuite(cwd, files, label, { diagnostics = true } = {}) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 600000
  });
  const output = (result.stdout || '') + (result.stderr || '');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allmeta-p16-r4-log-'));
  const log = path.join(dir, label + '.tap');
  fs.writeFileSync(log, output);
  console.log('\n' + label + ': Node ' + process.version + '; exit=' + result.status + '; full log ' + log);
  const outcomes = [...output.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)].map(m => ({ pass: m[1] === 'ok', name: m[2] }));
  for (const t of outcomes) console.log((t.pass ? 'PASS ' : 'FAIL ') + t.name);
  for (const line of output.split(/\r?\n/)) {
    if (/^# (tests|pass|fail|cancelled|skipped|todo|plus replay|tampered|Full-page|Main replay|original PR head|current page|reconstructed pre-guard|Original\/current)/.test(line)) console.log(line);
  }
  if (result.status !== 0 && diagnostics) {
    // Include assertion values and source locations, not just the YAML keys.
    for (const match of output.matchAll(/^not ok[^\n]*\n(?:(?!^(?:# Subtest:|(?:not )?ok \d+ -)).*\n)*/gm)) {
      console.log(match[0].split(/\r?\n/).slice(0, 32).map(line => line.slice(0, 300)).join('\n'));
    }
  }
  assert.ifError(result.error);
  assert.ok(outcomes.length, 'test process must report individual outcomes');
  for (const field of ['cancelled', 'skipped', 'todo']) assert.match(output, new RegExp('^# ' + field + ' 0$', 'm'));
  return { result, outcomes };
}
module.exports = { runSuite };
