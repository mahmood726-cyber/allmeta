// Re-run the unchanged regression suite with a labelled source mutation.
// This reproduces the reported eager-CR2 defect; it is not a historical checkout.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceRoot = new URL('../../../../', import.meta.url);
const suite = 'hub/shared/tests/unit/p07-round2-extras.test.mjs';
const engine = 'multilevel-ma/plus-engine.js';
const temporaryRoot = mkdtempSync(join(tmpdir(), 'p07-cr2-defect-'));

function run(label) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
    cwd: temporaryRoot, encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024
  });
  console.log(`P07 CR2 replay: ${label}`);
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'The regression suite must finish normally');
  const cases = [...result.stdout.matchAll(/^(not )?ok \d+ - (P07-R2 (plant|control):.+)$/gm)]
    .map(([, failed, name, kind]) => ({ name, kind, passed: !failed }));
  assert.equal(cases.length, 10, 'All ten unchanged regression tests must run');
  assert.equal(cases.filter(t => t.kind === 'plant').length, 4);
  assert.equal(cases.filter(t => t.kind === 'control').length, 6);
  return { status: result.status, cases };
}

try {
  for (const file of [suite, engine, 'multilevel-ma/plus-ui.js',
    ...['p07-extras-input.json', 'p07-extras-reference.R', 'p07-extras-reference.json']
      .map(name => 'hub/shared/tests/unit/' + name)]) {
    const target = join(temporaryRoot, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(new URL(file, sourceRoot), target);
  }
  const current = run('submitted sources, including exact fixture bytes');
  assert.equal(current.status, 0);
  assert.ok(current.cases.every(t => t.passed));

  const source = readFileSync(join(temporaryRoot, engine), 'utf8').replaceAll('\r\n', '\n');
  const guarded = [
    '    let robust;',
    '    try {robust=cr2(g,f.b,f.w);}',
    '    catch(e){',
    "      if(!e.message.startsWith('CR2 unavailable:'))throw e;",
    "      robust={status:'unavailable',reason:e.message};",
    '    }'
  ].join('\n');
  assert.equal(source.split(guarded).length, 2, 'Mutate exactly the declared-unavailability catch');
  writeFileSync(join(temporaryRoot, engine), source.replace(guarded, '    const robust=cr2(g,f.b,f.w);'));

  const mutant = run('ONLY the eager-CR2 defect reintroduced in the temporary engine');
  assert.equal(mutant.status, 1);
  assert.deepEqual(mutant.cases.map(t => t.name), current.cases.map(t => t.name));
  for (const outcome of mutant.cases) {
    assert.equal(outcome.passed, outcome.kind === 'control', outcome.name);
  }
  console.log('P07 CR2 replay verified: current 10/10; mutant four plants FAIL, six controls PASS.');
} finally {
  // The only removal target is the directory returned by mkdtempSync above.
  rmSync(temporaryRoot, { recursive: true, force: true });
}
