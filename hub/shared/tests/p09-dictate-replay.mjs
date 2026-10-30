// Read-only replay of the unchanged historical adapter/corpus. This audit is
// deliberately outside the unit gate: its historical FE PI contract conflicts
// with P09-D4. Report every failure; never substitute references or tolerances.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApp, root } from './helpers/p09-proportion-harness.mjs';

const app = createApp();
app.evaluate('shared/alm-validate.js');
app.context.AlmValidate = app.window.AlmValidate;
// Only the validation widget mount is suppressed; comparator/replay are real.
app.window.AlmValidate.mount = () => ({});
app.evaluate('proportion-ma/validate/adapter.js');
const adapter = app.window.AlmProportionValidationAdapter;
const loaded = {};
for (const spec of adapter.corpus.files) {
  // Recorded provenance hashes describe LF text, independent of checkout EOLs.
  const bytes = readFileSync(new URL('proportion-ma/' + spec.path, root), 'utf8')
    .replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), spec.sha256, spec.path);
  loaded[spec.path] = JSON.parse(bytes);
}
const result = await adapter.corpus.run(loaded, () => {});
const byQuantity = {};
for (const failure of result.failed) {
  byQuantity[failure.quantity] = (byQuantity[failure.quantity] || 0) + 1;
}
const report = {
  checks: result.checks, passed: result.passed, failed: result.failed.length,
  failedConfigurations: new Set(result.failed.map(f => f.id)).size,
  failuresByQuantity: byQuantity, refusals: result.refusals.length,
  maxima: result.maxima, examples: result.failed.slice(0, 5),
  allFailuresAreFEPI: result.failed.every(f => f.id.endsWith('|FE') &&
    ['piLo','piHi','poolPiLo','poolPiHi','ui_prediction_text'].includes(f.quantity))
};
console.log('P09_REPLAY_JSON:' + JSON.stringify(report, (_, value) =>
  typeof value === 'number' && !Number.isFinite(value) ? String(value) : value));
if (result.failed.length) process.exitCode = 1;
