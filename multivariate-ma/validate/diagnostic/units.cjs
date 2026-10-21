'use strict';
// Units invariance of the diagnostic verdict: verdict(y*c, S*c^2) must equal verdict(y, S).
// Population: 69 hard fits, 30 controls, the m=1 and m=3 fixtures of tests/diagnostic.cjs and the
// REVIEW_209 Finding 1 probe designs (regenerated here from a fixed seed; the reviewer's own draws were not kept).
// Usage: node units.cjs   (writes units-invariance.json)
const fs = require('node:fs'), path = require('node:path');
const engine = require('../../../shared/multivariate-ma.js');
const read = p => JSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8'));
const factors = [0.01, 0.1, 10, 100];

function rng(seed) {
  let s = seed >>> 0;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
function bivariate(seed, k, sii, G, within) {
  const z = rng(seed), c = within * sii, L = [Math.sqrt(G[0][0]), G[0][1] / Math.sqrt(G[0][0])];
  L.push(Math.sqrt(G[1][1] - L[1] * L[1]));
  const W = [Math.sqrt(sii), c / Math.sqrt(sii)]; W.push(Math.sqrt(sii - W[1] * W[1]));
  return Array.from({ length: k }, () => {
    const a = z(), b = z(), e = z(), f = z();
    return { y: [L[0] * a + W[0] * e, L[1] * a + L[2] * b + W[1] * e + W[2] * f], S: [[sii, c], [c, sii]] };
  });
}
function univariate(seed, k, v, tau2) {
  const z = rng(seed);
  return Array.from({ length: k }, () => ({ y: [z() * Math.sqrt(v + tau2)], S: [[v]] }));
}
function population() {
  const hard = read('hard.json'), controls = read('controls.json').selected;
  const out = hard.map(f => ({ id: f.id, set: 'hard', studies: f.studies }))
    .concat(controls.map(f => ({ id: f.id, set: 'control', studies: f.studies })));
  const y = [-2, -1, 0, 1, 2];
  out.push({ id: 'fixture:m1', set: 'fixture', studies: y.map(v => ({ y: [v], S: [[0.2]] })) });
  out.push({ id: 'fixture:m3', set: 'fixture', studies: [[-2, 1, 0], [2, -1, 1], [1, 3, -2], [-1, -3, 2], [0, 0, -1]].map(v => ({ y: v, S: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] })) });
  out.push({ id: 'probe:uni:k10:v0.05', set: 'probe', studies: univariate(1, 10, 0.05, 0.05) });
  out.push({ id: 'probe:uni:k10:v0.2', set: 'probe', studies: univariate(2, 10, 0.2, 0.2) });
  out.push({ id: 'probe:uni:k30:v0.5', set: 'probe', studies: univariate(3, 30, 0.5, 0.86) });
  out.push({ id: 'probe:bi:k40:S0.1:rho-0.71', set: 'probe', studies: bivariate(4, 40, 0.1, [[0.094, -0.71 * Math.sqrt(0.094 * 0.179)], [-0.71 * Math.sqrt(0.094 * 0.179), 0.179]], 0.3) });
  for (const sii of [0.01, 0.5]) for (const k of [10, 40]) for (const r of [1, 2, 3]) {
    const g = sii, rho = [0.5, -0.3, 0][r - 1];
    out.push({ id: `probe:bi:k${k}:S${sii}:${r}`, set: 'probe', studies: bivariate(100 * k + 10 * r + (sii === 0.5 ? 5 : 0), k, sii, [[g, rho * g], [rho * g, g]], 0.2) });
  }
  return out;
}
const scale = (studies, c) => studies.map(s => ({ y: s.y.map(v => v * c), S: s.S.map(row => row.map(v => v * c * c)) }));
function run() {
  const fits = population().map(f => {
    const base = engine.fit(f.studies).diagnostic.verdict;
    const scaled = factors.map(c => ({ c, verdict: engine.fit(scale(f.studies, c)).diagnostic.verdict }));
    return { id: f.id, set: f.set, verdict: base, scaled, invariant: scaled.every(s => s.verdict === base) };
  });
  const invariant = fits.filter(f => f.invariant).length;
  return { factors, fits: fits.length, invariant, failures: fits.filter(f => !f.invariant), verdicts: fits };
}
module.exports = { run, population, scale, factors };
if (require.main === module) {
  const r = run();
  fs.writeFileSync(path.join(__dirname, 'units-invariance.json'), JSON.stringify({ node: process.version, ...r }, null, 2) + '\n');
  console.log(`UNITS INVARIANCE ${r.invariant}/${r.fits} fits identical verdict at c in {${factors.join(', ')}}`);
  for (const f of r.failures) console.log('NOT INVARIANT', f.id, f.verdict, JSON.stringify(f.scaled));
  process.exitCode = r.invariant === r.fits ? 0 : 1;
}
