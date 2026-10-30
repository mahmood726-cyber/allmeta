// Reproduce defects in disposable LF copies. No historical checkout is supplied:
// these are explicit semantic mutants, not a claimed byte-exact pre-PR snapshot.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './p05-qprofile-harness.mjs';
const unit = 'hub/shared/tests/unit/';
const scratch = mkdtempSync(join(tmpdir(), 'p05-review-'));
const paths = [
  ...readdirSync(new URL(unit, root)).filter(p => p.startsWith('p05-')).map(p => unit + p),
  'shared/ma-core.js', 'shared/heterogeneity-ci.js', 'shared/alm-validate.js',
  'heterogeneity/index.html', 'hub/shared/results-export.js',
  'heterogeneity/validate/adapter.js', 'heterogeneity/validate/MANIFEST.json',
  'heterogeneity/validate/corpus/corpus.json', 'heterogeneity/validate/corpus/reference.json'
];
for (const path of paths) {
  mkdirSync(dirname(join(scratch, path)), { recursive: true });
  writeFileSync(join(scratch, path), readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n'));
}
function edit(path, before, after) {
  const target = join(scratch, path), text = readFileSync(target, 'utf8');
  assert.equal(text.split(before).length, 2, 'unique mutation anchor: ' + before);
  writeFileSync(target, text.replace(before, after));
}
function run(label, args, failures = []) {
  const result = spawnSync(process.execPath, args, { cwd: scratch, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000 });
  assert.ifError(result.error);
  const output = result.stdout + result.stderr;
  writeFileSync(join(scratch, label + '.log'), output);
  console.log(label, output.split('\n').filter(s => /^(not ok |# (tests|pass|fail|cancelled|skipped)|P05_PUBLICATION_REPLAY)/.test(s)).join('\n'));
  assert.equal(result.status, failures.length ? 1 : 0, label + ': ' + output.slice(-2000));
  if (failures.length) {
    const actual = [...output.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1].trim().replace(/\\#/g, '#')).sort();
    assert.deepEqual(actual, [...failures].sort(), label + ': only the specified defects may fail');
  }
}
const suite = ['--test', '--test-reporter=tap', unit + 'p05-qprofile-empty.test.mjs'];
run('fixed-LF', suite);
run('fixed-equality', ['--test', '--test-reporter=tap', unit + 'p05-qprofile-boundary.test.mjs']);
const provenanceSuite = ['--test', '--test-reporter=tap', unit + 'p05-qprofile-provenance.test.mjs'];
run('fixed-provenance', provenanceSuite);
// Replant only the old raw-byte hashing, leaving recorded hashes and assertions intact.
const provenancePaths = [unit + 'p05-qprofile-empty.test.mjs', unit + 'p05-qprofile-replay.mjs'];
const provenanceSources = provenancePaths.map(path => readFileSync(join(scratch, path), 'utf8'));
for (const [index, path] of provenancePaths.entries()) {
  edit(path, ".replace(/\\r\\n/g, '\\n')", '');
  run(`raw-byte-${index === 0 ? 'MD5' : 'SHA256'}-mutant`, provenanceSuite,
    ['P05 provenance plant: CRLF checkout preserves every recorded hash and byte count']);
  writeFileSync(join(scratch, path), provenanceSources[index]);
}

const sourcePath = 'shared/heterogeneity-ci.js', pagePath = 'heterogeneity/index.html';
const source = readFileSync(join(scratch, sourcePath), 'utf8');
const page = readFileSync(join(scratch, pagePath), 'utf8');
edit(sourcePath, ', empty: Q0 < qLo', '');
edit(pagePath, '(qpci.empty ? "; empty confidence set; boundary limits " : " ")', '" "');
edit(pagePath, '(qpci.empty ? "empty confidence set; boundary limits " : "")+', '');
const note = page.split('\n').find(line => line.includes('if (qpci && qpci.empty)'));
assert.ok(note);
edit(pagePath, note, '');
for (const line of page.split('\n').filter(line => /out\.qprofile_(empty|status) =/.test(line))) edit(pagePath, line, '');
const cases = JSON.parse(readFileSync(join(scratch, unit + 'p05-qprofile-input.json'), 'utf8'));
const failures = [];
for (const c of cases) {
  const prefix = `P05-R5 ${c.empty ? 'plant' : 'control'}: ${c.id} `;
  failures.push(prefix + 'source identifies confidence-set status');
  if (c.alpha !== 0.05) continue;
  if (c.empty) failures.push(prefix + 'display explains confidence-set status');
  failures.push(prefix + 'all five results exports carry status');
}
run('pre-PR-semantics-mutant', suite, failures);
writeFileSync(join(scratch, sourcePath), source);
writeFileSync(join(scratch, pagePath), page);
edit(sourcePath, 'empty: Q0 < qLo', 'empty: Q0 <= qLo');
run('inclusive-boundary-mutant', ['--test', '--test-reporter=tap', unit + 'p05-qprofile-boundary.test.mjs'],
  ['P05 equality control: Q(0) equal to the lower quantile is nonempty']);
console.log('P05 review evidence:', scratch);
