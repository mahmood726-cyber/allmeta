// Read-only diagnosis; keep all production code and recorded R values intact.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const fixture = 'hub/shared/tests/fixtures/multilevel-ma-rpar/';
const input = JSON.parse(read(fixture + 'input.json'));
const reference = JSON.parse(read(fixture + 'reference.json'));
const source = read('shared/multilevel-reml.js');
const marker = 'var api = { fit: fit };';
assert.equal(source.split(marker).length, 2);
const context = vm.createContext({});
// Expose only the objective for diagnosis, using a private in-memory copy.
vm.runInContext(source.replace(marker,
  'var api = { fit: fit, objective: function(rows, w, b) { return _negLL(_byCluster(rows), w, b); } };'), context);
const engine = context.AlmMultilevelREML;
const cases = ['boundary_between', 'single_cluster'].map(id => {
  const rows = input.cases.find(c => c.id === id).rows;
  const recorded = reference.cases.find(c => c.id === id).reml;
  const app = engine.fit(rows);
  const differences = Object.fromEntries(Object.keys(recorded).map(key => [key, {
    app: app[key], R: recorded[key], absoluteError: Math.abs(app[key] - recorded[key])
  }]));
  const result = { id, differences };
  if (id === 'boundary_between') {
    const mean = rows.reduce((s, r) => s + r.y, 0) / rows.length;
    const analyticWithin = rows.reduce((s, r) => s + (r.y - mean) ** 2, 0) / (rows.length - 1) - rows[0].v;
    result.closedForm = { analyticWithin,
      appMinusAnalytic: app.sigma2Within - analyticWithin,
      RMinusAnalytic: recorded.sigma2Within - analyticWithin };
  } else {
    const centered = rows.map(r => ({ ...r, y: r.y - rows[0].y }));
    result.ridge = [0, app.sigma2Between, .01, 1].map(b => {
      const f = engine.objective(centered, app.sigma2Within, b);
      return { between: b, negLL: f.negLL, se: Math.sqrt(1 / f.infoMu) };
    });
    result.seVarianceInflation = app.se ** 2 - 1 / rows.reduce((s, r) => s + 1 / (r.v + app.sigma2Within), 0);
  }
  return result;
});
const sha256 = path => createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex');
const preservation = [];
for (const name of ['MANIFEST.json', 'MANIFEST-plus.json']) {
  const manifest = JSON.parse(read('multilevel-ma/validate/' + name));
  for (const f of manifest.files) {
    const path = 'multilevel-ma/' + f.path;
    const hash = sha256(path);
    // Some workspace snapshots normalize text line endings; report a mismatch
    // faithfully rather than rewriting published corpus bytes or pins.
    preservation.push({ path, matchesManifest: hash === f.sha256, sha256: hash, expected: f.sha256 });
  }
}
console.log(JSON.stringify({ sourceSha256: sha256('shared/multilevel-reml.js'), cases, preservation }, null, 2));
