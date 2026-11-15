import { defineConfig, devices } from '@playwright/test';
// One origin for the page server: set ALM_BASE_URL to serve and test this checkout on your own port.
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://localhost:8088').replace(/\/+$/, '');
const ALM_PORT = new URL(ALM_BASE_URL).port || '80';

// Browser selection: default to Playwright's bundled Chromium. On machines where
// `npx playwright install chromium` is unavailable (corp net / offline / timed out),
// set PW_CHANNEL to a system browser channel (e.g. msedge, chrome) so the suite still
// runs against an installed browser instead of failing on a missing bundled Chromium.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  testIgnore: '*-plus-pixels.spec.mjs', // Dedicated Windows pixel CI job and config.
  timeout: 30_000,
  use: {
    baseURL: ALM_BASE_URL,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel } }],
  webServer: {
    command: `python -m http.server ${ALM_PORT} --bind 127.0.0.1 --directory ../../../`,
    port: Number(ALM_PORT),
    cwd: '.',
    reuseExistingServer: process.env.ALM_REUSE_SERVER === '1',
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
