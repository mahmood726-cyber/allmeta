// Node/linkedom replay of the multivariate-ma page + plus panel over the pinned plus corpus.
// Executes every script the page ships (engine, plus.js, inline page script, plus-ui.js, validation
// contract/adapter) in one VM context, verifies the SHA-256 pins, then runs the same contract the
// browser panel runs, including the displayed-string audit of the rendered tables.
// Usage: node run-plus-node.cjs [evidence-out.json]     (requires the npm package linkedom)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { parseHTML } = require('linkedom');
const here = __dirname, app = path.resolve(here, '..');
const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const { window, document } = parseHTML(html);
window.matchMedia = () => ({ matches: false });
const ctx = vm.createContext({ window, document, console, matchMedia: window.matchMedia, setTimeout, clearTimeout, URL, Blob: function () {}, navigator: {}, performance: { now: () => Date.now() } });
window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
const executed = [];
for (const s of document.querySelectorAll('script')) {
  const src = s.getAttribute('src');
  if (src && /alm-validate\.js$|a11y-landmarks\.js$/.test(src)) { executed.push(src + ' (skipped: browser widget)'); continue; }
  const code = src ? fs.readFileSync(path.join(app, src), 'utf8') : s.textContent;
  vm.runInContext(code, ctx, { filename: src || 'index.html:inline' }); executed.push(src || 'inline');
}
const manifest = window.AlmMvPlusManifest;
if (!manifest) throw new Error('plus-pins.js did not define AlmMvPlusManifest');
const loaded = {};
for (const f of manifest.files) {
  const bytes = fs.readFileSync(path.join(app, f.path));
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha !== f.sha256 || bytes.length !== f.bytes) throw new Error('SHA-256/size mismatch: ' + f.path);
  loaded[f.path] = JSON.parse(bytes.toString('utf8'));
}
const corpus = loaded[manifest.files[0].path], ref = loaded[manifest.files[1].path];
const t0 = Date.now();
const r = window.AlmMvPlusContract.replay(corpus, ref, window.AlmMvPlus, { display: window.AlmMvPlusDisplay });
const byQ = {};
for (const f of r.failed) byQ[f.quantity] = (byQ[f.quantity] || 0) + 1;
const ev = { schema: 'multivariate-ma-plus-node-evidence-v1', node: process.version, linkedom: require('linkedom/package.json').version, executed,
  manifestChecks: manifest.checks, checks: r.checks, passed: r.passed, failedChecks: r.failedChecks, failedByQuantity: byQ, failed: r.failed,
  adjudicated: r.adjudicated, appPolish: r.appPolish, logLikComparison: r.logLikComparison, maxima: r.maxima, seconds: (Date.now() - t0) / 1000 };
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(ev, null, 1) + '\n');
console.log('PLUS NODE REPLAY', r.passed + '/' + r.checks, 'passed;', r.failedChecks, 'failed; manifest', manifest.checks, '; adjudicated fits', r.adjudicated.length, '; seconds', ev.seconds);
console.log('logLik app>R by >1e-10:', r.logLikComparison.appHigherBy1e10, ' R>app by >1e-10:', r.logLikComparison.refHigherBy1e10, ' max |dlogLik|', r.logLikComparison.maxAbsDiff);
console.log('failed by quantity', JSON.stringify(byQ));
console.log('maxima', JSON.stringify(r.maxima));
if (r.checks !== manifest.checks) { console.log('FAIL: check count differs from manifest'); process.exit(2); }
process.exit(r.failedChecks ? 1 : 0);
