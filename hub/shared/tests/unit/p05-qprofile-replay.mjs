// Read-only replay from wt/: node hub/shared/tests/unit/p05-qprofile-replay.mjs
// Same 131781 numerical comparisons/tolerances as heterogeneity/validate/adapter.js.
// This does not exercise browser rendering or its separate displayed-number audit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const sha = data => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(read('heterogeneity/validate/MANIFEST.json'));
for (const file of manifest.files) {
  const bytes = readFileSync(new URL(`heterogeneity/${file.path}`, root));
  assert.equal(bytes.length, file.bytes);
  assert.equal(sha(bytes), file.sha256);
}
const corpus = JSON.parse(read('heterogeneity/validate/corpus/corpus.json'));
const refs = JSON.parse(read('heterogeneity/validate/corpus/reference.json'));
const byID = new Map(refs.map(r => [r.analysis, r]));
assert.equal(corpus.length, manifest.analyses);
assert.equal(byID.size, corpus.length);

// Execute the actual page computation, stopping before UI event wiring/rendering.
const context = vm.createContext({ document: { getElementById: () => ({}) } });
context.window = context;
for (const file of ['shared/stats-qt.js', 'shared/ma-core.js', 'shared/heterogeneity-ci.js']) {
  vm.runInContext(read(file), context, { filename: file });
}
const inline = [...read('heterogeneity/index.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('window.__almHetCompute ='));
const end = 'window.__almHetCompute = function (text, chosen) { return computeAll(parseStudies(text).studies, chosen); };';
assert.ok(inline && inline.includes(end), 'page numerical entry point must be available unchanged');
vm.runInContext(inline.slice(0, inline.indexOf(end) + end.length) + '\n})();', context,
  { filename: 'heterogeneity/index.html (numerical prefix)' });

let checks = 0, configurations = 0, refused = 0, compared = 0;
const failed = [], maxima = { REL: 0, ABS: 0, EXACT: 0 };
const outputHash = createHash('sha256');
function check(id, quantity, actual, ref, kind = 'REL') {
  const diff = kind === 'EXACT' ? (actual === ref ? 0 : Infinity)
    : Math.abs(actual - ref) / (kind === 'REL' ? Math.max(1, Math.abs(ref)) : 1);
  checks++;
  maxima[kind] = Math.max(maxima[kind], diff);
  if (!Number.isFinite(diff) || diff > (kind === 'EXACT' ? 0 : 1e-9)) failed.push({ id, quantity, actual, ref, kind, diff });
}
for (const c of corpus) {
  const r = byID.get(c.id), a = context.__almHetCompute(c.text, 'pm'), s = a.sum, q = a.qpci, rc = r.common;
  assert.equal(a.k, c.k);
  for (const [name, av, rv, kind] of [
    ['k', a.k, rc.k, 'EXACT'], ['Q', s.Q, rc.Q, 'REL'], ['df', s.df, rc.df, 'EXACT'],
    ['p(Q)', s.pQ, rc.pQ, 'ABS'], ['I2', s.I2, rc.I2, 'ABS'],
    ['tau2 CI lower', q.tau2Lo, rc.tau2_lo, 'REL'], ['tau2 CI upper', q.tau2Hi, rc.tau2_hi, 'REL'],
    ['I2 CI lower', q.I2Lo, rc.I2_lo, 'ABS'], ['I2 CI upper', q.I2Hi, rc.I2_hi, 'ABS']
  ]) check(c.id, name, av, rv, kind);
  for (const key of ['pm', 'reml', 'ml', 'eb', 'sj', 'he', 'hs', 'dl']) {
    configurations++;
    const A = key === 'pm' ? a : context.__almHetCompute(c.text, key), R = r.configs[key], S = A.sum;
    assert.ok(R && !R.error);
    outputHash.update(JSON.stringify({ id: c.id, key, result: A }));
    const refRefused = R.refused === true || R.refused === 'true';
    check(c.id + '/' + key, 'refusal', !!A.dlRefused, refRefused, 'EXACT');
    if (refRefused || A.dlRefused) { refused++; continue; }
    compared++;
    const id = c.id + '/' + key;
    for (const [name, av, rv] of [
      ['tau2', A.tau2, R.tau2], ['mu', S.mu, R.mu], ['SE', S.se, R.se],
      ['CI lower (z)', S.ciLo, R.ci_lo], ['CI upper (z)', S.ciHi, R.ci_hi],
      ['HKSJ CI lower', S.ciLoHKSJ, R.hk_lo], ['HKSJ CI upper', S.ciHiHKSJ, R.hk_hi],
      ['PI lower', A.pi.lo, R.pi_lo], ['PI upper', A.pi.hi, R.pi_hi]
    ]) check(id, name, av, rv);
    assert.equal(A.loo.length, c.k); assert.equal(A.baujat.length, c.k);
    A.loo.forEach((l, i) => {
      for (const [name, av, rv, kind] of [
        ['LOO mu', l.mu, R.loo_mu[i], 'REL'], ['LOO CI lower', l.ciLo, R.loo_ci_lo[i], 'REL'],
        ['LOO CI upper', l.ciHi, R.loo_ci_hi[i], 'REL'], ['LOO I2', l.I2, R.loo_I2[i], 'ABS'],
        ['LOO tau2', l.tau2, R.loo_tau2[i], 'REL']
      ]) check(id + '/' + i, name, av, rv, kind);
    });
    A.baujat.forEach((b, i) => {
      check(id + '/' + i, 'Baujat x', b.x, R.baujat_x[i]);
      check(id + '/' + i, 'Baujat y', b.y, R.baujat_y[i]);
    });
  }
}
const outputSha256 = outputHash.digest('hex');
console.log(JSON.stringify({ sourceSha256: sha(read('shared/heterogeneity-ci.js')),
  outputSha256, checks, passed: checks - failed.length, failed: failed.slice(0, 20),
  maxima, configurations, refused, compared }, null, 2));
assert.equal(checks, manifest.paperChecks);
assert.equal(configurations, manifest.configurations);
assert.equal(refused, 28); assert.equal(compared, 676);
assert.equal(failed.length, 0, 'Published corpus retains its original values and 1e-9 tolerances');
// Recorded by the successful original-code replay after pass 1, before the fix.
assert.equal(outputSha256, '944019013e503bfac8b98e0b3c32ae5dd6521488d0fcaf8776f11f9bd62ca468',
  'Published corpus computation must remain identical to the observed original-code output');
