import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('hub/shared/tests/unit').filter(name => name.endsWith('.test.mjs'))
  .sort().map(name => 'hub/shared/tests/unit/' + name);
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
