import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cases, stateFor, build, read } from './p11-r4-cases.mjs';

// Native R is required, not silently skipped. Prefer PATH; also support the
// standard Windows installation used by this job's command runner.
function rscript() {
  const probe = spawnSync('Rscript', ['--version'], { encoding: 'utf8', windowsHide: true });
  if (!probe.error && probe.status === 0) return 'Rscript';
  const directory = 'C:/Program Files/R';
  if (process.platform === 'win32' && existsSync(directory)) {
    for (const name of readdirSync(directory).sort().reverse()) {
      const exe = join(directory, name, 'bin', 'Rscript.exe');
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error('Native Rscript with metafor is required for the Influence export regression');
}
const executable = rscript();
const reference = () => JSON.parse(readFileSync(new URL('./p11-r4-reference.json', import.meta.url), 'utf8'));
const near = (a, b, label) => assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)/Math.max(1,Math.abs(b)) <= 1e-6, `${label}: ${a} versus ${b}`);

test('P11-R4 control: native R reference records the oracle and package versions', () => {
  const ref = reference();
  for (const key of ['R', 'metafor', 'jsonlite']) assert.ok(ref.provenance[key]);
  assert.equal(ref.provenance.oracle_md5, createHash('md5').update(read('tests/reml_reference.R')).digest('hex'));
  assert.deepEqual(ref.cases.map(c => c.id), cases.map(c => c.id));
  for (const [i, c] of cases.entries()) {
    assert.deepEqual(ref.cases[i].yi, c.yi);
    assert.deepEqual(ref.cases[i].vi, c.vi.map(v => Math.sqrt(v)**2));
  }
});

for (const c of cases) {
  const kind = c.plant ? 'plant' : 'control';
  test(`P11-R4 ${kind}: ${c.id} generated R reproduces every app value`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'p11-r4-'));
    const script = join(dir, 'analysis.R');
    writeFileSync(script, build(stateFor(c)));
    const run = spawnSync(executable, ['--vanilla', script], {
      cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 4*1024*1024
    });
    writeFileSync(join(dir, 'output.txt'), (run.stdout || '') + (run.stderr || ''));
    assert.equal(run.error, undefined, String(run.error));
    assert.equal(run.status, 0, `${c.id}\n${run.stdout}\n${run.stderr}`);
    const n = 12 + 19*c.yi.length + (c.excluded.length ? 12 : 0);
    assert.ok(run.stdout.includes(`ALL ${n}/${n} app values reproduced`), run.stdout);
  });
  test(`P11-R4 control: ${c.id} app modes match the independent R reference`, () => {
    const ref = reference().cases.find(r => r.id === c.id), state = stateFor(c);
    near(state.full.tau2, ref.full.tau2, c.id + ' full');
    state.diag.forEach((d, i) => near(d.loo_tau2, ref.deletion_tau2[i], `${c.id} deletion ${i}`));
    if (state.kept) near(state.kept.tau2, ref.excluded_tau2, c.id + ' excluded');
  });
}

test('P11-R4 control: shallow interior wins but the neighboring boundary case stays zero', () => {
  const ref = reference().cases;
  const interior = ref.find(c => c.id === 'shallow-interior-beats-boundary').full;
  const boundary = ref.find(c => c.id === 'boundary-beats-interior').full;
  assert.ok(interior.tau2 > 0);
  assert.ok(interior.logLik > interior.boundaryLogLik);
  assert.equal(boundary.tau2, 0);
});
