/* Helper for cumulative-subgroup-rexport-parity.spec.mjs: locate Rscript and run an
 * R script file, mirroring hub/shared/tests/_r_parity.py (explicit RSCRIPT override,
 * then PATH, then the standard Windows install; SKIP when R or a package is absent,
 * FAIL on any other R error). Not a spec (no .spec.mjs suffix), so Playwright does
 * not collect it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function findRscript() {
  const env = process.env.RSCRIPT;
  if (env && existsSync(env)) return env;
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['Rscript'], { encoding: 'utf8' });
  if (probe.status === 0) {
    const first = (probe.stdout || '').split(/\r?\n/).find(Boolean);
    if (first && existsSync(first.trim())) return first.trim();
  }
  for (const base of ['C:\\Program Files\\R', 'C:\\Program Files\\Microsoft\\R Open']) {
    if (!existsSync(base)) continue;
    const vers = readdirSync(base).filter(d => /^R-/.test(d)).sort().reverse();
    for (const v of vers) {
      const p = join(base, v, 'bin', 'Rscript.exe');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// Preamble prepended to every exported script before execution. It only changes the
// library search order (R_LIBS_USER first) and print precision; it never touches the
// app's own R code.
const PREAMBLE = [
  'local({ lp <- Sys.getenv("R_LIBS_USER"); if (nzchar(lp)) .libPaths(c(strsplit(lp, .Platform$path.sep)[[1]], .libPaths())) })',
  'options(digits = 15)',
  '',
].join('\n');

/** Run `script` (text) with Rscript --vanilla. Returns { skip } or { status, stdout, stderr }. */
export function runR(script, path, epilogue = '') {
  const rscript = findRscript();
  if (!rscript) return { skip: 'Rscript not available' };
  writeFileSync(path, PREAMBLE + script + '\n' + epilogue + '\n', 'utf8');
  const proc = spawnSync(rscript, ['--vanilla', path], { encoding: 'utf8', timeout: 60_000, env: process.env });
  const stderr = proc.stderr || '';
  const missing = stderr.match(/there is no package called[^\n]*/);
  if (proc.status !== 0 && missing) return { skip: 'R package missing on this host: ' + missing[0] };
  return { status: proc.status, stdout: proc.stdout || '', stderr };
}
