// Reproduce every P12-R1 baseline outcome without changing the working tree.
// Full assertion output and the temporary baseline tree stay in the OS temp folder.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const baseline = mkdtempSync(join(tmpdir(), 'limit-ma-p12-baseline-'));
const testFile = 'hub/shared/tests/unit/limit-ma-review.test.mjs';
const changes = {
  'limit-ma/index.html': {
    sha256: '5d5f1a705d5228014f684dd77eb98a950ed582a8175321835a8bed90792866d3',
    lines: ['      if (!_validationRun && window.AlmLimitPlusUI) window.AlmLimitPlusUI.clear();'],
  },
  'limit-ma/plus-ui.js': {
    sha256: '7576d7b450257e1d37d908265bc7150c1f39d756551ba4803dcf78217ad14f26',
    lines: ["el('src').addEventListener('input',()=>clear());", "el('src').addEventListener('change',()=>clear());"],
  },
};
const hash = source => createHash('sha256').update(source).digest('hex');
for (const file of [testFile, ...Object.keys(changes), 'hub/shared/analysis-lifecycle.js',
  'shared/ma-core.js', 'shared/trimfill.js', 'shared/selmodel.js',
  'limit-ma/plus-opt.js', 'limit-ma/plus-selmodel.js', 'limit-ma/plus.js']) {
  let source = readFileSync(new URL(file, root), 'utf8');
  if (changes[file]) {
    for (const line of changes[file].lines) {
      assert.equal(source.split(line).length, 2, 'Exactly one fix line: ' + file);
      source = source.replace(line + '\r\n', '');
    }
    assert.equal(hash(source), changes[file].sha256, 'Exact pre-fix file bytes: ' + file);
  }
  if (file === testFile) assert.equal(hash(source),
    'af875ce1b9ba7d5075b3b32f07d021c690c505bc65a4ddfd3c1bf5d5d8cc37ec', 'Unchanged pass-1 test');
  const target = join(baseline, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
}
console.log('Baseline: exact pre-fix sources and unchanged tests; Node ' + process.version);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile],
  { cwd: baseline, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true });
const output = (result.stdout || '') + (result.stderr || '');
const log = join(baseline, 'baseline.tap');
writeFileSync(log, output);
console.log('Full baseline output: ' + log);
for (const line of output.split(/\r?\n/)) {
  if (/^(?:(?:not )?ok \d+ - |# (?:tests |pass |fail |duration_ms |\{))/.test(line)) console.log(line);
}
assert.ifError(result.error);
assert.equal(result.status, 1, 'Baseline test process must fail');
const outcomes = [...output.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)];
assert.equal(outcomes.length, 9, 'All nine baseline tests must run');
assert.deepEqual(outcomes.filter(m => m[1] === 'not ok').map(m => m[2]), [
  'P12-R1 plant: successful primary rerun clears completed sensitivity results',
  'P12-R1 plant: CSV load invalidates sensitivity through the primary runner',
  'P12-R1 plant: source input clears sensitivity before a primary rerun',
  'P12-R1 plant: source change clears sensitivity before a primary rerun',
]);
console.log('Confirmed: four planted-defect failures and five passing controls on pre-fix code.');
