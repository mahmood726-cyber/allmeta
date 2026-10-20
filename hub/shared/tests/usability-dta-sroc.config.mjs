import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// rscript-export.config.mjs is absent in this checkout. Based on the existing
// dta-moses.config.mjs, with this task's spec and assigned port.
export default defineConfig({
  testDir: '.', testMatch: 'usability-dta-sroc.spec.mjs',
  timeout: 30_000, workers: 1, retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8302',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined },
  }],
  webServer: {
    command: 'python -m http.server 8302 --bind 127.0.0.1 --directory ../../../',
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: 'http://127.0.0.1:8302/dta-sroc/index.html', reuseExistingServer: false,
    stdout: 'ignore', stderr: 'ignore',
  },
});
