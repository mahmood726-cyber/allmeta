// The existing app specs, with test artifacts kept outside the source tree.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export default {
  testDir: fileURLToPath(new URL('../', import.meta.url)),
  testMatch: ['mh-peto-sanity.spec.mjs', 'mh-peto-bus.spec.mjs', 'mh-peto-v2.spec.mjs', 'validate-mh-peto.spec.mjs'],
  outputDir: join(tmpdir(), 'p10-browser-results'),
  reporter: 'list',
  timeout: 30_000,
  workers: 1,
  use: { browserName: 'chromium', baseURL: 'http://localhost:8088' },
  webServer: {
    command: 'python -B -m http.server 8088 --bind 127.0.0.1',
    cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
    port: 8088,
    reuseExistingServer: false,
    stdout: 'ignore', stderr: 'ignore',
  },
};
