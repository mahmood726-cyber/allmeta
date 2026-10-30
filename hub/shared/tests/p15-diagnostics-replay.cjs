// Reconstruct the exact supplied PR-head parser by removing only this follow-up
// diagnostic wrapper. The LF hash was recorded before the production edit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const beforeHash = 'fb2bd7fba8cdea81bdd10f2f8a0903e4308b354c880bd0109e7ad0e21e8a24b3';

function restorePreFix(source) {
  source = source.replace(/\r\n/g, '\n');
  const begin = '    // Diagnose short leading lines without allowing them to hide a malformed\n';
  const end = '  function parseStudyTable(data) {\n';
  assert.equal(source.split(begin).length, 2, 'one diagnostic wrapper');
  assert.equal(source.split(end).length, 2, 'one extracted table parser');
  const restored = source.slice(0, source.indexOf(begin)) + source.slice(source.indexOf(end) + end.length);
  assert.equal(createHash('sha256').update(restored).digest('hex'), beforeHash,
    'replay must restore the exact pre-fix source (LF bytes)');
  return restored;
}

module.exports = { restorePreFix };
if (require.main === module) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p15-diagnostics-replay-'));
  try {
    const relative = 'hub/shared/tests/unit/p15-parser-diagnostics.test.mjs';
    for (const file of [relative, 'shared/rve-extras.js']) {
      const destination = path.join(temp, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, file), destination);
    }
    const extras = path.join(temp, 'shared/rve-extras.js');
    fs.writeFileSync(extras, restorePreFix(fs.readFileSync(extras, 'utf8')));
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', relative], {
      cwd: temp, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
    });
    const outcomes = [...(result.stdout || '').matchAll(/^(not ok|ok) \d+ - (P15-R2 (plant|control): .+)$/gm)];
    try {
      if (result.error) throw result.error;
      assert.equal(result.signal, null);
      assert.equal(result.status, 1, 'the pre-fix parser must fail the new suite');
      assert.equal(outcomes.length, 18, 'every diagnostic test must run');
      assert.equal(outcomes.filter(([, , , kind]) => kind === 'plant').length, 11);
      assert.equal(outcomes.filter(([, , , kind]) => kind === 'control').length, 7);
      for (const [line, status, name, kind] of outcomes) {
        console.log(line);
        assert.equal(status, kind === 'plant' ? 'not ok' : 'ok', name);
      }
      console.log('Replay verified: all 11 diagnostic plants FAIL; all 7 controls PASS.');
    } catch (error) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      throw error;
    }
  } finally {
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('p15-diagnostics-replay-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
