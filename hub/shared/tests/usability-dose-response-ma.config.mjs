import { defineConfig, devices } from '@playwright/test';

// rscript-export.config.mjs is absent from this checkout. Follow the focused
// dta-moses.config.mjs convention, with this task's required port and spec.
export default defineConfig({
  testDir: '.', testMatch: 'usability-dose-response-ma.spec.mjs',
  timeout: 30_000, workers: 1, retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8301',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined } }],
  webServer: {
    command: 'python -m http.server 8301 --bind 127.0.0.1 --directory ../../../',
    url: 'http://127.0.0.1:8301/dose-response-ma/index.html',
    reuseExistingServer: false,
    stdout: 'ignore', stderr: 'ignore',
  },
});
