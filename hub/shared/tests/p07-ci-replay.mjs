// Wrapper-compatible replay of the existing focused P07 browser checks.
// Uses installed dependencies and the existing config; writes artifacts to TEMP.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let cli;
try {
  cli = require.resolve('@playwright/test/cli');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  console.error('P07 browser replay unavailable: @playwright/test is not installed for hub/shared/tests/package.json. No browser tests ran.');
  process.exit(1);
}

const output = mkdtempSync(join(tmpdir(), 'p07-ci-replay-'));
console.log('P07 browser artifacts: ' + output);
// validation-fixture.mjs also writes integration-evidence relative to its source.
// Replay an unchanged temporary copy so that evidence cannot land inside wt/.
const replayRoot = join(output, 'tree');
cpSync(fileURLToPath(new URL('../../../', import.meta.url)), replayRoot, {
  recursive: true,
  filter: source => !['node_modules', '.git'].includes(basename(source))
});
// The resolved CLI lives at node_modules/@playwright/test/cli.js. Reuse that
// installation without copying or modifying dependencies.
const dependencies = dirname(dirname(dirname(cli)));
symlinkSync(dependencies, join(replayRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const result = spawnSync(process.execPath, [
  cli, 'test',
  'multilevel-ma-features.spec.mjs',
  'multilevel-ma-sanity.spec.mjs',
  'multilevel-ma-usability.spec.mjs',
  'multilevel-ma-pi.spec.mjs',
  'validate-multilevel-ma.spec.mjs',
  '--reporter=line', '--workers=1', '--output=' + join(output, 'artifacts')
], { cwd: join(replayRoot, 'hub', 'shared', 'tests'), stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
