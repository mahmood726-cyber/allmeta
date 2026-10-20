// Numerical replay of every pinned GOSH configuration through the actual page.
// This is not the browser's 876,760-check tier: DOM text/geometry needs Playwright.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const load = require('./input-harness.cjs');
const app = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(app, 'validate/MANIFEST.json')));
for (const file of manifest.files) {
  const bytes = fs.readFileSync(path.join(app, file.path));
  // Repository pins are LF-normalised (Windows checkouts may use CRLF).
  const lf = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
  assert.equal(crypto.createHash('sha256').update(lf).digest('hex'), file.sha256);
}
console.log('2/2 pinned corpus/reference hashes verified');
const corpus = JSON.parse(fs.readFileSync(path.join(app, 'validate/corpus/corpus.json')));
const refs = JSON.parse(fs.readFileSync(path.join(app, 'validate/corpus/reference.json')));
assert.equal(corpus.length, manifest.configurations);
assert.equal(refs.length, manifest.model_configurations);
const index = new Map(refs.map(r => [r.key, r]));
assert.equal(index.size, refs.length);
const h = load(process.env.GOSH_PAGE || path.join(app, 'index.html'));
let checks = 0, configs = 0;
function exact(a, b, label) { assert.equal(a, b, label); checks++; }
function near(a, b, label, percent = false) {
  assert.ok(Number.isFinite(a) && Number.isFinite(b), label + ': finite values');
  assert.ok(Math.abs(a - b) / (percent ? 100 : Math.max(1, Math.abs(b))) <= 1e-9, `${label}: ${a} vs ${b}`);
  checks++;
}
function keyed(points) {
  const counts = new Map();
  return new Map(points.map(p => {
    const member = [...p.members].sort((a,b) => a-b).join(',');
    const occurrence = counts.get(member) || 0;
    counts.set(member, occurrence + 1);
    return [member + '#' + occurrence, p];
  }));
}
for (const c of corpus) for (const model of ['FE', 'DL']) {
  const key = c.id + '::' + model, ref = index.get(key);
  assert.ok(ref, key);
  const text = c.te.map((te, i) => `${te}, ${c.se[i]}, S${i+1}`).join('\n');
  const actual = h.window.__almGoshValidationRun(text, model, '5000', {});
  if (c.k > 100) {
    exact(ref.refused, true, key + ' reference cap');
    exact(actual.summary, null, key + ' cap summary');
    exact(h.window._almLastGosh(), null, key + ' cap export');
    exact(actual.points.length, 0, key + ' cap points');
    exact(h.nodes.plot.innerHTML, '', key + ' cap plot');
    for (const id of ['m-n','m-est','m-i2']) exact(h.nodes[id].textContent, '\u2014', key + ' cap ' + id);
  } else {
    assert.ok(actual.summary && !ref.refused, key + ' accepted');
    exact(actual.summary.k, c.k, key + ' k');
    exact(actual.summary.model, model, key + ' model');
    exact(actual.summary.sampled, c.k > 15, key + ' sampling');
    const aa = keyed(actual.points), rr = keyed(ref.points);
    exact(aa.size, rr.size, key + ' point count');
    exact(JSON.stringify([...aa.keys()].sort()), JSON.stringify([...rr.keys()].sort()), key + ' membership coverage');
    for (const [membership, p] of aa) {
      const r = rr.get(membership);
      exact(p.k, r.k, key + ' subset k');
      for (const q of ['mu','I2','Q', ...(model === 'DL' && p.k > 1 ? ['tau2'] : []), ...(c.k > 15 ? ['se'] : [])]) {
        near(p[q], r[q], key + ' ' + membership + ' ' + q, q === 'I2');
      }
    }
    for (const [q, value] of Object.entries(ref.summary)) {
      if (q === 'n_subsets') exact(actual.summary[q], value, key + ' summary ' + q);
      else near(actual.summary[q], value, key + ' summary ' + q, q === 'median_i2');
    }
    exact((h.nodes.plot.innerHTML.match(/<circle /g) || []).length, ref.points.length, key + ' plotted count');
  }
  for (const id of ['plot-error','plot-note','sample-error']) exact(h.nodes[id].textContent, '', key + ' ' + id);
  configs++;
}
console.log(`${configs}/${manifest.model_configurations} model configurations; ${checks}/${checks} numerical/state checks passed`);
