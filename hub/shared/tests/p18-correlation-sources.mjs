// Restore only this job's two edits in memory. Hashes were recorded before the fix;
// line endings are normalized so the baseline is portable between checkouts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const root = new URL('../../../', import.meta.url);
export const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const hash = text => createHash('sha256').update(text).digest('hex');
export const engine = read('shared/multivariate-ma.js');
export const html = read('multivariate-ma/index.html');
export const oldEngine = engine.replace(/  function covFromR\(v1, v2, r\) \{[\s\S]*?\n  \}/,
  '  function covFromR(v1, v2, r) { return r * Math.sqrt(v1 * v2); }');
export const oldHtml = html.replace('cov / window.AlmMultivariate.covFromR(v1, v2, 1)',
  'cov / Math.sqrt(v1 * v2)');
assert.equal(hash(oldEngine), '80b150465b29a13d04371fb3b3859111aefef2301bad38dc5050436d29cf4c7b',
  'Restored engine must match the pre-fix source');
assert.equal(hash(oldHtml), 'cafc562c46025e6c9cea87385138e6d3d7d26802b6c9a70a6143813a3da40bc5',
  'Restored page must match the pre-fix source');
