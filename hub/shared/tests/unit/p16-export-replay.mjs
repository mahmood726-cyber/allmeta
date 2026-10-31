import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { P, E, labels, plainLabels, rowsFor } from './p16-pair-identity-support.mjs';

for (const [name, names] of [['plant', labels], ['control', plainLabels]]) {
  for (const model of P.MODELS) {
    const rows = rowsFor(names), loo = P.loo(E, rows, model);
    writeFileSync(join(tmpdir(), `p16-r3-${name}-${model}.R`),
      P.buildRScript({ rows, loo }, { loo: true, date: '2026-10-29' }));
  }
}
console.log('Generated six FE/DL/PM + LOO reproduction scripts in the system temporary directory.');
