// Run before the first native R reference run; output is transient test input.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cases } from './p11-r4-cases.mjs';
// Source finite numeric inputs with base R; jsonlite is not installed on the
// native runner. Keep the same round-tripped variances used by the page.
const vector = values => values.length ? `c(${values.join(', ')})` : 'numeric(0)';
const input = cases.map(c => {
  const vi = c.vi.map(v => Math.sqrt(v)**2);
  if (![...c.yi, ...vi, ...c.excluded].every(Number.isFinite)) throw new Error('Non-finite reference input');
  return `list(id=${JSON.stringify(c.id)}, yi=${vector(c.yi)}, vi=${vector(vi)}, excluded=${vector(c.excluded)})`;
});
writeFileSync(join(tmpdir(), 'p11-r4-input.R'), `input <- list(\n${input.join(',\n')}\n)\n`);
console.log(`Prepared ${cases.length} Influence cases for native R`);
