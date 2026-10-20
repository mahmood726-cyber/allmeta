import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// rscript-export.config.mjs is absent from this checkout. Follows the sibling
// usability-dta-sroc.config.mjs convention; port 8304 is free of the other usability configs (8301, 8302, 8303).
export default defineConfig({
  testDir: '.', testMatch: 'usability-nma.spec.mjs',
  timeout: 30_000, workers: 1, retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8304',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined },
  }],
  webServer: {
    command: 'python -m http.server 8304 --bind 127.0.0.1 --directory ../../../',
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: 'http://127.0.0.1:8304/nma/index.html', reuseExistingServer: false,
    stdout: 'ignore', stderr: 'ignore',
  },
});
