// Read-only replay: no validation artifacts, references or recorded counts written.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { archive, archivePlotState, html, lf, loadPage, mutationEvidence, points, render, root, sha256 }
  from '../hub/shared/tests/unit/p08-plot-harness.mjs';

const liveness = mutationEvidence();
console.log(JSON.stringify({ node: process.version, pageSha256LF: sha256(html),
  provenance: 'Supplied PR head; old-loop mutations reconstructed from CXTASK.md, not an original base snapshot',
  liveness }));

function comparePoints(before, after, tag) {
  const oldPoints = points(before, tag), newPoints = points(after, tag);
  return { beforeCount: oldPoints.length, afterCount: newPoints.length,
    identicalCoordinates: JSON.stringify(oldPoints) === JSON.stringify(newPoints),
    maxAbsoluteCoordinateDifference: oldPoints.length === newPoints.length
      ? Math.max(...oldPoints.flatMap((p, i) => p.map((v, j) => Math.abs(v - newPoints[i][j])))) : null };
}

const run = loadPage(), oldRun = loadPage({ ticks: true, curve: true });
const geometry = archive.result.map((record, index) => {
  const state = archivePlotState(record);
  const svg = render(run, record.studies, true, state);
  const oldSvg = render(oldRun, record.studies, true, state);
  const result = { scenario: index + 1, state };
  for (const tag of ['polyline', 'polygon']) {
    result[tag] = {
      archiveToCurrent: comparePoints(record.svg, svg, tag),
      archiveToOldLoops: comparePoints(record.svg, oldSvg, tag),
      oldLoopsToCurrent: comparePoints(oldSvg, svg, tag)
    };
  }
  return result;
});
console.log(JSON.stringify({ scope: 'Two supplied serialized SVG scenarios, not the 1742-configuration paper archive or browser paint', geometry }, null, 2));

await import('../meta-regression/plus-engine.js');
await import('../meta-regression/validate/contract.js');
const read = file => JSON.parse(readFileSync(new URL('meta-regression/validate/' + file, root), 'utf8'));
const manifest = read('MANIFEST-plus.json');
for (const file of manifest.files) {
  const text = lf(readFileSync(new URL('meta-regression/' + file.path, root), 'utf8'));
  assert.equal(Buffer.byteLength(text), file.bytes, file.path + ': LF byte count');
  assert.equal(sha256(text), file.sha256, file.path + ': recorded hash');
}
const corpus = read('plus/corpus.json'), refs = read('plus/reference.json');
assert.equal(corpus.length, manifest.configurations);
let checks = 0;
for (let i = 0; i < corpus.length; i++) {
  assert.equal(corpus[i].id, refs[i].id);
  const rows = globalThis.AlmMetaPlusContract.audit(globalThis.AlmMetaPlus.compute(corpus[i]), refs[i].result);
  for (const row of rows) { assert.equal(row.pass, true, corpus[i].id + ': ' + JSON.stringify(row)); checks++; }
}
assert.equal(checks, manifest.numericChecks);
console.log(JSON.stringify({ preservedExtras: { configurations: corpus.length, passedChecks: checks,
  pinnedFiles: manifest.files.length, referencesChanged: false } }));
