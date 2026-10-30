// Expected failure: replay the pass-2 reconstruction by removing only the new
// analytic branch in memory. No production file or baseline is rewritten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../shared/dose-response.js', import.meta.url), 'utf8');
const begin = source.indexOf('    if (type === "ir" && L.length === 2) {');
const end = source.indexOf('    function ps(par) {', begin);
assert.ok(begin > 0 && end > begin);
const context = vm.createContext({});
vm.runInContext((source.slice(0, begin) + source.slice(end)).replace(
  '_internal: { nmmin:', '_internal: { hamlingCounts: hamlingCounts, nmmin:'), context);
const DR = context.AlmDoseResponse;
const levels = [
  { dose: 0, cases: 101, n: 100, y: 0, v: 0 },
  { dose: 1, cases: 101, n: 100, y: 0, v: .25 }
];

test('P02-R3 pre-analytic plant: IR Hamling reconstructed counts must be positive', () => {
  const counts = DR._internal.hamlingCounts(levels, 'ir');
  assert.ok(counts.every(p => Number.isFinite(p.A) && p.A > 0 && Number.isFinite(p.N) && p.N > 0),
    JSON.stringify(counts));
});

test('P02-R3 pre-analytic control: valid case-control Hamling reconstruction stays usable', () => {
  const S = DR._internal.covarLogRR(levels.map(l => ({ ...l, cases: 10 })), 'cc', 'h');
  assert.equal(S[0][0], .25);
});
