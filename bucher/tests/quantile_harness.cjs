// Evaluates functions defined in a page's inline <script>s the way the page would see them: every ../shared/*.js
// script the page loads (page order) is run first, then each named function declaration is taken from the page
// source (the LAST declaration of that name, as in the browser) and called on the grid of quantile_r460.json.
// Usage: node fn_harness.cjs <page.html> name:kind ...   kind = pnorm | qnorm | qt | pt | qt975
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const page = path.resolve(process.argv[2]);
const html = fs.readFileSync(page, 'utf8');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'quantile_r460.json'), 'utf8'));
const ctx = vm.createContext({ Math, Number, isFinite, isNaN, Infinity, NaN, Object, Array, JSON, Error, console });
ctx.window = ctx; ctx.globalThis = ctx;
for (const m of html.matchAll(/<script src="\.\.\/shared\/([\w.-]+\.js)"><\/script>/g)) {
  const f = path.join(path.dirname(page), '..', 'shared', m[1]);
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
function lastDecl(name) {
  const re = new RegExp(String.raw`function\s+` + name + String.raw`\s*\(`, 'g');
  let m, at = -1;
  while ((m = re.exec(html))) at = m.index;
  if (at < 0) throw new Error('no function ' + name);
  let d = 0, i = html.indexOf('{', at);
  for (let k = i; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}' && --d === 0) return html.slice(at, k + 1); }
  throw new Error('unbalanced ' + name);
}
const out = {};
for (const spec of process.argv.slice(3)) {
  const [name, kind] = spec.split(':');
  vm.runInContext(lastDecl(name), ctx, { filename: name });
  const f = vm.runInContext(name, ctx);
  if (kind === 'pnorm') out[name] = R.x.map(x => f(x));
  else if (kind === 'qnorm') out[name] = R.p.map(p => f(p));
  else if (kind === 'qt') out[name] = R.df.map(d => R.p.map(p => f(p, d)));
  else if (kind === 'qt975') out[name] = R.df.map(d => f(d));
  else if (kind === 'pt') out[name] = R.df.map(d => R.x.map(x => f(x, d)));
  else throw new Error('kind ' + kind);
}
process.stdout.write(JSON.stringify(out));
