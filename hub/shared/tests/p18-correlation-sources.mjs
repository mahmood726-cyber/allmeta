// Restore only this job's conversion edits in memory. Hashes were recorded before each fix;
// line endings are normalized so the baseline is portable between checkouts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const root = new URL('../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const hash = text => createHash('sha256').update(text).digest('hex');
export const engine = read('shared/multivariate-ma.js');
export const html = read('multivariate-ma/index.html');
export const prHeadEngine = engine
  .replace(/  function covFromR\(v1, v2, r\) \{[\s\S]*?\n  \}/, `  function covFromR(v1, v2, r) {
    var product = v1 * v2;
    // Keep normal-product rounding; split roots avoid overflow, underflow and
    // precision loss in a subnormal product of positive finite variances.
    var scale = product >= 2.2250738585072014e-308 && Number.isFinite(product) ?
      Math.sqrt(product) : Math.sqrt(v1) * Math.sqrt(v2);
    return r * scale;
  }`)
  .replace(/  function rFromCov\(v1, v2, cov\) \{[\s\S]*?\n  \}\n/, '')
  .replace(', rFromCov: rFromCov', '');
export const prHeadHtml = html.replace('window.AlmMultivariate.rFromCov(v1, v2, cov)',
  'cov / window.AlmMultivariate.covFromR(v1, v2, 1)');
assert.equal(hash(prHeadEngine), 'a6eebee62400687863a59c8f9af704bfb8d2c730c87627d6f95c665240b23f85',
  'Restored engine must match the PR head before P18-R2-RV1');
assert.equal(hash(prHeadHtml), '0a7d8b03c59b490885301e46f145731042e63ed96a9078b9ac5edc1277cb6fac',
  'Restored page must match the PR head before P18-R2-RV1');
export const oldEngine = prHeadEngine.replace(/  function covFromR\(v1, v2, r\) \{[\s\S]*?\n  \}/,
  '  function covFromR(v1, v2, r) { return r * Math.sqrt(v1 * v2); }');
export const oldHtml = prHeadHtml.replace('cov / window.AlmMultivariate.covFromR(v1, v2, 1)',
  'cov / Math.sqrt(v1 * v2)');
assert.equal(hash(oldEngine), '80b150465b29a13d04371fb3b3859111aefef2301bad38dc5050436d29cf4c7b',
  'Restored engine must match the pre-fix source');
assert.equal(hash(oldHtml), 'cafc562c46025e6c9cea87385138e6d3d7d26802b6c9a70a6143813a3da40bc5',
  'Restored page must match the pre-fix source');
