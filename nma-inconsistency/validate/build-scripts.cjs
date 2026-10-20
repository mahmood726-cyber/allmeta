// Generate the plus panel's self-verifying R scripts for every accepted archived
// configuration (base script) and every accepted configuration with a closed loop
// (leave-one-out script), exactly as the page's "Download R script" buttons do.
// The engine is the page's own inline engine source; no DOM is needed.
//   node build-scripts.cjs <P16-validation-dir> <out-dir>
// Then run each script with Rscript --vanilla and record exit codes (see README-plus.md).
const fs = require('fs'), path = require('path'), vm = require('vm');
const [archive, out] = process.argv.slice(2);
if (!archive || !out) throw Error('usage: node build-scripts.cjs <P16-validation-dir> <out-dir>');
const app = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const c = {}; vm.createContext(c);
vm.runInContext(html.slice(html.indexOf('var Z975'), html.indexOf('let _lastInco')), c);
vm.runInContext(fs.readFileSync(path.join(app, 'plus-core.js'), 'utf8'), c);
const P = c.AlmIncoPlusCore, E = { inputIssue: c.inputIssue, estimateTau2: c.estimateTau2, fitNMA: c.fitNMA, nodeSplit: c.nodeSplit, dbt: c.dbt };
const quote = v => '"' + String(v).replace(/"/g, '""') + '"';
const corpus = JSON.parse(fs.readFileSync(path.join(archive, 'corpus.json'), 'utf8'));
fs.mkdirSync(out, { recursive: true });
const index = [];
corpus.forEach((x, i) => {
  const ref = JSON.parse(fs.readFileSync(path.join(archive, 'reference', String(i + 1).padStart(5, '0') + '.json'), 'utf8'));
  if (ref.status !== 'ok') return;
  // Rows go through the page parser, as pasted text would.
  const rows = c.parse(x.rows.map(r => [r.A, r.B, r.te, r.se, r.study].map(quote).join(',')).join('\n'));
  const base = P.fitAll(E, rows, x.model);
  if (base.status !== 'ok') throw Error('app refused an accepted configuration: ' + x.key);
  const id = String(i + 1).padStart(5, '0');
  const write = (name, text) => { fs.writeFileSync(path.join(out, name), text.replace(/\r?\n/g, '\n')); };
  write(id + '-base.R', P.buildRScript({ rows, base }, { date: 'validation' }));
  const entry = { key: x.key, archive_index: i + 1, model: x.model, k: rows.length, loops: ref.dbt.df > 0, base: id + '-base.R' };
  if (entry.loops) {
    const L = P.loo(E, rows, x.model);
    write(id + '-loo.R', P.buildRScript({ rows, loo: L }, { loo: true, date: 'validation' }));
    entry.loo = id + '-loo.R';
  }
  index.push(entry);
});
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1));
console.log(`SCRIPTS ${index.length} base + ${index.filter(e => e.loo).length} leave-one-out`);
