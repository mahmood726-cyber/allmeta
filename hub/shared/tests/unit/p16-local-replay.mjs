// Wrapper-only setup: dependencies/cache/output live in TEMP, never in wt/.
// CI installs the same pinned dependency through its existing npm step.
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const unit = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const deps = join(tmpdir(), 'p16-w1-test-deps');
const manifest = join(tmpdir(), 'p16-r3-live-generation.json');
if (existsSync(manifest)) unlinkSync(manifest);
const cli = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(existsSync);
if (!cli) throw Error('Cannot locate npm beside Node; pinned linkedom setup was not run');
mkdirSync(deps, { recursive: true });
const installed = spawnSync(process.execPath, [cli, 'install', '--prefix', deps,
  '--cache', join(deps, 'cache'), '--ignore-scripts', '--no-save', '--package-lock=false',
  '--no-audit', '--no-fund', 'linkedom@0.18.12'], { cwd: deps, stdio: 'inherit', timeout: 180000 });
if (installed.error) throw installed.error;
if (installed.status !== 0) throw Error('Pinned linkedom installation failed');
// Set the child Node search path without reading or logging environment values.
process.env.NODE_PATH = join(deps, 'node_modules');
let failed = false;
for (const file of ['p16-verify.mjs', 'p16-dom-current.mjs', 'p16-live-replay.mjs']) {
  console.log('P16_LOCAL_REPLAY ' + file);
  const result = spawnSync(process.execPath, [join(unit, file)], {
    cwd: root, stdio: 'inherit', timeout: 600000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
