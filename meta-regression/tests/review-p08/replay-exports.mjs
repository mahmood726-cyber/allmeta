// Actual exported R scripts and R outputs go only into the OS temporary directory.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadApp, studies } from './harness.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'p08-r-exports-'));
const fixture = JSON.parse(readFileSync(new URL('./reference-metafor.json', import.meta.url), 'utf8'));
let rscript = 'Rscript';
if (process.platform === 'win32' && existsSync('C:/Program Files/R')) {
  const candidates = readdirSync('C:/Program Files/R').sort().reverse()
    .map(name => join('C:/Program Files/R', name, 'bin/Rscript.exe')).filter(existsSync);
  assert.ok(candidates.length, 'Rscript installation is required');
  rscript = candidates[0];
}
const cases = fixture.cases.map(ref => ({ id: ref.id, scale: ref.id === 'scaled' ? 1e6 : 1,
  rows: ref.yi.map((est, i) => ({ label: `S${i + 1}`, est, se: Math.sqrt(ref.vi[i]), v: ref.vi[i], x: ref.x[i] })) }));
cases.push({ id: 'tiny', scale: 1e-15, rows: studies(1e-15) });
for (const scale of [1e-3, 1e-4, 1e-8]) {
  cases.push({ id: `small-${scale}`, scale, rows: studies(scale) });
}
cases.push({ id: 'tiny-zero', scale: 1e-15,
  rows: studies(1e-15).map(s => ({ ...s, est: 2e-15 })) });
const unequal = cases.find(c => c.id === 'unequal-variances');
cases.push({ id: 'tiny-unequal', scale: 1e-15,
  rows: unequal.rows.map(s => ({ ...s, est: s.est * 1e-15, se: s.se * 1e-15, v: s.v * 1e-30 })) });
const dimension = key => key === 'tau2_pm' ? 2 :
  /^(intercept|slope)(_|$)/.test(key) || /^(pred|pred_se|pi_lo|pi_hi)$/.test(key) ? 1 : 0;
let failed = 0;
for (let i = 0; i < cases.length; i++) {
  const { id, scale, rows } = cases[i], app = loadApp();
  const script = app.rScript(rows, {}), path = join(dir, `${i}.R`), output = join(dir, `${i}.json`);
  writeFileSync(path, script);
  const run = spawnSync(rscript, ['--vanilla', resolve(root, 'meta-regression/tests/review-p08/check-export.R'), path, output],
    { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (run.error || run.status !== 0) {
    console.error(`${id}: R runner failed: ${run.error?.message || run.stderr}`);
    failed++;
    continue;
  }
  const ref = JSON.parse(readFileSync(output, 'utf8'));
  // ASCII escapes prevent Windows console decoding from corrupting the exact
  // exported script when the wrapper preserves this record in FEEDBACK.md.
  console.log(JSON.stringify({ id, scale, rows, script, ...ref }).replace(/[^\x00-\x7f]/g,
    c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));
  if (ref.status !== 'ok') { failed++; continue; }
  const actual = app.renderRows(rows), pi = app.window._almLastPI();
  Object.assign(actual, { pred: pi.pred, pred_se: pi.se, pi_lo: pi.lo, pi_hi: pi.hi });
  // Preserve the existing exported-R test's closed/iterative tolerances.
  // Normalize outcome units first so tiny values cannot pass an absolute floor.
  const tolerance = ref.expected.tau2_pm === 0 ? 1e-9 : 1e-6;
  const bad = [];
  for (const [key, value] of Object.entries(ref.expected)) {
    const unit = scale ** dimension(key), a = actual[key] / unit, b = value / unit;
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > tolerance * Math.max(1, Math.abs(b))) {
      bad.push(`${key}: page=${a}, R=${b} (normalized, tolerance=${tolerance})`);
    }
  }
  if (bad.length) { console.error(`FAIL ${id}: ${bad.join('; ')}`); failed++; }
  else console.log(`PASS ${id}: all ${Object.keys(ref.expected).length} full-precision export fields`);
}
console.log(`R exports: ${cases.length - failed}/${cases.length} passed; files: ${dir}`);
process.exitCode = failed ? 1 : 0;
