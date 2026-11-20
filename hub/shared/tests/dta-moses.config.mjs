import { defineConfig, devices } from '@playwright/test';
// One origin for the page server: set ALM_BASE_URL to serve and test this checkout on your own port.
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const ALM_PORT = new URL(ALM_BASE_URL).port || '80';
export default defineConfig({
  testDir: '.', testMatch: 'dta-moses-nonidentifiability.spec.mjs',
  timeout: 30_000, workers: 1, retries: 0,
  use: { baseURL: ALM_BASE_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  webServer: {
    command: `python -m http.server ${ALM_PORT} --bind 127.0.0.1 --directory ../../../`,
    url: ALM_BASE_URL + '/dta-sroc/index.html', reuseExistingServer: false,
    stdout: 'ignore', stderr: 'ignore',
  },
});
