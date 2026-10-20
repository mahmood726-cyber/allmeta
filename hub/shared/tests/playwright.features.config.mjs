import { defineConfig, devices } from '@playwright/test';

// Shared-feature specs (smart entry, in-app text, verify-in-R via webR, share link) for the paper 2-19 apps.
// Run by .github/workflows/features.yml; kept out of the default config so webR boots do not slow shared-tests.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: '.',
  testMatch: 'features-*.spec.mjs',
  timeout: 240_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:8089',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel } }],
  webServer: {
    command: 'python -m http.server 8089 --bind 127.0.0.1 --directory ../../../',
    port: 8089,
    cwd: '.',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
