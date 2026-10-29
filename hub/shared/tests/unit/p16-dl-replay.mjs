// Read-only numerical comparison of the available validation inputs.
// The old-code snapshot is a test artifact in the OS temporary directory.
// This does not replace the pinned R, DOM or complete archived paper replay.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engine, appSource, input, scaled } from './p16-dl-harness.mjs';

const E = engine();
const read = file => JSON.parse(readFileSync(new URL(`../../../../nma-inconsistency/validate/${file}`, import.meta.url), 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex');
const core = read('corpus/corpus.json');
const plus = read('plus/corpus.json');
const textCases = core.filter(c => typeof c.text === 'string');
const snapshot = {
  core: textCases.map(c => ({ key: c.key, fit: E.AlmIncoPlusCore.fitAll(E, E.parse(c.text), c.model) })),
  plus: plus.map(c => ({ key: c.key,
    loo: E.AlmIncoPlusCore.loo(E, c.rows, c.model),
    compare: E.AlmIncoPlusCore.compare3(E, c.rows) })),
};
const bytes = JSON.stringify(snapshot);
const path = join(tmpdir(), `p16-dl-before-${hash(import.meta.url).slice(0, 16)}.json`);
const info = { coreTextCases: textCases.length, coreNontextCasesExcluded: core.length - textCases.length,
  plusCases: plus.length, numericalSnapshotSha256: hash(bytes), appSourceSha256: hash(appSource) };
if (!existsSync(path)) {
  assert.ok(appSource.includes('if (denom <= 1e-12) return 0;'), 'Only old source may establish the before snapshot');
  writeFileSync(path, bytes, { flag: 'wx' });
  console.log('Recorded old-code numerical snapshot:', JSON.stringify(info));
} else {
  assert.equal(hash(bytes), hash(readFileSync(path)), 'Every available core text result, plus LOO and estimator comparison must remain byte-identical');
  console.log('PASS: available numerical results unchanged:', JSON.stringify(info));
}
for (const scale of input.scales) {
  const result = E.AlmIncoPlusCore.fitAll(E, scaled(input.cases.triangle, scale), 'DL');
  console.log('Synthetic triangle:', JSON.stringify({ scale, status: result.status, tau2: result.tau2,
    normalizedTau2: result.tau2 / scale ** 2, global: result.dbt,
    splitP: result.nodeSplit.map(s => ({ comparison: s.comparison, p: s.p })) }));
}
