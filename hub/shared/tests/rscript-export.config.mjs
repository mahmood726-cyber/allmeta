import { defineConfig, devices } from '@playwright/test';

// Self-checking R script export (shared/alm-validate.js). Own port: 8088 is shared by other suites/lanes and
// reuseExistingServer would otherwise serve whatever checkout already owns it.
const channel = process.env.PW_CHANNEL || undefined;
export default defineConfig({
  testDir: '.',
  testMatch: 'rscript-export.spec.mjs',
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:8295', acceptDownloads: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel } }],
  webServer: {
    command: 'python -m http.server 8295 --bind 127.0.0.1 --directory ../../../',
    port: 8295,
    cwd: '.',
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
