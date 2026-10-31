// Pass-2 evidence: rerun the unchanged requirements against the original sources
// saved in TEMP before the fix. This helper needs those session-local snapshots.
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'p16-r3-baseline-'));
const app = join(root, 'nma-inconsistency');
const unit = join(root, 'hub/shared/tests/unit');
const fixtures = join(root, 'tests/fixtures');
mkdirSync(join(app, 'validate'), { recursive: true });
mkdirSync(unit, { recursive: true });
mkdirSync(fixtures, { recursive: true });
for (const file of ['index.html', 'plus-core.js', 'plus-ui.js']) {
  copyFileSync(join(tmpdir(), 'p16-r3-old-' + file), join(app, file));
}
copyFileSync(join(tmpdir(), 'p16-r3-old-live.js'), join(app, 'validate/live.js'));
// The adapter's unchanged numerical helpers are also exercised by live snapshots.
copyFileSync(new URL('../../../../nma-inconsistency/validate/adapter.js', import.meta.url), join(app, 'validate/adapter.js'));
for (const file of ['p16-pair-identity.test.mjs', 'p16-pair-identity-parity.test.mjs', 'p16-pair-identity-support.mjs']) {
  copyFileSync(new URL(file, import.meta.url), join(unit, file));
}
copyFileSync(new URL('../../../../tests/fixtures/p16-pair-identity-reference.json', import.meta.url), join(fixtures, 'p16-pair-identity-reference.json'));
const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec',
  join(unit, 'p16-pair-identity.test.mjs'), join(unit, 'p16-pair-identity-parity.test.mjs')],
{ encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (result.error) throw result.error;
const output = (result.stdout || '') + (result.stderr || '');
const log = join(root, 'baseline-output.txt');
writeFileSync(log, output);
// The wrapper truncates long assertion traces. Retain those in TEMP and print
// every test outcome plus counts, so the relabelled controls remain visible.
console.log(output.split(/\r?\n/).filter(line => /^[\u2714\u2716\u2139]/.test(line)).join('\n'));
console.log('P16 baseline full output: ' + log);
process.exitCode = result.status ?? 1;
