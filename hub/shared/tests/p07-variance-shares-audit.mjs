// Read-only numerical audit of the published P07 corpus. This is not a DOM,
// REML, or full 528-check validation replay; no corpus/reference files are written.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = new URL('../../../multilevel-ma/', import.meta.url);
const html = readFileSync(new URL('index.html', app), 'utf8');
const start = html.indexOf('    function fit(rows) {');
const end = html.indexOf('    // ---- axis state', start);
assert.ok(start >= 0 && end > start);
const source = html.slice(start, end);
const block = /      var wSamp = rows\.map[\s\S]*?(?=      var totalVar =)/;
assert.match(source, block);
const historical = `      var wSamp = rows.map(function (r) { return 1 / (r.se * r.se); });
      var sumWsamp = wSamp.reduce(function (a, b) { return a + b; }, 0);
      var sumW2samp = wSamp.reduce(function (a, b) { return a + b * b; }, 0);
      var denomSig = sumWsamp * sumWsamp - sumW2samp;
      var sigma2_typical = denomSig > 1e-12 ? ((rows.length - 1) * sumWsamp) / denomSig : 0;
`;
function load(code) {
  const context = vm.createContext({ window: {} });
  vm.runInContext(code, context);
  return context.fit;
}
const beforeFit = load(source.replace(block, historical)), afterFit = load(source);
const manifest = JSON.parse(readFileSync(new URL('validate/MANIFEST.json', app), 'utf8'));
for (const file of manifest.files) {
  // Manifest pins describe UTF-8 LF bytes, independent of checkout line endings.
  const bytes = Buffer.from(readFileSync(new URL(file.path, app), 'utf8').replace(/\r\n/g, '\n'), 'utf8');
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
}
const corpus = JSON.parse(readFileSync(new URL('validate/corpus/corpus.json', app), 'utf8'));
assert.equal(Object.keys(corpus).length, 44);
const shareKeys = ['I2_study', 'I2_within', 'I2_sampling'];
const report = { configurations: 44, shareChecks: 0, beforePassed: 0, afterPassed: 0,
  beforeMaxFormulaDifference: 0, afterMaxFormulaDifference: 0,
  maxShareChange: 0, displayedShareChanges: [], otherFitChanges: [], corpusHashesMatch: true };
for (const [name, input] of Object.entries(corpus)) {
  const rows = input.map(r => ({ study: String(r.cluster), te: r.y, se: Math.sqrt(r.v) }));
  const before = beforeFit(rows), after = afterFit(rows);
  // Identical reference expression and relative difference to validate/adapter.js.
  const w = input.map(r => 1 / r.v), sw = w.reduce((a, b) => a + b, 0);
  const typical = (w.length - 1) / (sw - w.reduce((a, b) => a + b * b, 0) / sw);
  for (const [label, fit] of [['before', before], ['after', after]]) {
    const total = fit.tau2_study + fit.tau2_within + typical;
    const expected = [fit.tau2_study / total, fit.tau2_within / total, typical / total];
    shareKeys.forEach((key, i) => {
      const diff = Math.abs(fit[key] - expected[i]) / Math.max(1, Math.abs(expected[i]));
      report[label + 'MaxFormulaDifference'] = Math.max(report[label + 'MaxFormulaDifference'], diff);
      if (Number.isFinite(diff) && diff <= 1e-9) report[label + 'Passed']++;
    });
  }
  for (const key of shareKeys) {
    report.shareChecks++;
    report.maxShareChange = Math.max(report.maxShareChange, Math.abs(after[key] - before[key]));
    if ((after[key] * 100).toFixed(1) !== (before[key] * 100).toFixed(1)) {
      report.displayedShareChanges.push({ name, key, before: before[key], after: after[key] });
    }
  }
  for (const key of Object.keys(before).filter(k => !shareKeys.includes(k))) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) report.otherFitChanges.push({ name, key });
  }
}
console.log(JSON.stringify(report, null, 2));
assert.equal(report.beforePassed, report.shareChecks);
assert.equal(report.afterPassed, report.shareChecks);
assert.deepEqual(report.displayedShareChanges, []);
assert.deepEqual(report.otherFitChanges, []);
