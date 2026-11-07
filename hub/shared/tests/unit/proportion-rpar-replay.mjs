// Read-only diagnostic replay; output belongs in runner logs outside wt.
import { readFileSync } from 'node:fs';
import { loadEngine, groups, differences } from './proportion-rpar-harness.mjs';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const input = read('../fixtures/proportion-rpar-input.json');
const ref = read('../fixtures/proportion-rpar-reference.json');
const app = loadEngine();
const failures = [];
let comparisons = 0;
for (const r of ref.fits) {
  const ca = input.cases.find(c=>c.id===r.case);
  const actual = app.run(ca.rows,r.transform,r.method);
  for (const group of r.status==='refused' ? ['refusal'] : Object.keys(groups)) {
    comparisons++;
    for (const f of differences(actual,r,group)) failures.push({id:r.id,group,...f});
  }
}
console.log(JSON.stringify({provenance:ref.provenance,configurations:ref.fits.length,comparisons,failures},null,2));
const corpus = read('../../../../proportion-ma/validate/corpus/corpus.json');
const archived = read('../../../../proportion-ma/validate/corpus/reference.json');
const entries = Object.entries(archived);
const count = predicate => corpus.filter(predicate).length;
console.log('EXISTING COVERAGE',JSON.stringify({
  datasets:corpus.length,configurations:entries.length,
  k0:count(c=>c.rows.length===0),k1:count(c=>c.rows.length===1),
  k2:count(c=>c.rows.length===2),k3:count(c=>c.rows.length===3),
  anyZero:count(c=>c.rows.some(r=>r.x===0)),anyTotal:count(c=>c.rows.some(r=>r.x===r.n)),
  allZero:count(c=>c.rows.length>0&&c.rows.every(r=>r.x===0)),
  allTotal:count(c=>c.rows.length>0&&c.rows.every(r=>r.x===r.n)),
  exactIdentical:count(c=>c.rows.length>=2&&c.rows.every(r=>r.x===c.rows[0].x&&r.n===c.rows[0].n)),
  maxN:Math.max(...corpus.flatMap(c=>c.rows.map(r=>r.n))),
  successful:entries.filter(([,r])=>r.status==='ok').length,
  tau2zero:Object.fromEntries(input.methods.map(m=>[m,entries.filter(([id,r])=>id.endsWith('|'+m)&&r.status==='ok'&&r.values.tau2===0).length]))
}));
// Report raw discrepancies and exit nonzero even for documented unit-suite
// TODOs. The diagnostic never converts a numerical mismatch into a pass.
if(failures.length) process.exitCode=1;
