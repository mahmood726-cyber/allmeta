// Read-only diagnosis of table-text failures. No references are rewritten and
// no verdict is normalised. This does not run the browser or the complete replay.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { app, defaultInput, harness } from './nma-inconsistency-render-harness.mjs';

const manifest = JSON.parse(readFileSync(new URL('validate/MANIFEST.json', app), 'utf8'));
const [corpus, reference] = manifest.files.map(file => {
  const bytes = readFileSync(new URL(file.path, app));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  return JSON.parse(bytes);
});
const h = harness();
const stats = { acceptedTables: 0, matchingTables: 0, mismatchingTables: 0,
  changedCellsByColumn: {}, verdictTransitions: {} };
const count = (map, key) => { map[key] = (map[key] || 0) + 1; };
function text(tree) {
  return typeof tree === 'string' ? tree : tree[2].map(text).join('');
}
for (const [i, ref] of reference.cases.entries()) {
  assert.equal(ref.key, corpus[i].key);
  if (ref.reason) continue;
  // For bus cases ref.text is the pinned converted input. Bus conversion and
  // refusal paths are outside this diagnostic's scope.
  h.load(ref.text, corpus[i].model);
  const actual = h.table(), expected = ref.display[0][2].map(row => row[2].map(text));
  stats.acceptedTables++;
  if (JSON.stringify(actual) === JSON.stringify(expected)) stats.matchingTables++;
  else stats.mismatchingTables++;
  assert.equal(actual.length, expected.length, ref.key);
  for (const [j, row] of expected.entries()) {
    assert.equal(actual[j].length, row.length, ref.key);
    row.forEach((cell, col) => {
      if (actual[j][col] === cell) return;
      count(stats.changedCellsByColumn, col);
      if (col === 6) count(stats.verdictTransitions, `${cell} -> ${actual[j][col]}`);
    });
  }
}
console.log('Pinned accepted-table text diagnosis:', JSON.stringify(stats));

// Evaluate the unmodified live tier's actual expected-table expression. This
// isolates its text contract without pretending to run webR or a browser DOM.
const live = readFileSync(new URL('validate/live.js', app), 'utf8');
const expectedExpression = live.match(/^  const expected=(.+);$/m)[1];
for (const model of ['FE', 'DL', 'PM']) {
  h.context.state = h.load(defaultInput, model);
  const expected = vm.runInContext(expectedExpression, h.context);
  const actual = h.table();
  console.log('Live built-in table text diagnosis:', JSON.stringify({ model,
    matches: JSON.stringify(actual) === JSON.stringify(expected),
    differences: actual.flatMap((row, i) => row.flatMap((cell, j) =>
      cell === expected[i][j] ? [] : [{ row: i, column: j, expected: expected[i][j], actual: cell }])) }));
}
