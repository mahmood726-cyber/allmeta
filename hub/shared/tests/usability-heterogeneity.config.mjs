import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// rscript-export.config.mjs is absent from this checkout. Follows the sibling
// usability-dta-sroc.config.mjs convention; port 8303 is free of the other usability configs (8301, 8302, 8304).
export default defineConfig({
  testDir: '.', testMatch: 'usability-heterogeneity.spec.mjs',
  timeout: 30_000, workers: 1, retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8303',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined },
  }],
  webServer: {
    command: 'python -m http.server 8303 --bind 127.0.0.1 --directory ../../../',
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: 'http://127.0.0.1:8303/heterogeneity/index.html', reuseExistingServer: false,
    stdout: 'ignore', stderr: 'ignore',
  },
});
