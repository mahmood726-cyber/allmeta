import {defineConfig, devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';
// Lane A5 specs on a private port (ALM_A5_PORT, default 8161), never the shared 8088 server.
const port = Number(process.env.ALM_A5_PORT || 8161);
export default defineConfig({
  testDir: '.', testMatch: ['addons-a5*.spec.mjs'],
  timeout: 300000, workers: 1,
  use: {baseURL: 'http://127.0.0.1:' + port},
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined}}],
  webServer: {command: 'python -m http.server ' + port + ' --bind 127.0.0.1',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)), url: 'http://127.0.0.1:' + port + '/heterogeneity/index.html', reuseExistingServer: false}
});
