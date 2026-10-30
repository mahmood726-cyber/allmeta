import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  throw new Error('Native Rscript with metafor is required');
}
const executable = rscript();

export function runR(script) {
  const dir = mkdtempSync(join(tmpdir(), 'p11-r4-review-'));
  const path = join(dir, 'analysis.R');
  writeFileSync(path, script);
  const run = spawnSync(executable, ['--vanilla', path], {
    cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 4*1024*1024
  });
  const output = (run.stdout || '') + (run.stderr || '');
  writeFileSync(join(dir, 'output.txt'), output);
  assert.equal(run.error, undefined, String(run.error));
  return { status: run.status, output, dir };
}

// Only evaluate the data and fitter definitions; diagnostic/plot output is
// exercised separately by the existing end-to-end export assertions.
export function definitions(script) {
  const marker = 'res <- fit(dat$yi, dat$vi, dat$study)\n';
  assert.equal(script.split(marker).length, 2, 'export fitter marker');
  return script.slice(0, script.indexOf(marker));
}
