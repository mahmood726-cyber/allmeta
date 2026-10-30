// Attribute VM overhead without a machine-dependent timing assertion.
// Reconstruct the exact pass-3 source and compare the same calculations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const source = read('../../../../shared/multivariate-ma.js');
const binding = '  // Resolve the finite predicate once; VM global lookups are costly in this hot loop.\n' +
  '  var _obj2IsFinite = Number.isFinite;\n';
const before = source.replace(binding, '').replace(/_obj2IsFinite\(/g, 'Number.isFinite(');
assert.equal(createHash('sha256').update(before).digest('hex'),
  '15d212f9aa2c4394ead57d088fc90cf6b99cbfd23ed87a21b698ca071c9a5ab0',
  'The comparison must reconstruct the exact LF source that timed out in pass 3');
const reference = JSON.parse(read('./p18-r5-reference.json'));

function load(code, countLookups = false) {
  let lookups = 0;
  const context = {};
  if (countLookups) Object.defineProperty(context, 'Number', {
    get() { lookups++; return Number; }, configurable: true
  });
  runInNewContext(code, context);
  return { engine: context.AlmMultivariate, reads: () => lookups };
}
const oldEngine = load(before).engine, newEngine = load(source).engine;
const cases = reference.cases.map(c => ({ name: `${c.shape}:${c.scale}`, studies: c.studies, G: c.G }));
cases.push({ name: 'Berkey', studies: reference.berkey.studies, G: [[0, 0], [0, 0]] });
for (const scale of [1, 2 ** -700, 2 ** 700]) for (const margin of [0, Number.EPSILON]) {
  cases.push({ name: `PD margin ${margin} at ${scale}`, G: [[0, 0], [0, 0]],
    studies: Array.from({ length: 3 }, () => ({ y: [0, 0],
      S: [[(1 + margin) * scale, scale], [scale, (1 + margin) * scale]] })) });
}
for (const c of cases) {
  const args = [c.studies, c.G[0][0], c.G[0][1], c.G[1][1]];
  assert.equal(newEngine._obj2(...args), oldEngine._obj2(...args), c.name);
}
console.log(`Finite-predicate replay: Node ${process.version}; ${cases.length} objective controls exactly equal`);

const studies = reference.berkey.studies;
for (const [label, code] of [['pass-3 source', before], ['current source', source]]) {
  const instrumented = load(code, true), initial = instrumented.reads();
  const objective = instrumented.engine._obj2(studies, 0, 0, 0);
  assert.ok(Number.isFinite(objective));
  console.log(`${label}: Number global lookups per ordinary objective = ${instrumented.reads() - initial}`);
}
// The unchanged page replay supplies the end-to-end deadline. This probe reports
// warm VM timings, with both orders, rather than asserting a noisy timing ratio.
const samples = { before: [], current: [] }, calls = 20000;
function measure(engine) {
  let sum = 0;
  const start = performance.now();
  for (let i = 0; i < calls; i++) sum += engine._obj2(studies, 0, 0, 0);
  return { milliseconds: performance.now() - start, checksum: sum };
}
measure(oldEngine); measure(newEngine);
for (const order of [['before', 'current'], ['current', 'before'], ['before', 'current']]) {
  for (const name of order) samples[name].push(measure(name === 'before' ? oldEngine : newEngine));
}
for (const sample of [...samples.before, ...samples.current]) assert.equal(sample.checksum, samples.before[0].checksum);
console.log(JSON.stringify({ callsPerSample: calls, samples }));
