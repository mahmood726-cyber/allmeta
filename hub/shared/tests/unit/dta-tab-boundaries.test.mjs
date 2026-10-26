import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../../../dta-sroc/index.html', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('    const COUNT_FIELDS'), html.indexOf('    // Per-study points')), ctx);
const parse = (text, mode = '') => JSON.parse(JSON.stringify(ctx.parseStudies(text, mode)));

test('DTA rejects trailing empty tab columns atomically in both covariate modes', () => {
  for (const mode of ['', 'last']) {
    const suffix = mode ? '\t2' : '';
    const good = 'Good\t80\t12\t20\t88' + suffix;
    for (const extra of ['\t', '\t\t', '\t  ']) {
      const result = parse(good + '\nBad\t60\t10\t40\t90' + suffix + extra, mode);
      assert.deepEqual(result.studies, [], JSON.stringify({ mode, extra }));
      assert.match(result.warnings.join(' '), /Analysis blocked.*Line 2: expected label and exactly/);
    }
  }
});

test('DTA cannot turn a leading empty tab label into shifted patient counts', () => {
  for (const mode of ['', 'last']) {
    const suffix = mode ? '\t2' : '';
    const result = parse('Good\t80\t12\t20\t88' + suffix + '\n\t80\t12\t20\t88\t150' + suffix, mode);
    assert.deepEqual(result.studies, [], mode);
    assert.match(result.warnings.join(' '), /Analysis blocked.*Line 2: expected label and exactly/);
  }
});

test('DTA tab controls retain padded fields, quoted labels, comments and covariates', () => {
  for (const mode of ['', 'last']) {
    const suffix = mode ? '\t group A ' : '';
    const result = parse('  # comment\r\n  \r\n\t\r\n  "Study, A" \t 80 \t12\t20\t88  ' + suffix, mode);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.studies, [{ label: 'Study, A', tp: 80, fp: 12, fn: 20, tn: 88, cov: mode ? 'group A' : null }]);
    const missingLabel = parse('\t80\t12\t20\t88' + suffix, mode);
    assert.deepEqual(missingLabel.studies, []);
    assert.ok(missingLabel.warnings.length);
  }
});
