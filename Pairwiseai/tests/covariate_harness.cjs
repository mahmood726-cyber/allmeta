// Extracts covariateAdjustedAnalysis (and, with mode "real", metaRegression) verbatim from one Pairwiseai build
// (argv[2], relative to Pairwiseai/) and runs it in a Node vm. stdin JSON: {mode: "real"|"stub", stub: {...}, cases:
// [{trials: [...], covariate, outcome}]}. mode "stub" replaces metaRegression by a function returning `stub` (so the
// interpretation branch can be driven without the tau2 / t-distribution helpers). Prints the returned objects.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', process.argv[2]), 'utf8');
function grabFn(name) {
  const m = new RegExp('function ' + name + '\\(').exec(src);
  if (!m) throw new Error('not found: ' + name);
  let p = 0, k = src.indexOf('(', m.index);
  for (; k < src.length; k++) {
    if (src[k] === '(') p++;
    else if (src[k] === ')' && --p === 0) break;
  }
  let d = 0;
  for (let j = src.indexOf('{', k); j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(m.index, j + 1);
  }
  throw new Error('unbalanced: ' + name);
}
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
let code = grabFn('covariateAdjustedAnalysis');
if (input.mode === 'real') code += '\n' + grabFn('metaRegression');
else code += '\nfunction metaRegression() { return JSON.parse(JSON.stringify(STUB)); }';
const ctx = vm.createContext({ Object, Array, Math, JSON, isNaN, isFinite, Number, String, STUB: input.stub || {} });
vm.runInContext(code, ctx);
const out = input.cases.map(c => {
  const r = ctx.covariateAdjustedAnalysis(c.trials, c.covariate, { outcome: c.outcome });
  return { available: r.available, interpretation: r.interpretation, warning: r.warning };
});
process.stdout.write(JSON.stringify(out));
