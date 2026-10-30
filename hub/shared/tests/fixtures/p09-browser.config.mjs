import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDir = mkdtempSync(join(tmpdir(), 'p09-browser-'));
console.log('P09 browser artifacts: ' + outputDir);

export default {
  testDir: fileURLToPath(new URL('../', import.meta.url)),
  testMatch: [
    '**/proportion-ma-sanity.spec.mjs',
    '**/proportion-ma-fe.spec.mjs',
    '**/proportion-ma-pi.spec.mjs',
    '**/proportion-ma-bus.spec.mjs',
    '**/proportion-ma-features.spec.mjs',
    '**/proportion-ma-usability.spec.mjs'
  ],
  outputDir,
  reporter: 'list',
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { browserName: 'chromium', baseURL: 'http://localhost:8088' },
  webServer: {
    command: 'python -B -m http.server 8088 --bind localhost',
    cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
    url: 'http://localhost:8088/proportion-ma/index.html',
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe'
  }
};
