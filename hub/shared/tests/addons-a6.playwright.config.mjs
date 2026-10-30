import {defineConfig, devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';
// Lane A6 specs on a private port (ALM_A6_PORT, default 8162), never the shared 8088 server.
const port = Number(process.env.ALM_A6_PORT || 8162);
export default defineConfig({
  testDir: '.', testMatch: ['addons-a6*.spec.mjs'],
  timeout: 180000, workers: 1,
  use: {baseURL: 'http://127.0.0.1:' + port, acceptDownloads: true, locale: 'en-GB', timezoneId: 'UTC'},
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined}}],
  webServer: {command: 'python -m http.server ' + port + ' --bind 127.0.0.1',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)), url: 'http://127.0.0.1:' + port + '/influence/index.html', reuseExistingServer: false}
});
