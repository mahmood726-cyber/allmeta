// C3 round trip, step 1: drive the page (Node/linkedom) through every plus-corpus configuration plus two
// extra input modes, run the default rho_w sweep, and save the page's exported R script and JSON export.
// Usage: node roundtrip-export.cjs <outdir>     (requires linkedom). Step 2: Rscript each <outdir>/scripts/*.R
// in its own directory; step 3: node roundtrip-compare.cjs <outdir>.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { parseHTML } = require('linkedom');
const out = path.resolve(process.argv[2] || 'roundtrip');
const app = path.resolve(__dirname, '..');
const { window, document } = parseHTML(fs.readFileSync(path.join(app, 'index.html'), 'utf8'));
window.matchMedia = () => ({ matches: false });
const ctx = vm.createContext({ window, document, console, matchMedia: window.matchMedia, setTimeout, clearTimeout, URL, Blob: function () {}, navigator: {} });
for (const s of document.querySelectorAll('script')) {
  const src = s.getAttribute('src'); if (src && /alm-validate\.js$|a11y-landmarks\.js$/.test(src)) continue;
  vm.runInContext(src ? fs.readFileSync(path.join(app, src), 'utf8') : s.textContent, ctx, { filename: src || 'inline' });
}
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'plus', 'corpus.json'), 'utf8'));
const P = window.AlmMvPage, UI = window.AlmMvPlusUI, q = id => document.getElementById(id);
const cases = corpus.configurations.map(c => ({ id: c.id, mode: 'cov', names: c.outcomes, text: c.rows.map(r => [String(r.label).replace(/,/g, ';'), r.y[0], r.v[0], r.y[1], r.v[1], r.cov].map(String).join(', ')).join('\n') }));
cases.push({ id: 'example::hyp::per-study-r', mode: 'r', names: ['SBP', 'DBP'], text: P.EXAMPLE_HYP });
cases.push({ id: 'example::berkey::assumed-rhoW-0.5', mode: 'rhoW', rhoW: '0.5', names: ['PD', 'AL'], text: P.EXAMPLE.split('\n').map(l => l.startsWith('#') ? l : l.split(', ').slice(0, 5).join(', ')).join('\n') });
fs.mkdirSync(path.join(out, 'scripts'), { recursive: true }); fs.mkdirSync(path.join(out, 'page'), { recursive: true });
const index = [];
cases.forEach((c, i) => {
  P.setMode(c.mode); if (c.rhoW) q('f-rhow').value = c.rhoW;
  q('f-data').value = c.text; q('f-o1').value = c.names[0]; q('f-o2').value = c.names[1]; P.run();
  if (UI.state().parsed.rows.length < 2) throw new Error('no rows for ' + c.id);
  UI.runSweep();
  const name = String(i + 1).padStart(3, '0');
  fs.mkdirSync(path.join(out, 'scripts', name), { recursive: true });
  fs.writeFileSync(path.join(out, 'scripts', name, 'analysis.R'), UI.rScript());
  fs.writeFileSync(path.join(out, 'page', name + '.json'), JSON.stringify(UI.resultsJSON()));
  index.push({ n: name, id: c.id, mode: c.mode, k: UI.state().parsed.rows.length, pageStatus: UI.state().res.status });
});
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1));
console.log('ROUNDTRIP EXPORT', index.length, 'cases;', index.filter(x => x.pageStatus === 'ok').length, 'page fits ok');
