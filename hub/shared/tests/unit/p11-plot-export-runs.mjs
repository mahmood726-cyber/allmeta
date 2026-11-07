// Generated test scripts/PDFs and process output live only in the system temporary directory.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { page, plants } from './p11-plot-export-harness.mjs';
const output = join(tmpdir(), 'p11-r3-plot-export');
mkdirSync(output, { recursive: true });
const cases = ['control', ...plants, 'table', 'exclusion', 'boundary'];
for (const name of cases) {
  const p = name === 'boundary'
    ? page(null, [{ label: 'F', te: 0.20, se: 0.1 }, { label: 'G', te: 0.21, se: 0.12 }, { label: 'H', te: 0.19, se: 0.13 }])
    : page(plants.includes(name) || name === 'table' ? name : null);
  if (name === 'exclusion') p.exclude(0);
  writeFileSync(join(output, `${name}.R`), p.script());
}
console.log(`Wrote ${cases.length} exported R scripts to ${output}`);
