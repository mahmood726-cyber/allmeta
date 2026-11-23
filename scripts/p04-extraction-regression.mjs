// Reproduce the old raw-serializer defect without editing the reviewed tree.
// No historical checkout is supplied: this is an explicitly reconstructed
// serializer, with the same unchanged tests, bus, parser and engine in both runs.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const disposable = mkdtempSync(join(tmpdir(), 'p04-extraction-regression-'));
const testPath = 'hub/shared/tests/unit/p04-extraction-labels.test.mjs';
const paths = [testPath, 'nma/index.html', 'shared/ma-comparisons-v1.js', 'shared/nma-multiarm-v1.js'];
// Provenance is over LF bytes, as in CI. No recorded hash is rewritten.
const sha256LF = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const sources = new Map();
for (const path of paths) {
  const destination = join(disposable, path);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, path), destination);
  assert.deepEqual(readFileSync(destination), readFileSync(join(root, path)), `unchanged copy: ${path}`);
  sources.set(path, readFileSync(destination, 'utf8'));
}
const html = sources.get('nma/index.html');
const quoted = 'lines.push([r.study, r.treatment2, r.treatment1].map(quoteLabel).concat([r.te.toFixed(6), r.se.toFixed(6)]).join(", "));';
const raw = 'lines.push([r.study, r.treatment2, r.treatment1, r.te.toFixed(6), r.se.toFixed(6)].join(", "));';
assert.equal(html.split(quoted).length - 1, 1, 'exactly one serializer must be reconstructed');
const reconstructed = html.replace(quoted, raw);
assert.equal(reconstructed.replace(raw, quoted), html, 'the serializer is the only source difference');

const plants = [
  'plant P04-R3: leading-hash study ID retains both studies in a successful fit',
  ...['comma', 'double quote', 'tab'].map(label => `plant P04-R3: ${label} in a study ID round-trips without refusal`),
  ...['comma', 'double quote', 'tab'].map(label => `plant P04-R3: ${label} in both treatment labels round-trips without refusal`),
  'plant P04-R3: hash-prefixed multi-arm study keeps all contrasts and study grouping',
].sort();
const controls = [
  'control: ordinary extraction labels retain both studies and unchanged numeric fields',
  'control: manually quoted hash ID is data while actual comment lines remain ignored',
  'control: spreadsheet-like label prefixes remain literal extraction identifiers',
  'control: an empty or unavailable extraction bus still returns null',
].sort();
const provenance = {
  baseline: 'reconstructed raw serializer; not an independently supplied historical checkout',
  node: process.version, disposable,
  sourceSha256LF: Object.fromEntries([...sources].map(([path, text]) => [path, sha256LF(text)])),
  reconstructedHtmlSha256LF: sha256LF(reconstructed),
  replacement: { quoted, raw },
};
console.log('P04_REGRESSION_PROVENANCE', JSON.stringify(provenance));

function run(label, source) {
  writeFileSync(join(disposable, 'nma/index.html'), source);
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testPath], {
    cwd: disposable, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  writeFileSync(join(disposable, `${label}.tap`), result.stdout ?? '');
  writeFileSync(join(disposable, `${label}.stderr.txt`), result.stderr ?? '');
  console.log(`P04_REGRESSION_RUN ${label}`);
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${label}: test execution must complete`);
  const passed = [...result.stdout.matchAll(/^ok \d+ - (.+)\r?$/gm)].map(match => match[1].trim()).sort();
  const failed = [...result.stdout.matchAll(/^not ok \d+ - (.+)\r?$/gm)].map(match => match[1].trim()).sort();
  const summary = { label, status: result.status, passed, failed };
  console.log('P04_REGRESSION_RESULT', JSON.stringify(summary));
  return summary;
}
const before = run('reconstructed-old', reconstructed);
const after = run('current', html);
writeFileSync(join(disposable, 'evidence.json'), JSON.stringify({ provenance, before, after }, null, 2));
assert.equal(before.status, 1, 'the reconstructed old serializer must fail the plants');
assert.deepEqual(before.failed, plants, 'all eight plants must fail, with no other failures');
assert.deepEqual(before.passed, controls, 'all four controls must pass on the reconstructed old serializer');
assert.equal(after.status, 0, 'the current serializer must pass');
assert.deepEqual(after.failed, []);
assert.deepEqual(after.passed, [...plants, ...controls].sort());
for (const path of paths) {
  assert.equal(readFileSync(join(disposable, path), 'utf8'), sources.get(path), `restored disposable source: ${path}`);
  assert.equal(readFileSync(join(root, path), 'utf8'), sources.get(path), `reviewed tree remains unchanged: ${path}`);
}
console.log('P04_REGRESSION_VERIFIED: reconstructed old = 8 plants FAIL / 4 controls PASS; current = 12 PASS');
