import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const runner = new URL('p16-native-r-refusal.mjs', import.meta.url);
const source = readFileSync(runner, 'utf8');

// Execute the production runner until its first native-R invocation. The probe
// deliberately supplies no R output: it tests executable dispatch, not parity.
function firstCommand(code, args, expectedTail = []) {
  const original = JSON.stringify({ values: Array.from({ length: 8 }, (_, i) =>
    ({ key: 'quantity.' + i, value: i })) });
  let command, restored;
  const stopped = new Error('command captured; native R deliberately not executed');
  const context = {
    assert, tmpdir, join, fileURLToPath, URL,
    process: { argv: ['node', fileURLToPath(runner), ...args], cwd: () => fileURLToPath(new URL('../../../../', runner)) },
    readFileSync: () => original,
    writeFileSync: (_path, text) => { restored = text; },
    spawnSync: (file, argv, options) => {
      command = { file, argv: Array.from(argv), options };
      throw stopped;
    },
  };
  const executable = code.replace(/^import .*;\r?\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(runner.href));
  assert.throws(() => vm.runInNewContext(executable, context), error => error === stopped);
  assert.equal(restored, original, 'a launch error must restore the original snapshot');
  assert.ok(command, 'the real refusal runner must reach native R');
  assert.deepEqual(command.argv, ['--vanilla', fileURLToPath(new URL('p16-live-replay.R', runner)), ...expectedTail]);
  assert.ok(!command.options.shell, 'an executable path must not be interpreted by a shell');
  assert.equal(command.options.timeout, 120000, 'case partitioning must not relax the child deadline');
  return command.file;
}

test('P16 R launcher control: CI retains its Rscript executable lookup', () => {
  assert.equal(firstCommand(source, []), 'Rscript');
});

test('P16 R launcher plant: an explicit R executable bypasses the missing PATH entry', () => {
  const executable = 'C:/R installations/R 4.6 & oracle/bin/Rscript.exe';
  assert.equal(firstCommand(source, [executable]), executable);
});

test('P16 R launcher plant: the same assertion rejects the historical hardcoded command', () => {
  assert.ok(source.includes('spawnSync(rscript,'), 'historical plant anchor must exist');
  const historical = source.replace('spawnSync(rscript,', "spawnSync('Rscript',");
  const executable = 'C:/R installations/R 4.6 & oracle/bin/Rscript.exe';
  assert.equal(firstCommand(historical, []), 'Rscript', 'historical CI control still works');
  assert.throws(() => assert.equal(firstCommand(historical, [executable]), executable),
    { code: 'ERR_ASSERTION' });
});

test('P16 R scope plant: mutation invocation selects its single affected FE case', () => {
  assert.equal(firstCommand(source, ['Rscript', 'plant-FE'], ['plant-FE']), 'Rscript');
});

test('P16 R scope plant: the same assertion rejects the repeated six-case invocation', () => {
  const anchor = 'if (process.argv[3]) nativeArgs.push(process.argv[3]);';
  assert.ok(source.includes(anchor), 'six-case invocation plant anchor must exist');
  const historical = source.replace(anchor, '');
  assert.equal(firstCommand(historical, []), 'Rscript', 'unscoped six-case control is preserved');
  assert.throws(() => firstCommand(historical, ['Rscript', 'plant-FE'], ['plant-FE']),
    { code: 'ERR_ASSERTION' });
});
