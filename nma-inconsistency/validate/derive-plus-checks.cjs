// Execute the shipped plus replay (plus-adapter.js) outside the browser to derive the
// check cardinality pinned in MANIFEST-plus.json (as the v1 builder does for 4,627).
// The page engine is the inline engine source of index.html; no DOM is needed.
//   node nma-inconsistency/validate/derive-plus-checks.cjs [--tamper]
// --tamper multiplies one reference tau2 by (1 + 1e-6) and re-pins it in memory: the replay must then fail.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const app = path.resolve(__dirname, '..'), tamper = process.argv.includes('--tamper');
const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const c = { console, setTimeout, TextDecoder, crypto: globalThis.crypto, Uint8Array, ArrayBuffer, document: { getElementById: () => null } };
c.window = c; c.self = c; vm.createContext(c);
vm.runInContext(html.slice(html.indexOf('var Z975'), html.indexOf('let _lastInco')), c);
for (const f of ['plus-core.js', 'validate/manifest-plus.js', 'validate/plus-adapter.js']) vm.runInContext(fs.readFileSync(path.join(app, f), 'utf8'), c, { filename: f });
const M = c.AlmIncoPlusManifest, loaded = {};
for (const f of M.files) loaded[f.path] = new Uint8Array(fs.readFileSync(path.join(app, f.path)));
if (tamper) {
  const ref = JSON.parse(Buffer.from(loaded['validate/plus/reference.json']).toString('utf8'));
  const d = ref.cases.find(x => x.full.model !== 'FE').drops.find(d => d.fit.status === 'ok');
  console.log('TAMPER', d.drop, 'tau2', d.fit.tau2, '->', d.fit.tau2 * (1 + 1e-6)); d.fit.tau2 *= 1 + 1e-6;
  const bytes = Buffer.from(JSON.stringify(ref), 'utf8'); loaded['validate/plus/reference.json'] = new Uint8Array(bytes);
  M.files.find(f => f.path === 'validate/plus/reference.json').sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
}
c.AlmIncoPlusAdapter.corpus.run(loaded).then(r => {
  console.log(`PLUS NODE REPLAY ${r.passed}/${r.checks} groups ${JSON.stringify(r.groups)} boundary ${r.boundary.length} ${JSON.stringify(r.boundary)}`);
  console.log('MAXIMA ' + JSON.stringify(r.maxima));
  for (const f of r.failed.slice(0, 10)) console.log('FAIL ' + JSON.stringify(f));
  process.exitCode = r.passed === r.checks ? 0 : 1;
}, e => { console.log('REPLAY ERROR ' + e.message); process.exitCode = 2; });
