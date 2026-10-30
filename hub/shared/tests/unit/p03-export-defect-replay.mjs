// Run from wt/: node hub/shared/tests/unit/p03-export-defect-replay.mjs
// This reconstructs the reviewed omission; it is NOT a historical checkout.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lfInput, withReplayTree, runExportSuite, setInput } from './p03-replay-support.mjs';

withReplayTree(directory => {
  // Match CI's LF input bytes so the existing provenance control isolates
  // the export defect even before the separate CRLF fix is applied.
  setInput(directory, lfInput);
  const control = runExportSuite(directory);
  console.log('CURRENT APP CONTROL\n' + control.output);
  assert.equal(control.status, 0, control.output);
  assert.match(control.output, /# pass 14\b/);

  const path = join(directory, 'dta-sroc/index.html');
  let html = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  function replaceOnce(before, after) {
    assert.equal(html.split(before).length, 2, 'Plant must match exactly once: ' + before);
    html = html.replace(before, after);
  }
  replaceOnce('const b = a.bivar, mr = a.metareg, d = a.deeks, f = a.fagan;',
    'const b = a.bivar, mr = a.metareg;');
  replaceOnce('        deeks: d ? {\n          slope: r10(d.slope), intercept: r10(d.intercept), t: r10(d.t), df: d.df, p: r10(d.p),\n        } : null,\n        fagan: f ? { pre_prob: r6(f.preProb), post_pos: r6(f.postPos), post_neg: r6(f.postNeg) } : null,\n', '');
  replaceOnce('metareg: null, deeks: null, fagan: null, design: null',
    'metareg: null, deeks: null, design: null');
  replaceOnce('        if (out.bivar) out.fagan = B.fagan(out.bivar.lrPos, out.bivar.lrNeg, 0.20);\n', '');
  replaceOnce('if (fh) fh.innerHTML = a.fagan ? faganSvg(a.fagan) : "";',
    'if (fh) fh.innerHTML = b ? faganSvg(window.AlmDTABivariate.fagan(b.lrPos, b.lrNeg, 0.20)) : "";');
  writeFileSync(path, html);
  const planted = runExportSuite(directory);
  console.log('RECONSTRUCTED EXPORT OMISSION (expected assertion failures)\n' + planted.output);
  assert.equal(planted.status, 1, planted.output);
  const failed = [...planted.output.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]);
  assert.deepEqual(failed, [
    'downloaded JSON includes the displayed Deeks inference',
    'downloaded JSON includes the displayed Fagan probabilities',
    'Fagan export is available without drawing the nomogram',
    ...['csv', 'md', 'report-md', 'report-txt'].map(action => `${action} download includes both diagnostic objects`),
    'diagnostics follow changed data and estimation method',
    'unavailable diagnostics are explicit nulls after clearing the analysis',
  ].map(name => 'P03-R1 plant: ' + name));
  assert.match(planted.output, /# pass 5\b/);
  assert.match(planted.output, /# fail 9\b/);
  console.log('Replay verified: current 14/14 PASS; reconstructed omission 9 plant FAIL / 5 control PASS.');
});
