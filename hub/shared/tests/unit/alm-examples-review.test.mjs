import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as transport from '../../../../validation/examples/plain-evidence.mjs';
const { clearExampleEvidence } = transport;

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const runtime = ['metafor', 'meta', 'netmeta', 'metadat', 'mada', 'metasens', 'robumeta', 'clubSandwich'];

// Policy contract for the R code; behavioural positive/negative controls also
// run in base R before any dataset fitting via runtime-package-controls.R.
function assertRuntimePolicy(source) {
  const allowed = source.match(/allowed\s*<-\s*c\(([^)]+)\)/)?.[1].match(/'([^']+)'/g)?.map(s => s.slice(1, -1));
  assert.deepEqual(allowed?.slice().sort(), runtime.slice().sort(), 'approved runtime package set');
  assert.match(source, /validate_runtime_packages\(a\$packages\)/, 'guard must receive only runtime packages');
  assert.doesNotMatch(source, /c\(d\$source_package,\s*a\$packages\)/, 'source provenance must not be a runtime dependency');
  assert.match(source, /source\s*<-\s*validate_source\(d,root\)/, 'source identity remains independently checked');
}

test('R guard covers the approved original models and separates source provenance', () => {
  assertRuntimePolicy(read('validation/examples/check_examples.R'));
});

test('planted old allowlist and source/runtime conflation violate the R policy contract', () => {
  const source = read('validation/examples/check_examples.R');
  assert.throws(() => assertRuntimePolicy(source.replace("'mada'", "'unapproved'")), /runtime package set/);
  assert.throws(() => assertRuntimePolicy(source.replace('validate_runtime_packages(a$packages)',
    'validate_runtime_packages(c(d$source_package,a$packages))')), /only runtime packages/);
});

test('each evidence reset removes stale JSON as well as CSV without deleting another app', () => {
  const folder = mkdtempSync(join(tmpdir(), 'alm-examples-review-'));
  try {
    const stale = join(folder, 'gosh.app.json'), csv = join(folder, 'gosh.values.csv');
    const other = join(folder, 'nma.app.json');
    for (const path of [stale, csv, other]) writeFileSync(path, 'test-only stale output');
    clearExampleEvidence(folder, 'gosh');
    assert.equal(existsSync(stale), false, 'a failed browser run must not retain its old JSON');
    assert.equal(existsSync(csv), false);
    assert.equal(existsSync(other), true);
    assert.throws(() => clearExampleEvidence(folder, '../nma'), /app/i);
    assert.equal(existsSync(other), true);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

function assertSourceFilesOnly(paths) {
  assert.deepEqual(paths.filter(p => /\.app\.json$|(?:^|\/)unit-verification[^/]*\.txt$/.test(p)), [],
    'page-produced artifacts and test logs belong in ignored output');
}

test('source dataset directories contain no captured page output or verification logs', () => {
  const entries = readdirSync(new URL('validation/examples/', root), { recursive: true }).map(p => p.replaceAll('\\', '/'));
  assertSourceFilesOnly(entries);
  assert.throws(() => assertSourceFilesOnly([...entries, 'gosh/dat.bcg.app.json']), /page-produced/);
  assert.throws(() => assertSourceFilesOnly([...entries, 'unit-verification-round4.txt']), /page-produced/);
});

test('browser JSON and plain evidence share the ignored output directory', () => {
  const spec = read('hub/shared/tests/features-examples.spec.mjs');
  assert.match(spec, /new URL\(item\.app\s*\+\s*'\.app\.json',\s*plain\)/);
  assert.doesNotMatch(spec, /validation\/examples\/\$\{item\.app\}\/\$\{item\.dataset\}\.app\.json/);
  assert.match(spec, /prepareExampleEvidence\(plain,\s*manifest\)/);
  assert.match(read('validation/examples/.gitignore'), /^\*\.app\.json$/m);
});

test('a standalone browser run creates ignored evidence storage and repairs a missing ignore rule', () => {
  const folder = mkdtempSync(join(tmpdir(), 'alm-examples-output-'));
  try {
    const out = join(folder, 'fresh-output');
    const manifest = [{ paper: 13, app: 'gosh', dataset: 'dat.bcg' }];
    transport.prepareExampleEvidence(out, manifest);
    assert.equal(readFileSync(join(out, '.gitignore'), 'utf8'), '*\n');
    assert.equal(readFileSync(join(out, 'manifest.csv'), 'utf8'), '"paper","app","dataset"\n"13","gosh","dat.bcg"\n');
    writeFileSync(join(out, 'gosh.app.json'), 'previous worker output');
    writeFileSync(join(out, '.gitignore'), '# planted missing ignore rule\n');
    transport.prepareExampleEvidence(out, manifest);
    assert.equal(readFileSync(join(out, '.gitignore'), 'utf8'), '*\n');
    assert.equal(readFileSync(join(out, 'gosh.app.json'), 'utf8'), 'previous worker output');
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
