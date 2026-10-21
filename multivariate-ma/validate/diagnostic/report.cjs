'use strict';
// Checks the saved evidence of the 2026-10-21 revision (see the PREREG.md addendum), writes final-hashes.json and
// report.json, and prints the counts. Every count is read from the named evidence file. Usage: node report.cjs
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const readText = p => {
  const bytes = fs.readFileSync(path.join(__dirname, p));
  return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8').replace(/^﻿/, '');
};
const read = p => JSON.parse(readText(p));
const a = read('agreement.json'), oracle = read('oracle-verdicts.json'), units = read('units-invariance.json'), mutations = read('mutations.json');
const replay = read('plus-replay.json'), exact = read('exact-replay.json'), mutationResults = read('mutation-results.json'), tests = readText('node-tests.log');
assert.equal(oracle.fits.length, 297); assert.equal(a.expected, 297); assert.equal(a.actual, 297); assert.equal(a.exactBaselineFits, 297);
assert.equal(units.invariant, units.fits);
assert.ok(mutations.mutations.length === 5 && mutations.mutations.every(m => m.killed));
assert.equal(replay.passed, 54612); assert.equal(replay.checks, 54612); assert.equal(replay.failedChecks, 0);
assert.equal(exact.fits, 2023); assert.equal(exact.refusals, 1);
assert.ok(mutationResults.length === 2 && mutationResults.every(m => m.exitCode === 1));
const passCount = Number((tests.match(/ℹ pass (\d+)/) || [])[1]); assert.match(tests, /ℹ fail 0/);
const tally = xs => Object.fromEntries([...new Set(xs)].sort().map(v => [v, xs.filter(x => x === v).length]));
const summary = {
  agreement: `${a.agreement}/${a.expected}`, disagreements: a.failures,
  rVerdicts: tally(oracle.fits.map(f => f.set + ': ' + f.verdict)), jsVerdicts: tally(a.fits.map(f => (f.classification === 'control' ? 'control' : 'hard') + ': ' + f.diagnostic.verdict)),
  unitsInvariance: `${units.invariant}/${units.fits}`,
  mutations: mutations.mutations.map(m => ({ name: m.name, killed297: m.killed297, agreement297: m.agreement297, killedByControls: m.killedByControls,
    caughtBy: m.caughtBy297.map(f => f.id).concat(m.caughtByControls.map(f => f.id)) })),
  plusReplay: `${replay.passed}/${replay.checks}`, exactReplay: `${exact.fits}/${exact.fits} fits, ${exact.refusals} identical refusal`, nodeTests: `${passCount} pass, 0 fail`
};
const sources = ['shared/multivariate-ma.js', 'multivariate-ma/index.html', 'multivariate-ma/plus-ui.js', 'multivariate-ma/plus.js',
  'multivariate-ma/tests/diagnostic.cjs', 'multivariate-ma/tests/units-invariance.cjs', 'hub/shared/tests/multivariate-ma-diagnostic.spec.mjs'];
const repo = path.resolve(__dirname, '../../..');
const hashes = sources.map(p => ({ path: p, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, p))).digest('hex') }));
fs.writeFileSync(path.join(__dirname, 'final-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
