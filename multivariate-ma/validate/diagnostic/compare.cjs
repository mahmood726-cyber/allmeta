'use strict';
const verdicts = new Set(['unique interior maximum', 'boundary maximum', 'flat likelihood: estimates not unique']);
function compare(expected, actual) {
  if (expected.length !== 99 || new Set(expected.map(f => f.id)).size !== 99) throw Error('Expected population must contain exactly 99 unique IDs');
  const counts = new Map(), byId = new Map(), failures = [];
  for (const f of actual) { counts.set(f.id, (counts.get(f.id) || 0) + 1); byId.set(f.id, f); }
  const ids = new Set(expected.map(f => f.id));
  for (const f of actual) if (!ids.has(f.id)) failures.push({ id: f.id, reason: 'unexpected ID' });
  let agreement = 0;
  for (const f of expected) {
    const observed = byId.get(f.id);
    if (counts.get(f.id) !== 1) failures.push({ id: f.id, reason: observed ? 'duplicate ID' : 'missing ID' });
    else if (!observed.diagnostic || !verdicts.has(observed.diagnostic.verdict) || !f.expected.includes(observed.diagnostic.verdict))
      failures.push({ id: f.id, reason: 'wrong verdict', expected: f.expected, actual: observed.diagnostic && observed.diagnostic.verdict });
    else agreement++;
  }
  return { expected: 99, actual: actual.length, agreement, passed: failures.length === 0 && actual.length === 99, failures };
}
module.exports = { compare };
if (require.main === module) {
  const fs = require('node:fs'), path = require('node:path');
  const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
  const expected = read(path.join(__dirname, 'hard.json')).concat(read(path.join(__dirname, 'controls.json')).selected);
  const actual = read(process.argv[2]).fits;
  const result = compare(expected, actual);
  console.log(`${result.agreement}/${result.expected} agreement; ${result.failures.length} failures`);
  if (!result.passed) console.log(JSON.stringify(result.failures, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
