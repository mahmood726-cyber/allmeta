// Extracts OUTCOME_DICTIONARY, BASELINE_COVARIATE_MAP, mapOutcomeToStandard and parseBaselineCharacteristics
// verbatim from one Pairwiseai build (argv[2], path relative to Pairwiseai/) and runs them in a Node vm on the
// cases given as JSON on stdin: {outcomes: [name, ...], baseline: [name, ...]}. Prints, per outcome name, the
// {key, confidence} the page assigns, and per baseline name the covariate key it is stored under (null = unmapped).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', process.argv[2]), 'utf8');
function grab(re) {
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + re);
  let d = 0, i = src.indexOf('{', m.index);
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(m.index, k + 1);
  }
  throw new Error('unbalanced: ' + re);
}
const code = [
  'var ' + grab(/OUTCOME_DICTIONARY\s*=\s*\{/) + ';',
  'var ' + grab(/BASELINE_COVARIATE_MAP\s*=\s*\{/) + ';',
  grab(/function mapOutcomeToStandard\(/),
  grab(/function parseBaselineCharacteristics\(/)
].join('\n');
const ctx = vm.createContext({ Object, Array, RegExp, String, Math, parseFloat, JSON });
vm.runInContext(code, ctx);
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = { outcomes: {}, baseline: {} };
for (const o of cases.outcomes) {
  const r = ctx.mapOutcomeToStandard(o);
  out.outcomes[o] = { key: r.key, confidence: r.confidence };
}
for (const b of cases.baseline) {
  const r = ctx.parseBaselineCharacteristics([{ name: b, value: 1 }]);
  const keys = Object.keys(r.baseline);
  out.baseline[b] = keys.length ? keys[0] : null;
}
process.stdout.write(JSON.stringify(out));
