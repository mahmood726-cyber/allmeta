import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
// One origin for the page server: set ALM_BASE_URL to serve and test this checkout on your own port.
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://127.0.0.1:8302').replace(/\/+$/, '');
const ALM_PORT = new URL(ALM_BASE_URL).port || '80';

// rscript-export.config.mjs is absent in this checkout. Based on the existing
// dta-moses.config.mjs, with this task's spec and assigned port.
export default defineConfig({
  testDir: '.', testMatch: 'usability-dta-sroc.spec.mjs',
  timeout: 30_000, workers: 1, retries: 0,
  use: {
    baseURL: ALM_BASE_URL,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined },
  }],
  webServer: {
    command: `python -m http.server ${ALM_PORT} --bind 127.0.0.1 --directory ../../../`,
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: ALM_BASE_URL + '/dta-sroc/index.html', reuseExistingServer: false,
    stdout: 'ignore', stderr: 'ignore',
  },
});
