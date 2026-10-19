#!/usr/bin/env node
// Offline replay of the pinned exact-enumeration references (no browser):
//   node gosh/validate/exact/replay.cjs [--plant drop|weight]
// 1. verifies SHA-256 and byte counts of corpus.json, reference-r.json and reference-metafor.json against MANIFEST-exact.json;
// 2. runs gosh/exact-enum.js on every configuration x model and compares with BOTH references (compare.js rules);
// 3. prints "<passed>/<checks>" per reference and exits 1 on any failure or count mismatch with the manifest.
// --plant drop   : removes one subset (the full set) from every app result before comparing  -> must FAIL
// --plant weight : multiplies the first study's SE by (1 + 1e-6) before running the engine   -> must FAIL
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const here = __dirname;
const E = require(path.join(here, '..', '..', 'exact-enum.js'));
const C = require(path.join(here, 'compare.js'));
const plant = (process.argv.indexOf('--plant') >= 0) ? process.argv[process.argv.indexOf('--plant') + 1] : null;
if (plant && !['drop','weight','grid'].includes(plant)) throw Error('unknown planted defect');
const output = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'MANIFEST-exact.json'), 'utf8'));
const loaded = {};
for (const f of manifest.files) {
  const bytes = fs.readFileSync(path.join(here, f.path));
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha !== f.sha256 || bytes.length !== f.bytes) { console.error('HASH MISMATCH', f.path, sha, bytes.length); process.exit(1); }
  loaded[f.path] = JSON.parse(bytes.toString('utf8'));
}
const corpus = loaded['corpus.json'];
const byId = new Map(corpus.configurations.map(c => [c.id, c]));
if (byId.size !== 17 || corpus.models.join(',') !== 'FE,DL') throw Error('exact corpus coverage mismatch');
for (const file of ['reference-r.json','reference-metafor.json']) {
  const wanted = corpus.configurations.filter(c => file === 'reference-r.json' || c.k <= loaded[file].max_k).flatMap(c => corpus.models.map(m => c.id+'|'+m));
  const actual = loaded[file].results.map(r => r.id+'|'+r.model);
  if (new Set(actual).size !== wanted.length || actual.length !== wanted.length || wanted.some(k => !actual.includes(k))) throw Error('reference coverage mismatch '+file);
}

// Remove one subset (mask = all studies) from an engine result, adjusting every streamed summary consistently.
function dropFullSet(app, te, se, model) {
  const k = te.length, e = E.createEngine(te, se, model);
  const [est, I2, Q, tau2] = e.fit(2 ** k - 1);
  const r = JSON.parse(JSON.stringify(app)), N = r.n_subsets;
  r.n_subsets = N - 1;
  r.mean_est = (r.mean_est * N - est) / (N - 1); r.mean_i2 = (r.mean_i2 * N - I2) / (N - 1); r.mean_q = (r.mean_q * N - Q) / (N - 1);
  if (model === 'DL') r.mean_tau2 = (r.mean_tau2 * N - tau2) / (N - 1);
  const g = r.grid, ix = Math.min(g.nx - 1, Math.max(0, Math.floor((est - g.x0) * (g.nx / (g.x1 - g.x0))))), iy = Math.min(g.ny - 1, Math.max(0, Math.floor(I2 * (g.ny / 100))));
  g.counts[iy * g.nx + ix] -= 1;
  if (I2 === 0) r.zero_i2 -= 1;
  r.per_study.forEach(p => { p.with_mean = (p.with_mean * p.with_n - est) / (p.with_n - 1); p.with_i2 = (p.with_i2 * p.with_n - I2) / (p.with_n - 1); p.with_n -= 1; });
  return r;
}

let exitCode = 0; const summary = {}, runs = [];
const appCache = new Map();
for (const refFile of ['reference-r.json', 'reference-metafor.json']) {
  const ref = loaded[refFile]; let checks = 0, passed = 0, maxDiff = 0; const failures = [], quantities = {};
  for (const r of ref.results) {
    const c = byId.get(r.id); if (!c) { console.error('unknown id', r.id); process.exit(1); }
    const se = plant === 'weight' ? c.se.map((x, i) => i === 0 ? x * (1 + 1e-6) : x) : c.se;
    const key = r.id + '|' + r.model;
    let app = appCache.get(key);
    if (!app) { const t = performance.now(); app = E.run(c.te, se, r.model); app.node_wall_ms = performance.now()-t; appCache.set(key, app); }
    const used = plant === 'drop' ? dropFullSet(app, c.te, se, r.model) : plant === 'grid' ? structuredClone(app) : app;
    if (plant === 'grid') { const a = used.grid.counts.findIndex(n=>n>0), b = used.grid.counts.findIndex(n=>n===0); [used.grid.counts[a],used.grid.counts[b]]=[used.grid.counts[b],used.grid.counts[a]]; }
    const x = C.compare(used, r);
    checks += x.checks; passed += x.passed; maxDiff = Math.max(maxDiff, x.maxNormDiff);
    failures.push(...x.failures.slice(0, 3));
    for (const [q,v] of Object.entries(x.quantities)) { const s=quantities[q] ||= {checks:0,passed:0,maxNormDiff:0,maxAbsDiff:0}; s.checks+=v.checks;s.passed+=v.passed;s.maxNormDiff=Math.max(s.maxNormDiff,v.maxNormDiff);s.maxAbsDiff=Math.max(s.maxAbsDiff,v.maxAbsDiff); }
    runs.push({reference:refFile,id:r.id,model:r.model,k:c.k,subsets:app.n_subsets,node_wall_ms:app.node_wall_ms,oracle_seconds:r.gosh_seconds ?? r.seconds,passed:x.passed,checks:x.checks,gridMoved:x.gridMoved,failures:x.failures});
    console.log(refFile, r.id, r.model, 'k=' + c.k, x.passed + '/' + x.checks, 'max norm diff', x.maxNormDiff.toExponential(2), 'app ms', app.timing.main_ms + app.timing.quantile_ms);
  }
  const expected = manifest.checks[refFile];
  summary[refFile] = { passed, checks, expected, maxNormDiff: maxDiff, quantities, failuresSample: failures.slice(0, 5) };
  console.log('RESULT', refFile, passed + '/' + checks, '(manifest ' + expected + ')', 'max normalised diff', maxDiff.toExponential(2));
  if (passed !== checks || checks !== expected) exitCode = 1;
}
console.log(JSON.stringify({ plant, summary }));
if(output) fs.writeFileSync(output,JSON.stringify({plant,summary,runs},null,2)+'\n');
process.exit(exitCode);
