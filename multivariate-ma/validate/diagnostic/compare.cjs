'use strict';
// Exact verdict comparison against the R oracle (oracle-verdicts.json): one expected verdict per fit, no alternatives.
const verdicts = new Set(['interior maximum', 'boundary maximum', 'multiple near-equal optima']);
const N = 297;
function compare(expected, actual) {
  if (expected.length !== N || new Set(expected.map(f => f.id)).size !== N) throw Error(`Expected population must contain exactly ${N} unique IDs`);
  if (!expected.every(f => verdicts.has(f.verdict))) throw Error('Every expected record needs exactly one known verdict');
  const counts = new Map(), byId = new Map(), failures = [];
  for (const f of actual) { counts.set(f.id, (counts.get(f.id) || 0) + 1); byId.set(f.id, f); }
  const ids = new Set(expected.map(f => f.id));
  for (const f of actual) if (!ids.has(f.id)) failures.push({ id: f.id, reason: 'unexpected ID' });
  let agreement = 0;
  for (const f of expected) {
    const observed = byId.get(f.id);
    if (counts.get(f.id) !== 1) failures.push({ id: f.id, reason: observed ? 'duplicate ID' : 'missing ID' });
    else if (!observed.diagnostic || observed.diagnostic.verdict !== f.verdict)
      failures.push({ id: f.id, reason: 'wrong verdict', expected: f.verdict, actual: observed.diagnostic && observed.diagnostic.verdict });
    else agreement++;
  }
  return { expected: N, actual: actual.length, agreement, passed: failures.length === 0 && actual.length === N, failures };
}
module.exports = { compare, N };
if (require.main === module) {
  const fs = require('node:fs'), path = require('node:path');
  const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
  const expected = read(path.join(__dirname, 'oracle-verdicts.json')).fits;
  const actual = read(process.argv[2]).fits;
  const result = compare(expected, actual);
  console.log(`${result.agreement}/${result.expected} agreement; ${result.failures.length} failures`);
  if (!result.passed) console.log(JSON.stringify(result.failures, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
