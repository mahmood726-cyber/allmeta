// Lossless input-only bridge to base R, which has no JSON reader.
// No estimates or reference expectations are computed here.
import { writeFileSync } from 'node:fs';
import { cases, root } from './p05-qprofile-harness.mjs';
const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
const rows = cases().map(c => [c.id, c.alpha, c.empty ? 'TRUE' : 'FALSE', c.text]);
const csv = [['id', 'alpha', 'empty', 'text'], ...rows].map(row => row.map(quote).join(',')).join('\n') + '\n';
writeFileSync(new URL('hub/shared/tests/unit/p05-qprofile-input.csv', root), csv, { flag: 'wx' });
console.log('Prepared', rows.length, 'unchanged input texts for base R read.csv.');
