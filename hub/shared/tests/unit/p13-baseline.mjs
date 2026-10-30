// Read-only baseline replay, using this checkout's unchanged 24 P13 assertions.
// Supported wrapper command: node hub/shared/tests/unit/p13-baseline.mjs
// Default source: the sibling base/ tree. An explicit tree path is also accepted.
// Exit 1 is expected only when TAP reports the 18 named plants failing and all
// six controls passing; missing inputs/other failures are not baseline evidence.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = process.argv[2] ? resolve(process.argv[2]) :
  fileURLToPath(new URL('../../../../../base/', import.meta.url));
try {
  console.log(`P13 baseline source: ${root}`);
  for (const path of ['gosh/index.html', 'hub/shared/analysis-lifecycle.js']) {
    const lf = readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
    console.log(`SHA256 (LF) ${path}: ${createHash('sha256').update(lf).digest('hex')}`);
  }
  const result = spawnSync(process.execPath, [
    '--test-reporter=tap',
    fileURLToPath(new URL('./p13-review-defects.test.mjs', import.meta.url)),
    '--p13-source-root', root,
  ], { env: {}, encoding: 'utf8', timeout: 60000 });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 2;
} catch (error) {
  console.error(`P13 baseline replay unavailable: ${error.message}`);
  process.exitCode = 2;
}
