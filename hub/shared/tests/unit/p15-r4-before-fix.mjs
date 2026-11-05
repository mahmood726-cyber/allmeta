// Replay the same assertions with the exact pre-fix conditioning helper.
// This intentionally fails. It only replaces the helper in memory, never on disk.
// It is separate from *.test.mjs so the quick gate exercises production code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../../../../shared/stats-qt.js';
import RVE from '../../../../shared/rve.js';
import E from '../../../../shared/rve-extras.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../../../../shared/rve-extras.js');
const original = read('./p15-r4-before-fix.txt');
const pattern = /  function kappaXtWX\(rows, weights\) \{[\s\S]*?\n  \}/g;
assert.equal([...source.matchAll(pattern)].length, 1, 'replace exactly one helper');
const context = vm.createContext({ AlmRVE: RVE });
vm.runInContext(source.replace(pattern, () => original.trimEnd()), context,
  { filename: 'shared/rve-extras.js with original kappaXtWX' });

const input = JSON.parse(read('./p15-r4-conditioning-input.json'));
const reference = JSON.parse(read('./p15-r4-conditioning-reference.json'));
for (const c of input.cases) {
  let rows = input.rows.map(r => ({ ...r, X: r.X.slice(), vi: c.vi }));
  if (c.centred) rows = E.centreRows(rows).rows;
  const fit = RVE.fitCORR(rows, { rho: input.rho });
  console.log(JSON.stringify({ case: c.name,
    before: context.AlmRVEExtras.kappaXtWX(rows, fit.weights),
    after: E.kappaXtWX(rows, fit.weights),
    R: reference.cases.find(r => r.name === c.name).kappa }));
}

// Retain the imported object identity used by the test module so the page and
// export checks receive the same original conditioning diagnostic.
Object.assign(E, context.AlmRVEExtras);
await import('./p15-r4-conditioning.test.mjs');
