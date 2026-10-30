// Read-only numerical comparison of the available validation inputs.
// Both source-verified snapshots are created afresh in the OS temporary directory.
// This does not replace the pinned R, DOM or complete archived paper replay.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engine, input, scaled } from './p16-dl-harness.mjs';
import { verifiedSources, sha256 as hash } from './p16-dl-source.mjs';

const sources = verifiedSources();
const E = engine(sources.fixed);
const read = file => JSON.parse(readFileSync(new URL(`../../../../nma-inconsistency/validate/${file}`, import.meta.url), 'utf8'));
const core = read('corpus/corpus.json');
const plus = read('plus/corpus.json');
const textCases = core.filter(c => typeof c.text === 'string');
const snapshot = E => ({
  core: textCases.map(c => ({ key: c.key, fit: E.AlmIncoPlusCore.fitAll(E, E.parse(c.text), c.model) })),
  plus: plus.map(c => ({ key: c.key,
    loo: E.AlmIncoPlusCore.loo(E, c.rows, c.model),
    compare: E.AlmIncoPlusCore.compare3(E, c.rows) })),
});
const temporaryRoot = mkdtempSync(join(tmpdir(), 'p16-dl-replay-'));
const beforePath = join(temporaryRoot, 'before.json');
const afterPath = join(temporaryRoot, 'after.json');
writeFileSync(beforePath, JSON.stringify(snapshot(engine(sources.old))), { flag: 'wx' });
writeFileSync(afterPath, JSON.stringify(snapshot(E)), { flag: 'wx' });
const before = readFileSync(beforePath, 'utf8');
const bytes = readFileSync(afterPath, 'utf8');
const info = { coreTextCases: textCases.length, coreNontextCasesExcluded: core.length - textCases.length,
  plusCases: plus.length, numericalSnapshotSha256: hash(bytes), beforeSnapshotSha256: hash(before),
  oldSourceLfSha256: hash(sources.old), appSourceLfSha256: hash(sources.fixed),
  historicalSourceSha256: sources.historicalSha256 };
writeFileSync(join(temporaryRoot, 'provenance.json'), JSON.stringify(info, null, 2));
assert.equal(hash(bytes), hash(before), 'Every available core text result, plus LOO and estimator comparison must remain byte-identical');
console.log('PASS: available numerical results unchanged:', JSON.stringify(info));
console.log('Temporary evidence:', temporaryRoot);
for (const scale of input.scales) {
  const result = E.AlmIncoPlusCore.fitAll(E, scaled(input.cases.triangle, scale), 'DL');
  console.log('Synthetic triangle:', JSON.stringify({ scale, status: result.status, tau2: result.tau2,
    normalizedTau2: result.tau2 / scale ** 2, global: result.dbt,
    splitP: result.nodeSplit.map(s => ({ comparison: s.comparison, p: s.p })) }));
}
