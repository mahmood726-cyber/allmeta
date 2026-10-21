'use strict';
// 297-fit exact-verdict comparison: 69 hard fits + 30 controls, each at outcome scale x1, x10 and x0.1,
// against the R oracle (oracle.R verdicts -> oracle-verdicts.json). Usage: node run.cjs
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const engine = require('../../../shared/multivariate-ma.js'), baseline = require('./baseline-engine.cjs'), { compare, ALLOWED } = require('./compare.cjs');
const read = p => JSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8'));
const write = (p, x) => fs.writeFileSync(path.join(__dirname, p), JSON.stringify(x, null, 2) + '\n');
const scales = [1, 10, 0.1];
function population() {
  const hard = read('hard.json'), controls = read('controls.json').selected;
  assert.equal(hard.length, 69); assert.equal(controls.length, 30);
  return scales.flatMap(c => hard.concat(controls).map(f => ({ id: `${f.id}@x${c}`, base: f.id, scale: c, classification: f.classification,
    studies: f.studies.map(s => ({ y: s.y.map(v => v * c), S: s.S.map(row => row.map(v => v * c * c)) })) })));
}
function fits(eng, exact) {
  return population().map(f => {
    const { diagnostic, ...unchanged } = eng.fit(f.studies);
    if (exact) assert.deepStrictEqual(unchanged, baseline.fit(f.studies), `Preexisting fit fields changed: ${f.id}`);
    return { id: f.id, base: f.base, scale: f.scale, classification: f.classification, diagnostic };
  });
}
module.exports = { population, fits };
if (require.main === module) {
  const expected = read('oracle-verdicts.json').fits, actual = fits(engine, true);
  const result = compare(expected, actual);
  write('agreement.json', { ...result, node: process.version, exactBaselineFits: actual.length,
    preregSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'PREREG.md'))).digest('hex'), fits: actual });
  console.log(`${result.agreement}/${result.expected} exact verdict agreement with R (${result.allowedDisagreements} named allowance, ${result.unexplained} unexplained); ${actual.length}/${actual.length} existing fit objects exactly unchanged`);
  for (const group of ['a', 'b', 'control']) for (const c of scales) {
    const subset = actual.filter(f => f.classification === group && f.scale === c), r = expected.filter(f => subset.some(s => s.id === f.id));
    const tally = xs => JSON.stringify(Object.fromEntries([...new Set(xs)].sort().map(v => [v, xs.filter(x => x === v).length])));
    console.log(`${group} x${c} n=${subset.length} JS ${tally(subset.map(f => f.diagnostic.verdict))} R ${tally(r.map(f => f.verdict))}`);
  }
  const compact = actual.map(f => ({ id: f.id, diagnostic: { verdict: f.diagnostic.verdict } }));
  // wrong-verdict.json adds a third disagreement, outside the named allowance, to the two allowed ones.
  const wrong = JSON.parse(JSON.stringify(compact)), flip = wrong.findIndex(f => f.diagnostic.verdict === 'boundary maximum' && !ALLOWED.has(f.id));
  wrong[flip].diagnostic.verdict = 'interior maximum';
  for (const [name, damaged] of [['wrong-verdict', wrong], ['dropped-fit', compact.slice(1)]]) {
    write(name + '.json', { fits: damaged });
    assert.equal(compare(expected, damaged).passed, false);
    console.log(`${name}: planted; run compare.cjs on ${name}.json to verify exit 1`);
  }
  if (!result.passed) { console.error(JSON.stringify(result.failures, null, 2)); process.exitCode = 1; }
}
