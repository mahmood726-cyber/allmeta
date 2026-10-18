import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'dta-moses-nonidentifiability.spec.mjs',
  timeout: 30_000, workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:8000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  webServer: {
    command: 'python -m http.server 8000 --bind 127.0.0.1 --directory ../../../',
    url: 'http://127.0.0.1:8000/dta-sroc/index.html', reuseExistingServer: false,
    stdout: 'ignore', stderr: 'ignore',
  },
});
