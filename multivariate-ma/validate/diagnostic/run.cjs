'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const engine = require('../../../shared/multivariate-ma.js'), baseline = require('./baseline-engine.cjs'), { compare } = require('./compare.cjs');
const read = p => JSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8'));
const write = (p, x) => fs.writeFileSync(path.join(__dirname, p), JSON.stringify(x, null, 2) + '\n');
const hard = read('hard.json'), controls = read('controls.json').selected, expected = hard.concat(controls);
assert.equal(hard.length, 69); assert.equal(controls.length, 30);
const fits = expected.map(f => {
  const fit = engine.fit(f.studies), old = baseline.fit(f.studies);
  const { diagnostic, ...unchanged } = fit;
  assert.deepEqual(unchanged, old, `Preexisting fit fields changed: ${f.id}`);
  assert.ok(diagnostic.profiles.every(p => p.points.every(q => q.status === 'finite-search')));
  return { id: f.id, classification: f.classification, diagnostic };
});
const result = compare(expected, fits);
write('agreement.json', { ...result, node: process.version, exactBaselineFits: fits.length,
  preregSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'PREREG.md'))).digest('hex'), fits });
console.log(`${result.agreement}/${result.expected} agreement; ${fits.length}/${fits.length} existing fit objects exactly unchanged`);
for (const group of ['a', 'b', 'control']) {
  const subset = fits.filter(f => f.classification === group);
  console.log(group, subset.length, Object.fromEntries([...new Set(subset.map(f => f.diagnostic.verdict))].map(v => [v, subset.filter(f => f.diagnostic.verdict === v).length])));
}
const compact = fits.map(f => ({ id: f.id, diagnostic: { verdict: f.diagnostic.verdict } }));
const wrong = JSON.parse(JSON.stringify(compact));
wrong[0].diagnostic.verdict = 'unique interior maximum'; // first registered hard fit is boundary
for (const [name, damaged] of [['wrong-verdict', wrong], ['dropped-fit', compact.slice(1)]]) {
  write(name + '.json', { fits: damaged });
  assert.equal(compare(expected, damaged).passed, false);
  console.log(`${name}: planted; run compare.cjs on ${name}.json to verify exit 1`);
}
if (!result.passed) { console.error(result.failures); process.exitCode = 1; }
