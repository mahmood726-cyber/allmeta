// grade-sof "Load pooled" effect-type contract (lane audit4). A pooled result on the
// ma-pooled-v1 bus that does not name its measure must not be relabelled. Before the fix,
// outcomeFromPooled() turned every such linear-scale result into "MD" and every ratio-scale
// one into "RR": Forest Plot's default example (a log odds ratio, pooled -0.198) and the BCG
// log risk ratio (-0.715) both appeared in the SoF table as "MD ...".
// The numbers themselves are carried verbatim (checked here against the Forest Plot values,
// which match metafor rma(method = "PM", test = "adhoc"): -0.1980 [-0.3301, -0.0659]).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, text } from './helpers/page-vm.mjs';

function sofAfterLoad(results) {
  const p = loadPage('grade-sof/index.html', {
    shared: ['shared/ma-pooled-v1.js'],
    pick: s => s.includes('"grade-sof-v1"') && s.includes('function outcomeFromPooled'),
    storage: { 'ma-pooled-v1': JSON.stringify({ _schema: 'ma-pooled-v1', _savedAt: '2026-11-15T00:00:00Z', results }) },
  });
  p.fire('btn-load-pooled');
  return text(p.el('sof-host').innerHTML);
}

test('grade-sof: a pooled result with no measure is not labelled MD (forest-plot default, log OR)', () => {
  const sof = sofAfterLoad([{ pointEstimate: -0.19802265178207248, ciLo: -0.33013494582097835, ciHi: -0.06591035774316659,
    scale: 'linear', k: 6, model: 'random', label: 'Example meta-analysis (logOR)' }]);
  assert.match(sof, /Example meta-analysis \(logOR\)/, sof);
  assert.doesNotMatch(sof, /MD -0\.198/, 'unspecified measure relabelled as a mean difference');
  assert.match(sof, /measure not specified\)? -0\.198 \(95% CI -0\.3301 to -0\.06591\)/, sof);
});

test('grade-sof: a ratio-scale result with no measure is not labelled RR', () => {
  const sof = sofAfterLoad([{ pointEstimate: 0.4892, ciLo: 0.3299, ciHi: 0.7256, scale: 'ratio', k: 13, model: 'random', label: 'BCG' }]);
  assert.doesNotMatch(sof, /RR 0\.4892/, sof);
  assert.match(sof, /measure not specified\)? 0\.4892/, sof);
});

test('grade-sof: a named measure is kept', () => {
  const sof = sofAfterLoad([{ pointEstimate: 0.85, ciLo: 0.68, ciHi: 1.06, scale: 'ratio', measure: 'HR', k: 4, label: 'Mortality' }]);
  assert.match(sof, /HR 0\.85 \(95% CI 0\.68 to 1\.06\)/, sof);
});
