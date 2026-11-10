// Wrapper-compatible replay of the unchanged extraction tests. The historical
// serializer is reconstructed in TEMP because this job has no baseline tree.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const suite = 'hub/shared/tests/unit/p04-extraction-precision.test.mjs';
const paths = [suite, 'nma/index.html', 'shared/ma-comparisons-v1.js', 'shared/nma-multiarm-v1.js'];
const originals = new Map(paths.map(path => [path, readFileSync(new URL(path, root))]));
const html = originals.get('nma/index.html').toString('utf8');
const current = 'String(r.te), String(r.se)';
const historical = 'Number(r.te).toFixed(6), Number(r.se).toFixed(6)';
assert.equal(html.split(current).length - 1, 1, 'Exactly one extraction serialization site must be reconstructed');
const oldHtml = html.replace(current, historical);
assert.equal(oldHtml.replace(historical, current), html, 'Only the two numeric conversions may differ');

const controls = [
  'P04-R4 control: full-precision engine retains tiny MD and inverse-variance SE',
  'P04-R4 control: exactly representable MD, zero effects and treatment direction survive import',
  'P04-R4 control: missing, empty and unavailable extraction buses return null',
];
const plants = [
  'P04-R4 plant: extraction preserves tiny signed effects exactly',
  'P04-R4 plant: extraction preserves contrast standard errors exactly',
  'P04-R4 plant: imported pooled d equals the full-precision fit',
  'P04-R4 plant: imported pooled se equals the full-precision fit',
  'P04-R4 plant: small positive SE survives import without a zero-SE refusal',
  'P04-R4 plant: ordinary OR multi-arm contrasts round-trip without losing digits',
];

const artifactRoot = mkdtempSync(join(tmpdir(), 'p04-extraction-evidence-'));
console.log('P04_EXTRACTION_EVIDENCE_LOGS', artifactRoot);
console.log('P04_EXTRACTION_RECONSTRUCTION', JSON.stringify({ current, historical, node: process.version }));
const results = [];
for (const variant of ['historical', 'current']) {
  const work = join(artifactRoot, variant);
  for (const [path, bytes] of originals) {
    const target = join(work, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    assert.deepEqual(readFileSync(target), bytes, `Unchanged copy: ${path}`);
  }
  // Pin the dependency-free UMD engine's module mode independently of TEMP's ancestors.
  writeFileSync(join(work, 'package.json'), '{"type":"commonjs"}\n');
  if (variant === 'historical') writeFileSync(join(work, 'nma/index.html'), oldHtml);
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
    cwd: work, encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  assert.equal(run.signal, null, `${variant}: unexpected signal`);
  writeFileSync(join(artifactRoot, `${variant}.tap`), run.stdout);
  writeFileSync(join(artifactRoot, `${variant}.stderr.txt`), run.stderr);
  console.log(`P04_EXTRACTION_${variant.toUpperCase()}_TAP\n${run.stdout}`);
  if (run.stderr) console.error(run.stderr);
  const cases = [...run.stdout.matchAll(/^(ok|not ok) \d+ - (.+)\r?$/gm)]
    .map(([, status, name]) => ({ name: name.trim(), passed: status === 'ok' }));
  assert.deepEqual(cases.map(c => c.name).sort(), [...controls, ...plants].sort(),
    `${variant}: all nine unchanged tests must execute without skips`);
  assert.equal(run.status, variant === 'historical' ? 1 : 0, `${variant}: exit status`);
  for (const c of cases) {
    assert.equal(c.passed, variant === 'current' || controls.includes(c.name), `${variant}: ${c.name}`);
  }
  results.push({ variant, exit: run.status, cases });
}
// Guard against accidental writes to the supplied PR tree.
for (const [path, bytes] of originals) assert.deepEqual(readFileSync(new URL(path, root)), bytes, path);
writeFileSync(join(artifactRoot, 'summary.json'), JSON.stringify(results, null, 2));
console.log('P04_EXTRACTION_EVIDENCE', JSON.stringify(results));
