// Run the unchanged original P13 regression suite with a physical-line guard
// planted in memory. This is a defect mutation, not an unavailable historical tree.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {fileURLToPath} = require('node:url');
if (require.main !== module) {
  const read = fs.readFileSync, target = path.resolve(__dirname, '../plus.js');
  fs.readFileSync = function(file, ...args) {
    const result = read.call(this, file, ...args);
    const name = file instanceof URL ? fileURLToPath(file) : file;
    if (typeof name !== 'string' || path.resolve(name) !== target) return result;
    const source = String(result);
    const anchor = '    // Use the main analysis\'s parsed studies and validation result, including headers and blank lines.';
    assert.equal(source.split(anchor).length, 2, 'physical-line mutation anchor');
    const guard = `    const physical=input.trim().split(/\\n/).map(l=>l.split(','));
    if(physical.length<3||physical.length>100||physical.some(r=>!Number.isFinite(Number(r[0]))||!Number.isFinite(Number(r[1]))||Number(r[1])<=0))throw Error('Need 3 through 100 valid effect rows');
`;
    const mutated = source.replace(anchor, guard + anchor);
    return Buffer.isBuffer(result) ? Buffer.from(mutated) : mutated;
  };
  require('node:module').syncBuiltinESMExports();
} else {
  const {spawnSync} = require('node:child_process');
  const result = spawnSync(process.execPath, ['--require', __filename, '--test', '--test-reporter=tap',
    'hub/shared/tests/unit/p13-gosh-plus-input.test.mjs'], {
    cwd: path.join(__dirname, '../..'), encoding: 'utf8', windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.stderr) process.stderr.write(result.stderr);
  const outcomes = result.stdout.split(/\r?\n/).filter(l => /^(?:not ok |ok |# (?:tests|pass|fail) )/.test(l));
  console.log(outcomes.join('\n'));
  assert.equal(result.status, 1, 'planted defect must fail the unmodified suite');
  assert.match(result.stdout, /^# tests 15$/m);
  assert.match(result.stdout, /^# pass 5$/m);
  assert.match(result.stdout, /^# fail 10$/m);
  const failed = outcomes.filter(l => l.startsWith('not ok '));
  assert.equal(failed.length, 10);
  for (const line of failed) assert.match(line, /P13-R4 (FE|DL): (extras accept |extras preserve canonical default labels|the 100-study limit)/);
  console.log('Expected mutation detected: 10 formatting/count regressions FAIL; 5 controls PASS.');
}
