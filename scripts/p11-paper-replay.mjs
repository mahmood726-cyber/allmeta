// Read-only numerical replay. UI/browser checks remain in validate-influence.spec.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const lf = text => text.replace(/\r\n/g, '\n');
const manifest = JSON.parse(read('influence/validate/MANIFEST.json'));
const loaded = [];
for (const file of manifest.files) {
  const bytes = Buffer.from(lf(read('influence/' + file.path)));
  assert.equal(bytes.length, file.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  loaded.push(JSON.parse(bytes));
}
const [corpus, references] = loaded;
assert.equal(corpus.length, manifest.configurations);
assert.equal(references.length, manifest.configurations);
const refs = new Map(references.map(record => [record.id, record.data]));
assert.equal(refs.size, references.length);
assert.equal(new Set(corpus.map(record => record.id)).size, corpus.length);
assert.deepEqual([...refs.keys()].sort(), corpus.map(record => record.id).sort());

// Reuse the exact original DOM-free page harness without changing its test file
// or executing its registered tests. All imports and harness logic stay intact.
const suite = read('hub/shared/tests/unit/p11-csv-labels.test.mjs');
const boundary = "for (const [name, newline] of [['LF', '\\n'], ['CRLF', '\\r\\n'], ['CR', '\\r']]) {";
assert.equal(suite.split(boundary).length, 2);
const rootDeclaration = "const root = new URL('../../../../', import.meta.url);";
assert.equal(suite.split(rootDeclaration).length, 2);
const moduleSource = suite.slice(0, suite.indexOf(boundary))
  .replace(rootDeclaration, `const root = new URL(${JSON.stringify(root.href)});`) + '\nexport { harness };';
const { harness } = await import('data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64'));
const { win } = harness();
let checks = 0, rows = 0;
const failed = [], maxima = {};
function compare(id, quantity, actual, expected, tolerance, nullable = false) {
  checks++;
  const numeric = Number.isFinite(actual) && Number.isFinite(expected);
  const diff = numeric ? Math.abs(actual - expected) / Math.max(1, Math.abs(expected)) : null;
  const pass = numeric ? diff <= tolerance : nullable && actual === null && expected === null;
  if (!pass) failed.push({ id, quantity, actual, expected, tolerance, diff });
  if (numeric) maxima[quantity.replace(/\.\d+$/, '')] = Math.max(maxima[quantity.replace(/\.\d+$/, '')] || 0, diff);
}
for (const { id, data: c } of corpus) {
  const r = refs.get(id), k = c.yi.length;
  rows += k;
  assert.equal(c.vi.length, k);
  win.__almRestore({ data: c.yi.map((v, i) => `${v}, ${Math.sqrt(c.vi[i])}, row${c.rows[i]}`).join('\n') });
  const f = win._almLastInfluence(), diag = win._almLastDiag();
  assert.equal(diag.length, k);
  for (const q of ['mu', 'seMu', 'tau2', 'Q', 'df']) compare(id, 'full.' + q, f[q], r.full[q], ['Q', 'df'].includes(q) ? 1e-9 : 1e-6);
  const weights = c.vi.map(v => 1 / (v + r.full.tau2));
  compare(id, 'full.swRE', f.swRE, weights.reduce((a, b) => a + b, 0), 1e-6);
  for (let i = 0; i < k; i++) {
    const d = diag[i];
    compare(id, 'full.wRE.' + i, f.wRE[i], weights[i], 1e-6);
    for (const [aq, rq] of [['loo_mu', 'estimate'], ['loo_seMu', 'se']]) compare(id, aq + '.' + i, d[aq], r.loo[rq][i], 1e-6, true);
    for (const [sign, q] of [[-1, 'ci.lb'], [1, 'ci.ub']]) compare(id, 'loo.' + q + '.' + i,
      d.loo_mu === null || d.loo_seMu === null ? null : d.loo_mu + sign * 1.959963984540054 * d.loo_seMu, r.loo[q][i], 1e-6, true);
    for (const [aq, rq] of [['resid', 'rstudent'], ['dffits', 'dffits'], ['cooksD', 'cook.d'], ['covRatio', 'cov.r'], ['hat', 'hat']]) compare(id, aq + '.' + i, d[aq], r.inf[rq][i], 1e-6, true);
    assert.equal(typeof d.influential, 'boolean');
    assert.equal(typeof r.flags[i], 'boolean');
    compare(id, 'flags.' + i, Number(d.influential), Number(r.flags[i]), 0);
    compare(id, 'weight.percent.' + i, 100 * f.wRE[i] / f.swRE, r.inf.weight[i], 1e-6);
    for (const q of ['x', 'y']) compare(id, 'baujat.REML.' + q + '.' + i, win.__almBaujat[q][i], r.baujat[q][i], 1e-6, true);
    for (const q of ['x', 'z', 'resid']) compare(id, 'radial.' + q + '.' + i, win.__almRadial[q][i], r.radial[q][i], 1e-9);
  }
  compare(id, 'radial.slope', win.__almRadial.slope, r.radial.slope, 1e-9);
}
assert.equal(rows, 9594);
assert.equal(checks, manifest.checks - 5 * manifest.configurations);
console.log(JSON.stringify({ node: process.version, referenceVersions: manifest.referenceVersions,
  configurations: corpus.length, rows, checks, passed: checks - failed.length, failed, maxima,
  excludedBrowserChecks: 5 * manifest.configurations,
  note: 'Stored R references; no fresh R execution. DOM-free numerical replay, not browser validation.' }, null, 2));
assert.deepEqual(failed, []);
