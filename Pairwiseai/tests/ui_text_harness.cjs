// Runs two UI text builders verbatim from one Pairwiseai build (argv[2], relative to Pairwiseai/) in a Node vm with a
// stub DOM, and prints the text they write. stdin JSON:
//   {summary: [k, ...]}  -> _updateDataSummary with k valid generic studies; returns the dataStatusAlert text per k
//   {card: {mode: "real"|"stub", stub: {...}, cases: [{trials, covariate, outcome}]}}
//                        -> runCovariateAdjustedUI (with covariateAdjustedAnalysis and, mode "real", metaRegression);
//                           returns the covariateResults text (tags stripped, entities decoded, whitespace collapsed)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', process.argv[2]), 'utf8');
function grabFn(name, optional) {
  const m = new RegExp('function ' + name + '\\(').exec(src);
  if (!m) { if (optional) return ''; throw new Error('not found: ' + name); }
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
// a tag starts with "<" + letter (or "</" + letter); "<5" is text to an HTML parser, so it must survive here too
const text = h => h.replace(/<\/?[A-Za-z][^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
function makeCtx(extra) {
  const els = {};
  const document = { getElementById: id => (els[id] = els[id] || { id, value: '', innerHTML: '', textContent: '', className: '' }) };
  const sanitizeHTML = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return { els, ctx: vm.createContext(Object.assign({ Object, Array, Math, JSON, isNaN, isFinite, Number, String, document,
    sanitizeHTML, alert: () => {}, STUB: {} }, extra)) };
}
const out = {};
if (input.summary) {
  out.summary = input.summary.map(k => {
    const { els, ctx } = makeCtx({});
    ctx.STUDIES = Array.from({ length: k }, (_, i) => ({ valid: true, name: 'S' + i }));
    vm.runInContext('var AppState = {settings: {dataType: "generic"}}; function getStudyData() { return STUDIES; }\n' +
      grabFn('_updateDataSummary'), ctx);
    ctx._updateDataSummary();
    return text(els.dataStatusAlert.innerHTML);
  });
}
if (input.card) {
  const c = input.card;
  out.card = c.cases.map(cs => {
    const { els, ctx } = makeCtx({});
    ctx.STUB = c.stub || {};
    ctx.TRIALS = cs.trials;
    let code = grabFn('covariateAdjustedAnalysis') + '\n' + grabFn('runCovariateAdjustedUI') + '\n' +
      grabFn('covariateCardValue', true);
    code += c.mode === 'real' ? '\n' + grabFn('metaRegression')
      : '\nfunction metaRegression() { return JSON.parse(JSON.stringify(STUB)); }';
    vm.runInContext('var AppState = {multiOutcome: {trials: TRIALS}};\n' + code, ctx);
    ctx.document.getElementById('covariateSelect').value = cs.covariate;
    ctx.document.getElementById('covOutcomeSelect').value = cs.outcome;
    try { ctx.runCovariateAdjustedUI(); } catch (e) { return 'THREW ' + e.message; }
    return text(els.covariateResults.innerHTML);
  });
}
process.stdout.write(JSON.stringify(out));
