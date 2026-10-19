// Node check of the #alm-plus extras against the pinned native R reference.
// Run from the repository root:  node pubbias-tests/validate/check-plus.mjs [--reference <file>] [--json <out>]
// The page's inline engine is extracted verbatim from pubbias-tests/index.html (the same code the browser runs),
// then plus-engine.js and plus-compare.js are loaded unchanged. The browser panel (plus-adapter.js) is authoritative;
// this is a fast offline mirror used during development and in tests.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
const here = dirname(fileURLToPath(import.meta.url)), app = join(here, '..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
export function loadPageEngine() {
  const html = readFileSync(join(app, 'index.html'), 'utf8');
  const a = html.indexOf('// ---- Engine (unchanged from pre-retrofit) ----'), b = html.indexOf('// ---- axis state ----');
  if (a < 0 || b < a) throw Error('Inline engine markers not found in index.html');
  const src = html.slice(a, b) + '\nreturn {parseTESE, trimFill, remlSlopeNeg, wls, parseBinary, eggerGeneric, beggMazumdar, petersTest, harbordTest, thompsonSharp};';
  return vm.runInThisContext('(function(){"use strict";' + src + '})')();
}
globalThis.__almPubBiasEngine = loadPageEngine();
const require = createRequire(import.meta.url);
const P = require(join(app, 'plus-engine.js')), C = require(join(here, 'plus-compare.js'));
export function run(reference, partial = false) {
  const corpus = JSON.parse(readFileSync(join(here, 'corpus', 'corpus.json'), 'utf8'));
  const refs = reference.datasets, E = globalThis.__almPubBiasEngine;
  const ts = JSON.parse(readFileSync(join(here, 'plus-corpus', 'thompson-sharp-reference.json'), 'utf8')).datasets;
  if (!partial && (corpus.length !== 152) || !partial && ( Object.keys(refs).length !== 152 || corpus.some(d => !refs[d.id]))) throw Error('Plus corpus coverage mismatch');
  const checks = [];
  for (const d of corpus) {
    if (partial && !refs[d.id]) continue;
    const rows = d.yi.map((te, j) => ({ te, se: Math.sqrt(d.vi[j]) }));
    const binary = d.binary ? E.parseBinary(d.binary.map(b => [b.e1, b.n1, b.e2, b.n2].join(',')).join('\n')) : null;
    checks.push(...C.compareConfig(d.id, P.compute(rows, binary), refs[d.id], d.binary || null));
    checks.push(...C.compareTS(d.id, E, rows, ts[d.id]));
  }
  return checks;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const refPath = arg('--reference') || join(here, 'plus-corpus', 'reference-plus.json');
  const checks = run(JSON.parse(readFileSync(refPath, 'utf8')), process.argv.includes('--partial'));
  const failed = checks.filter(c => !c.pass);
  const by = {};
  for (const c of checks) { const m = c.quantity.replace(/^loo\.(none|omit\d+)\./, 'loo.').replace(/^full\./, 'full.'); by[m] = by[m] || [0, 0, 0]; by[m][0]++; if (c.pass) by[m][1]++; by[m][2] = Math.max(by[m][2], Number.isFinite(c.diff) ? c.diff : 0); }
  console.log(JSON.stringify({ checks: checks.length, passed: checks.length - failed.length, failed: failed.length, documentedClass: failed.filter(f => f.cls).length }));
  for (const [k, v] of Object.entries(by).sort()) console.log(k.padEnd(34), v[1] + '/' + v[0], 'max', v[2].toExponential(2));
  for (const f of failed.slice(0, 60)) console.log('FAIL', f.id, f.quantity, JSON.stringify(f.app), JSON.stringify(f.ref), f.cls || '');
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify({ checks: checks.length, failed }, null, 1));
}
