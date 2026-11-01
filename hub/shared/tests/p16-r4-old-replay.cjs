// Reconstruct the supplied PR head using strict inverse edits and pass-1 LF pins.
// All writes and test logs are in the OS temp directory; the working tree is read-only.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { runSuite } = require('./p16-r4-test-runner.cjs');
const root = path.resolve(__dirname, '../../..');
const unit = 'hub/shared/tests/unit/';
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const pins = JSON.parse(read(unit + 'p16-r4-original-sha256.json'));
const edits = JSON.parse(read(unit + 'p16-r4-original-edits.json'));
function replaceOnce(text, from, to) {
  assert.equal(text.split(from).length, 2, 'inverse edit must match exactly once');
  return text.replace(from, () => to);
}
const original = new Map();
for (const [file, pin] of Object.entries(pins)) {
  const edit = edits.reverseEdits.find(e => e.path === file);
  const text = edit ? replaceOnce(read(file), edit.current, edit.original) : read(file);
  assert.equal(sha(text), pin, 'pass-1 LF provenance: ' + file);
  original.set(file, text);
  console.log('Original LF SHA-256 verified: ' + file + ' ' + pin);
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'allmeta-p16-r4-old-'));
function write(rel, text) {
  const file = path.join(work, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}
for (const file of [
  'nma-inconsistency/index.html', 'nma-inconsistency/plus-ui.js',
  'nma-inconsistency/plus-core.js', 'nma-inconsistency/plus-examples.js',
  'shared/ma-comparisons-v1.js', 'hub/shared/results-export.js',
  ...['p16-r4-plus-refusal.test.mjs', 'p16-r4-plus-harness.mjs', 'p16-r4-plus-cases.mjs', 'p16-r4-bus-import.test.mjs'].map(f => unit + f)
]) write(file, original.get(file) ?? read(file));

function expectPlants(file, label, plants, controls, cwd = work) {
  const { result, outcomes } = runSuite(cwd, [file], label, { diagnostics: false });
  assert.equal(result.status, 1, 'old code must fail assertion tests');
  assert.equal(outcomes.length, plants + controls);
  assert.equal(outcomes.filter(t => t.name.startsWith('plant ')).length, plants);
  assert.equal(outcomes.filter(t => t.name.startsWith('control ')).length, controls);
  for (const t of outcomes) assert.equal(t.pass, t.name.startsWith('control '), t.name);
  console.log('Verified expected failures: ' + plants + ' plants fail; ' + controls + ' controls pass.');
}
expectPlants(unit + 'p16-r4-plus-refusal.test.mjs', 'original-plus-refusal', 14, 6);

// Evidence for the importer guard, not a claim of authoritative base provenance.
const priorPage = replaceOnce(original.get('nma-inconsistency/index.html'), edits.preGuard.remove, '');
assert.equal(sha(priorPage), edits.preGuard.sha256);
write('nma-inconsistency/index.html', priorPage);
console.log('Reconstructed pre-guard page LF SHA-256: ' + sha(priorPage));
expectPlants(unit + 'p16-r4-bus-import.test.mjs', 'reconstructed-pre-guard-import', 8, 9);

// Independently reproduce the same refusal plants on the actual parsed page.
// The diagnostic also compares the unchanged main replay on original/current code.
expectPlants('hub/shared/tests/p16-r4-dom-diagnose.cjs', 'original-full-page-plus-refusal', 14, 6, root);
