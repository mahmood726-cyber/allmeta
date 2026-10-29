// Read-only publication-data replay; all generated snapshots go to the OS temp directory.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import core from '../shared/ma-core.js';
import plus from '../correlation-ma/plus-core.js';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const baseline = join(tmpdir(), 'rev2-P17-f1-before.json');
const ref = JSON.parse(read('correlation-ma/validate/plus-corpus/reference-plus.json'));
const subset = JSON.parse(read('correlation-ma/validate/corpus/reference.json'));
const all = { main: [], sensitivity: [], loo: [] }, maxima = {};
let looRows = 0;
for (const inp of ref.inputs) {
  const data = plus.prepare(inp.studies);
  const sens = plus.sensitivity(inp.studies);
  all.sensitivity.push({ id: inp.id, result: sens });
  for (const m of plus.METHODS) {
    all.main.push({ id: inp.id, method: m, result: core.pool(data.z, data.v, { method: m, pi: true }) });
    for (const t of plus.TESTS) {
      const l = plus.leaveOneOut(inp.studies, m, t);
      looRows += l.rows?.length || 0;
      all.loo.push({ id: inp.id, method: m, test: t, result: l });
    }
  }
  for (const r of inp.sensitivity) {
    if (!r.app_applicable) continue;
    const a = plus.find(sens.cells, r.method, r.test);
    for (const f of ['mu_z', 'se_z', 'tau2_z', 'I2', 'Q', 'ciLo', 'ciHi', 'r', 'r_lo', 'r_hi', 'piLo', 'piHi']) {
      if (r[f] == null) continue;
      const d = Math.abs(a[f] - r[f]) / (f === 'I2' ? 100 : Math.max(1, Math.abs(r[f])));
      assert.ok(Number.isFinite(d), `${inp.id} ${r.method} ${f}`);
      maxima[f] = Math.max(maxima[f] || 0, d);
    }
  }
}
all.subset = subset.configurations.filter(r => r.status === 'ok').map(r => {
  const d = plus.prepare(r.studies);
  return { id: r.id, result: core.pool(d.z, d.v, { method: r.method, pi: true }) };
});
all.maxima = maxima;
const serialized = JSON.stringify(all);
console.log('P17_REPLAY_COUNTS', JSON.stringify({ inputs: ref.inputs.length, main: all.main.length,
  sensitivity: all.sensitivity.length * 12, looConfigs: all.loo.length, looRows, subsetAccepted: all.subset.length }));
console.log('P17_REPLAY_MAXIMA', JSON.stringify(maxima));
const example = ref.inputs.find(i => /builtin|built.in|example/i.test(i.id));
if (example) console.log('P17_EXAMPLE', JSON.stringify(all.main.filter(i => i.id === example.id)));
const outputHash = createHash('sha256').update(serialized).digest('hex');
console.log('P17_OUTPUT_SHA256', outputHash);
// Recorded by the pass-1 replay, before production edits. Never establish a
// replacement baseline from fixed code if the temporary snapshot is missing.
assert.equal(outputHash, '8511c3ed560d174725eddea9d28d9fe3dbbdb7356dddcfea089312d52af000dc',
  'Publication input results must match the recorded pre-fix SHA-256');
assert.ok(existsSync(baseline), 'The pre-fix publication snapshot must still be available');
const previous = readFileSync(baseline, 'utf8');
assert.ok(serialized === previous, 'Publication input results must remain byte-identical to the pre-fix snapshot');
console.log('P17_UNCHANGED: all captured publication inputs, example results and maxima are byte-identical');
for (const method of plus.METHODS) {
  try {
    const p = core.pool([Math.atanh(.2), Math.atanh(.2)], [1e-308, 1e-308], { method, pi: true });
    console.log('P17_HUGE', method, JSON.stringify(p, (_, v) => typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));
  } catch (e) { console.log('P17_HUGE', method, e.name, e.message); }
}
