import { defineConfig, devices } from '@playwright/test';

// Browser selection: default to Playwright's bundled Chromium. On machines where
// `npx playwright install chromium` is unavailable (corp net / offline / timed out),
// set PW_CHANNEL to a system browser channel (e.g. msedge, chrome) so the suite still
// runs against an installed browser instead of failing on a missing bundled Chromium.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8088',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel } }],
  webServer: {
    command: 'python -m http.server 8088 --directory ../../../',
    port: 8088,
    cwd: '.',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
