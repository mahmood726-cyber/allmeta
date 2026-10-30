// 2026-10-30 P16: prove the native-R parity gate rejects a tampered value and an empty display comparison.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const path = join(tmpdir(), 'p16-r3-live-plant-FE.json');
const original = readFileSync(path, 'utf8');
const base = JSON.parse(original);
assert.ok(Array.isArray(base.values) && base.values.length > 7,
  'Run the real P16 DOM snapshot generator first; refusing an empty fixture');
const marker = 'P16_LIVE_R plant-FE ';
function runNativeR() {
  const run = spawnSync('Rscript', ['--vanilla', 'unit/p16-live-replay.R'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(run.error);
  const line = run.stdout.split(/\r?\n/).find(s => s.startsWith(marker));
  assert.ok(line, `native-R comparator produced no plant-FE result: ${run.stderr}`);
  return { status: run.status, report: JSON.parse(line.slice(marker.length)) };
}
function expectRefusal(name, mutate, check) {
  const data = JSON.parse(original);
  mutate(data);
  try {
    writeFileSync(path, JSON.stringify(data));
    const out = runNativeR();
    assert.notEqual(out.status, 0, `${name}: native-R comparator falsely passed`);
    assert.equal(out.report.ok, false, `${name}: native-R reported success`);
    check(out.report);
    console.log(`P16_R_MUTATION_REFUSED ${name}`);
  } finally {
    writeFileSync(path, original);
  }
}
try {
  const numerical = base.values.find(v => !v.key.startsWith('display.') &&
    typeof v.value === 'number' && Number.isFinite(v.value));
  assert.ok(numerical, 'no finite numerical quantity available for parity mutation');
  expectRefusal('numeric-value', data => {
    const item = data.values.find(v => v.key === numerical.key);
    item.value += 1000 * (1 + Math.abs(item.value));
    assert.ok(Number.isFinite(item.value), 'numeric mutation overflowed');
  }, report => assert.ok(report.failures?.some(s => s.startsWith(numerical.key + ' ')),
    `numerical mutant was not identified at ${numerical.key}: ${JSON.stringify(report)}`));
  expectRefusal('empty-display', data => {
    data.values = data.values.filter(v => !v.key.startsWith('display.'));
  }, report => assert.match(report.error || '', /Insufficient native-R comparison coverage/));
  const restored = runNativeR();
  assert.equal(restored.status, 0, 'restored original input did not pass native R');
  assert.equal(restored.report.ok, true, 'restored original input parity failed');
  console.log('P16_R_MUTATION_RESTORED positive-original');
} finally {
  writeFileSync(path, original);
}
