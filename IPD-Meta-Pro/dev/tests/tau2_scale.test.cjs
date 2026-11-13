'use strict';
// Stopping rules of the two-stage tau^2 solvers (MetaAnalysis.randomEffectsREML / ML / PM, the runAnalysis()
// path) must not depend on the units of the data: rescaling yi by c and vi by c^2 rescales tau^2 by c^2 and
// leaves z and p unchanged. Before the IPD-Small fix
//   * REML / ML Fisher scoring stopped at an ABSOLUTE change in tau^2 of 1e-10 (and the ll0 boundary check used
//     tau2 > 1e-10), so with variances near 1e-8 (c = 1e-4) it stopped after a few steps: ovarian_survival ML
//     tau^2 0 (R 2.49e-10), displayed p 0.053 (R 0.126); statin_cvd REML displayed p 0.069 (R 0.062);
//   * PM bisected to an ABSOLUTE bracket width of 1e-10 (c = 1e-4: statin_cvd p 0.092, R 0.088), inside an upper
//     bracket that stopped doubling at 1e6, so a PM tau^2 above max(DL, ~1e6) was returned as the bracket end
//     (c = 1e4: ovarian_survival tau^2 8628621.4031 = DL, R 16824501.6887; statin_cvd p 0.054, R 0.088).
// Reference: tau2_scale_reference.R (metafor 5.2.1 with scale-adjusted tight control) -> tau2_scale_reference.json.
//   node dev/tests/tau2_scale.test.cjs [path/to/ipd-meta-pro.html]
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'tau2_scale_reference.json'), 'utf8'));
const EX = JSON.parse(fs.readFileSync(path.join(__dirname, 'studies_examples.json'), 'utf8'));
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + '  [' + detail + ']'); };
const shownP = p => run('ipdDisplayP(' + p + ')');
for (const r of REF) {
  const yi = EX[r.name].yi.map(v => v * r.c), vi = EX[r.name].vi.map(v => v * r.c * r.c);
  sandbox.__y = yi; sandbox.__v = vi;
  const a = run('(function(){ var f = MetaAnalysis.randomEffects' + r.method + '(__y, __v); return { tau2: f.tau2, z: f.z, p: f.pValue }; })()');
  // tau^2 to 1e-7 of max(tau^2, mean vi): scale-free, and a boundary tau^2 near 0 is judged on the vi scale
  const vbar = vi.reduce((s, v) => s + v, 0) / vi.length;
  const okTau = Math.abs(a.tau2 - r.tau2) <= 1e-7 * Math.max(r.tau2, vbar);
  const okZ = Math.abs(a.z - r.z) <= 1e-7 * Math.abs(r.z);
  const label = r.name + ' ' + r.method + ' c=' + r.c;
  check(label + ': tau2 and z as R', okTau && okZ, 'page tau2 ' + a.tau2 + ' z ' + a.z + ' | R tau2 ' + r.tau2 + ' z ' + r.z);
  check(label + ': displayed tau2 (4 dp) and p as R', a.tau2.toFixed(4) === r.tau2.toFixed(4) && shownP(a.p) === shownP(r.p),
    'page ' + a.tau2.toFixed(4) + ' p ' + shownP(a.p) + ' | R ' + r.tau2.toFixed(4) + ' p ' + shownP(r.p));
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
