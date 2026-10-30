// Read-only numerical replay; this does not claim browser geometry/text coverage.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import harness from './input-harness.cjs';
import loo from '../validate/loo/replay.cjs';
const app = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, app), 'utf8'));
const before = join(tmpdir(), 'p12-r5-before.html');
const after = fileURLToPath(new URL('index.html', app));
const plusUI = fileURLToPath(new URL('plus-ui.js', app));
let hashes = 0;
for (const path of ['validate/MANIFEST.json', 'validate/MANIFEST-plus.json', 'validate/loo/MANIFEST.json']) {
  const manifest = read(path);
  const base = path.includes('/loo/') ? new URL('validate/loo/', app) : app;
  for (const item of manifest.files) {
    const data = readFileSync(new URL(item.path, base));
    assert.equal(data.length, item.bytes, item.path);
    assert.equal(createHash('sha256').update(data).digest('hex'), item.sha256, item.path);
    hashes++;
  }
}
const primary = read('validate/corpus/corpus.json'), primaryRefs = read('validate/corpus/reference.json');
const plus = read('validate/plus/corpus.json'), plusRefs = read('validate/plus/reference.json');
const deletions = read('validate/loo/corpus.json');
assert.equal(primary.length, 169);
assert.equal(plus.length, 169);
assert.equal(deletions.length, 165);
const text = c => c.te.map((t, i) => `${t}, ${c.se[i]}`).join('\n');
const scalar = ['k','fe_est','fe_se','fe_ci_lo','fe_ci_hi','re_est','re_se','re_ci_lo','re_ci_hi',
  'tau2_dl','tau_dl','limit_est','limit_se','limit_ci_lo','limit_ci_hi','slope','alpha_r','beta_r',
  'Q','Q_small','Q_resid','G_squared'];
function comparisons() {
  const result = {checks: 0, passed: 0, failures: [], maxima: {}};
  return {result, check(id, field, actual, reference, tolerance = 1e-9) {
    result.checks++;
    let ok = actual === reference;
    if (typeof reference === 'number') {
      const diff = Number.isFinite(actual) ? Math.abs(actual - reference) / Math.max(1, Math.abs(reference)) : Infinity;
      ok = Number.isFinite(diff) && diff <= tolerance;
      if (!result.maxima[field] || diff > result.maxima[field].diff)
        result.maxima[field] = {diff, id, actual, reference};
    }
    if (ok) result.passed++;
    else result.failures.push({id, field, actual, reference, tolerance});
  }};
}
function flatten(methods) {
  const out = {};
  for (const [name, m] of Object.entries(methods)) {
    out[name + '.status'] = m.status;
    if (m.status === 'refused') out[name + '.reason'] = m.reason;
    else {
      if (m.branch) out[name + '.branch'] = m.branch;
      for (const [field, value] of Object.entries(m.values)) {
        const key = name + '.' + field;
        if (Array.isArray(value)) {
          out[key + '.length'] = value.length;
          value.forEach((v, i) => { out[key + '.' + i] = v; });
        } else out[key] = value;
      }
    }
  }
  return out;
}
const summaries = {scope: 'Numerical exports only; no browser table, text or geometry checks', hashes};
for (const [phase, page] of [['before', before], ['after', after]]) {
  const h = harness.load(page, plusUI), p = comparisons(), s = comparisons();
  for (let i = 0; i < primary.length; i++) {
    const c = primary[i], r = primaryRefs[i];
    assert.equal(c.id, r.id);
    const a = h.run(text(c));
    p.check(c.id, 'status', a ? 'ok' : 'refused', r.status);
    if (r.status === 'ok') {
      for (const field of scalar) p.check(c.id, field, a?.[field], r.values[field]);
      p.check(c.id, 'te_limit_length', a?.te_limit.length, r.values.te_limit.length);
      r.values.te_limit.forEach((v, j) => p.check(c.id, 'te_limit', a?.te_limit[j], v));
    }
  }
  for (let i = 0; i < plus.length; i++) {
    const c = plus[i], r = plusRefs[i];
    assert.equal(c.id, r.id);
    const a = flatten(h.window.AlmLimitPlus.compute(c, h.run(text(c))));
    const expected = flatten(r.methods);
    s.check(c.id, 'field_coverage', JSON.stringify(Object.keys(a).sort()), JSON.stringify(Object.keys(expected).sort()));
    for (const [field, ref] of Object.entries(expected)) {
      const tol = field.startsWith('selection.') ? (/\.(se|ciLo|ciHi)$/.test(field) ? 1e-4 : 1e-6) : 1e-9;
      s.check(c.id, field, a[field], ref, tol);
    }
  }
  const lh = loo.load({page}), out = [], errors = [];
  for (const c of deletions) {
    const rows = c.te.map((te, i) => ({te, se: c.se[i], label: 'Study ' + (i + 1)}));
    try {
      const result = lh.window.AlmLimitLoo.compute(rows);
      for (const row of result.rows) out.push({id: c.id, k: rows.length, ...row});
    } catch (error) { errors.push({id: c.id, reason: error.message}); }
  }
  const looPath = join(tmpdir(), `p12-r5-loo-${phase}.json`);
  writeFileSync(looPath, JSON.stringify(out));
  summaries[phase] = {sourceSha256: createHash('sha256').update(readFileSync(page)).digest('hex'),
    primary: p.result, sensitivity: s.result,
    loo: {rows: out.length, refused: out.filter(x => x.status === 'refused').length, errors, output: looPath}};
  const compact = r => ({checks: r.checks, passed: r.passed, failureCount: r.failures.length,
    failures: r.failures.slice(0, 15), limitMaxima: Object.fromEntries(Object.entries(r.maxima).filter(([k]) => k.startsWith('limit')))});
  console.log(JSON.stringify({phase, hashes, primary: compact(p.result), sensitivity: compact(s.result), loo: summaries[phase].loo}, null, 2));
}
const destination = join(tmpdir(), 'p12-r5-numerical-replay.json');
writeFileSync(destination, JSON.stringify(summaries, null, 2));
console.log('Complete numerical replay:', destination);
