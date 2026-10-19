// Compare plus-engine.js PET/PEESE/conditional (full data and every leave-one-out omission) with the base-R lm() oracle.
// Run from the repository root: node pubbias-tests/validate/check-lm-petpeese.mjs [--plant]
// (--plant shifts one PEESE estimate by 1e-8 and must produce a FAIL).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'), refPath = join(root, 'pubbias-tests/validate/plus-corpus/petpeese-lm-reference.json'), mutate = process.argv.includes('--plant');
const html = readFileSync(join(root, 'pubbias-tests/index.html'), 'utf8');
const a = html.indexOf('// ---- Engine (unchanged from pre-retrofit) ----'), b = html.indexOf('// ---- axis state ----');
globalThis.__almPubBiasEngine = vm.runInThisContext('(function(){' + html.slice(a, b) + '\nreturn {parseTESE, trimFill, remlSlopeNeg, wls, parseBinary, eggerGeneric, beggMazumdar, petersTest, harbordTest, thompsonSharp};})')();
const P = createRequire(import.meta.url)(join(root, 'pubbias-tests/plus-engine.js'));
const corpus = JSON.parse(readFileSync(join(root, 'pubbias-tests/validate/corpus/corpus.json'), 'utf8')), ref = JSON.parse(readFileSync(refPath, 'utf8')).datasets;
let n = 0, pass = 0; const by = {}, fails = [];
const rel = (x, r) => Math.abs(x - r) / Math.max(1, Math.abs(r));
function chk(id, q, x, r, kind) {
  n++; let ok, d;
  if (kind === 'exact') { ok = x === r; d = ok ? 0 : 1; } else { d = kind === 'abs' ? Math.abs(x - r) : rel(x, r); ok = Number.isFinite(d) && d <= 1e-9; }
  const key = q.replace(/^loo\.\d+\./, 'loo.'); by[key] = by[key] || [0, 0, 0]; by[key][0]++; if (ok) by[key][1]++; by[key][2] = Math.max(by[key][2], Number.isFinite(d) ? d : Infinity);
  if (ok) pass++; else fails.push([id, q, x, r]);
}
for (const d of corpus) {
  const rows = d.yi.map((te, j) => ({ te, se: Math.sqrt(d.vi[j]) }));
  const binary = d.binary ? __almPubBiasEngine.parseBinary(d.binary.map(b => [b.e1, b.n1, b.e2, b.n2].join(',')).join('\n')) : null;
  const app = P.compute(rows, binary), R = ref[d.id];
  if (mutate && d.id === 'dat.bcg/OR:tpos:cpos') app.full.peese.values.est += 1e-8;
  for (const m of ['pet', 'peese']) {
    const x = app.full[m], r = R.full[m];
    if (x.status !== 'ok' || r.error) { chk(d.id, 'full.' + m + '.refusal', x.status === 'ok' ? 'ok' : x.reason, r.error || 'ok', 'exact'); continue; }
    for (const [qa, qr] of [['est', 'est'], ['se', 'se'], ['t', 't'], ['ciLo', 'ci_lb'], ['ciHi', 'ci_ub'], ['slope', 'slope'], ['slopeT', 'slope_t'], ['df', 'df']]) chk(d.id, 'full.' + m + '.' + qa, x.values[qa], r[qr], qa === 'df' ? 'exact' : 'rel');
    for (const [qa, qr] of [['p', 'p'], ['slopeP', 'slope_p']]) chk(d.id, 'full.' + m + '.' + qa, x.values[qa], r[qr], 'abs');
  }
  const c = app.full.conditional, rc = R.full.conditional;
  if (c.status !== 'ok' || rc.error) chk(d.id, 'full.conditional.refusal', c.status === 'ok' ? 'ok' : c.reason, rc.error || 'ok', 'exact');
  else { chk(d.id, 'full.conditional.branch', c.values.branch, rc.branch, 'exact'); for (const [qa, qr] of [['est', 'est'], ['ciLo', 'ci_lb'], ['ciHi', 'ci_ub']]) chk(d.id, 'full.conditional.' + qa, c.values[qa], rc[qr], 'rel'); }
  if (R.loo) {
    if (app.loo.status !== 'ok') { chk(d.id, 'loo.refusal', app.loo.reason, 'ok', 'exact'); continue; }
    R.loo.forEach((r, i) => {
      const x = app.loo.values.rows[i + 1];
      chk(d.id, 'loo.' + (i + 1) + '.pet.est', x.pet.values.est, r.pet, 'rel');
      chk(d.id, 'loo.' + (i + 1) + '.peese.est', x.peese.values.est, r.peese, 'rel');
      chk(d.id, 'loo.' + (i + 1) + '.branch', x.conditional.status === 'ok' ? x.conditional.values.branch : x.conditional.reason, r.branch ?? 'refused', 'exact');
    });
  }
}
console.log(`PET-PEESE vs base-R lm oracle: ${pass}/${n} checks pass`);
for (const [k, v] of Object.entries(by).sort()) console.log('  ' + k.padEnd(28), v[1] + '/' + v[0], 'max', v[2].toExponential(2));
for (const f of fails.slice(0, 10)) console.log('FAIL', JSON.stringify(f));
