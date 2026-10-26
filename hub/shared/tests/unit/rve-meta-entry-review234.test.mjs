import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
function load(names = '') {
  const nodes = { src: { value: 'previous inputs' }, 'f-rho': { value: '0.8' },
    'f-names': { value: names }, 'f-centre': { checked: false }, 'coef-body': { rows: [{}] } };
  let parsed, fit;
  const c = vm.createContext({ console, setTimeout });
  c.window = c;
  c.document = { getElementById: id => nodes[id] };
  c.AlmFeaturesState = { entryLog: [], provenance: [] };
  for (const file of ['shared/stats-qt.js', 'shared/rve.js', 'shared/rve-extras.js', 'rve-meta/alm-features.js']) {
    vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), c, { filename: file });
  }
  nodes['btn-run'] = { click() {
    parsed = c.AlmRVEExtras.parseStudies(nodes.src.value);
    fit = c.AlmRVE.fitCORR(parsed.rows, { rho: Number(nodes['f-rho'].value) });
    nodes['coef-body'].rows = [{}];
  } };
  return { c, nodes, apply: r => c.AlmRVEFeatures.entry.apply(r), parsed: () => parsed, fit: () => fit };
}
const rows = () => Array.from({ length: 8 }, (_, i) => ({ cluster: 'C' + i,
  yi: [0.3, 0.7, 0.4, 0.8, 0.2, 0.6, 0.5, 0.9][i], vi: 0.1, x1: i % 2 }));

test('RVE entry refuses an alias missing from the first row instead of dropping the moderator', () => {
  const h = load(), records = rows();
  delete records[0].x1;
  assert.throws(() => h.apply(records), /Moderator x1/);
  assert.equal(h.nodes.src.value, 'previous inputs');
});
test('RVE entry controls: complete aliases and genuinely intercept-only records fit', () => {
  const h = load();
  h.apply(rows());
  assert.equal(h.fit().p, 2);
  assert.deepEqual(Array.from(h.parsed().rows, r => r.X[1]), rows().map(r => r.x1));
  h.apply(rows().map(({ x1, ...r }) => r));
  assert.equal(h.fit().p, 1);
  assert.equal(h.fit().k_total, 8);
});
test('RVE entry preserves hash-prefixed cluster rows', () => {
  const h = load(), records = rows();
  records[0].cluster = '#C0';
  h.apply(records);
  assert.equal(h.fit().k_total, records.length);
  assert.equal(h.parsed().rows[0].cluster, '#C0');
});
test('RVE entry preserves literal quotes in cluster identities', () => {
  const h = load(), records = rows();
  records[0].cluster = '"C1"';
  h.apply(records);
  assert.equal(h.fit().m_clusters, 8);
  assert.equal(h.parsed().rows[0].cluster, '"C1"');
});
test('RVE entry controls: ordinary labels and named moderators retain rows and values', () => {
  const h = load('dose');
  h.apply(rows().map(({ x1, ...r }) => ({ ...r, dose: x1 })));
  assert.equal(h.fit().p, 2);
  assert.equal(h.fit().m_clusters, 8);
  assert.deepEqual(Array.from(h.parsed().rows, r => r.cluster), rows().map(r => r.cluster));
});
