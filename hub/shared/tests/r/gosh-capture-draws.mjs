// Reference INPUT only: retain the app's ordered memberships, never its estimates.
// Sampled parity means refitting the app's draws, not matching metafor's sampler.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const load = require('../../../../gosh/tests/input-harness.cjs');
const input = JSON.parse(readFileSync(new URL('../fixtures/gosh-r-parity-input.json', import.meta.url)));
const page = load(fileURLToPath(new URL('../../../../gosh/index.html', import.meta.url)));
const draws = [];
for (const c of input.cases.filter(c => c.draws)) {
  for (const model of input.models) {
    const text = c.te.map((y, i) => `${y},${c.se[i]},S${i + 1}`).join('\n');
    const result = page.window.__almGoshValidationRun(text, model, String(c.draws), {});
    if (result.points.length !== c.draws) throw Error('Missing captured draws');
    draws.push({id: c.id, model, members: result.points.map(p => p.members)});
  }
}
writeFileSync(new URL('../fixtures/gosh-r-parity-draws.json', import.meta.url), JSON.stringify(draws, null, 2) + '\n');
console.log(`Captured ${draws.length} model runs as reference inputs (memberships only).`);
