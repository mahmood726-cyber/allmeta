'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const old = require('./baseline-engine.cjs'), engine = require('../../../shared/multivariate-ma.js');
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, '../plus/corpus.json'), 'utf8'));
let fits = 0, refusals = 0;
function same(studies) {
  let before, after, errorBefore, errorAfter;
  try { before = old.fit(studies); } catch (e) { errorBefore = e.message; }
  try { after = engine.fit(studies); } catch (e) { errorAfter = e.message; }
  assert.equal(errorAfter, errorBefore);
  if (errorBefore) { refusals++; return; }
  const { diagnostic, ...rest } = after;
  assert.deepEqual(rest, before); assert.ok(diagnostic); fits++;
}
for (const c of corpus.configurations) {
  for (const rw of [null, ...corpus.grid]) same(c.rows.map(r => {
    const cov = rw === null ? r.cov : rw * Math.sqrt(r.v[0] * r.v[1]);
    return { y: r.y, S: [[r.v[0], cov], [cov, r.v[1]]] };
  }));
  for (const j of [0, 1]) same(c.rows.map(r => ({ y: [r.y[j]], S: [[r.v[j]]] })));
}
const result = { fits, refusals, configurations: corpus.configurations.length, comparison: 'deepStrictEqual of every preexisting fit field, no rounding or tolerances' };
fs.writeFileSync(path.join(__dirname, 'exact-replay.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`${fits}/${fits} fit objects exactly unchanged; ${refusals} identical refusals`);
