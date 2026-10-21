'use strict';
// Added control fits for engine mutations that survive the 297-fit comparison (see mutations.cjs).
// A control is kept only if the R oracle (oracle.R verdicts mutation-controls) and the unmutated engine agree.
// The first attempt (mutation-controls-attempt1.json, oracle-mutation-controls-attempt1.*) also had a k=20,
// E=1e-7 fit. R's refinement collapsed it to G ~ 1e-21 (boundary) while the engine stayed at G ~ 1e-7 with the
// same likelihood to ~1e-13, so it was dropped as a control. It is reported, not used.
// Usage: node mutation-controls.cjs   (writes mutation-controls.json)
const fs = require('node:fs'), path = require('node:path');
// Bivariate, S_i = I, outcomes built so that the sample covariance is exactly I + E with a tiny positive E: the
// REML G is about E, interior, but its SDs are only weakly determined, so equally good candidates differ by more
// than 1e-4 relative in SD.
function design(k, C) {
  const m = C.length, Z = [];
  for (let j = 0; j < m; j++) {
    let z = Array.from({ length: k }, (_, i) => Math.sin((i + 1) * (j + 1) * 1.7 + j));
    const mu = z.reduce((a, b) => a + b) / k; z = z.map(x => x - mu);
    for (const w of Z) { const d = z.reduce((a, x, i) => a + x * w[i], 0); z = z.map((x, i) => x - d * w[i]); }
    const n = Math.hypot(...z); Z.push(z.map(x => x / n));
  }
  const L = C.map(r => r.map(() => 0));
  for (let a = 0; a < m; a++) for (let b = 0; b <= a; b++) {
    let s = C[a][b]; for (let d = 0; d < b; d++) s -= L[a][d] * L[b][d];
    L[a][b] = a === b ? Math.sqrt(s) : s / L[b][b];
  }
  return Array.from({ length: k }, (_, i) => L.map(row => row.reduce((a, l, j) => a + l * Z[j][i] * Math.sqrt(k - 1), 0)));
}
const make = (k, eps) => design(k, [[1 + eps, 0.5 * eps], [0.5 * eps, 1 + 2 * eps]]).map(y => ({ y, S: [[1, 0], [0, 1]] }));
// Twelve precise studies (S_ii = 0.01, G about 0.05) plus one study with S_00 = 1e6: mean S_00 is ~7.7e4, so a
// threshold of 1e-6 x mean S_ii (instead of 1e-10) calls the well-identified G_00 ~ 0.064 a zero variance.
function outlier() {
  let seed = 2026;
  const u = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
  const z = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  const st = [];
  for (let i = 0; i < 12; i++) {
    const a = z(), b = z();
    st.push({ y: [0.2 + Math.sqrt(0.05) * a + 0.1 * z(), 0.1 + Math.sqrt(0.05) * (0.4 * a + Math.sqrt(1 - 0.16) * b) + 0.1 * z()], S: [[0.01, 0], [0, 0.01]] });
  }
  st.push({ y: [0.3, 0.15], S: [[1e6, 0], [0, 0.01]] });
  return st;
}
// Mirror-symmetric data (y2 -> -y2), draw 31 of a fixed-seed search: G = 0 exactly, with several screened
// candidates at the same likelihood whose tiny SDs differ relatively. Boundary must take precedence.
function mirrored() {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const nrm = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let st;
  for (let t = 0; t <= 31; t++) {
    const n = 3 + Math.floor(rnd() * 6), half = [];
    for (let i = 0; i < n; i++) {
      const v1 = 0.02 + rnd() * 0.5, v2 = 0.02 + rnd() * 0.5, a = nrm() * 0.7, b = nrm() * 0.7 + (rnd() < 0.5 ? 1 : -1) * 0.6 * a;
      half.push({ y: [a, b], S: [[v1, 0], [0, v2]] });
    }
    st = half.concat(half.map(s => ({ y: [s.y[0], -s.y[1]], S: s.S })));
  }
  return st;
}
const controls = [
  { id: 'mutation-control:k6:E1e-5', purpose: 'G_ii ~ 1e-5, SDs ~ 3e-3, weakly identified: catches a skipped multiple-optima check', studies: make(6, 1e-5) },
  { id: 'mutation-control:imprecise-study', purpose: 'one study with S_00 = 1e6: catches boundary variance threshold x1e4', studies: outlier() },
  { id: 'mutation-control:mirrored-zero', purpose: 'G = 0 with several near-equal candidates: catches swapped precedence', studies: mirrored() }
];
// A well-identified interior fit in large outcome units: optimizer noise far below 1e-4 relative is still above 1e-4
// absolute in SD, so an absolute SD tolerance reports spurious multiple optima.
const berkey = JSON.parse(fs.readFileSync(path.join(__dirname, 'controls.json'), 'utf8')).selected[0], c = 1e5;
controls.push({ id: 'mutation-control:' + berkey.id + '@x100000', purpose: 'first R control rescaled by 1e5: catches absolute SD tolerance',
  studies: berkey.studies.map(s => ({ y: s.y.map(v => v * c), S: s.S.map(row => row.map(v => v * c * c)) })) });
module.exports = { controls };
if (require.main === module) {
  fs.writeFileSync(path.join(__dirname, 'mutation-controls.json'), JSON.stringify(controls, null, 2) + '\n');
  console.log(`${controls.length} mutation controls written`);
}
