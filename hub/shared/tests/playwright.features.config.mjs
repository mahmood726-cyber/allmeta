import { defineConfig, devices } from '@playwright/test';

// Shared-feature specs (smart entry, in-app text, verify-in-R via webR, share link) for the paper 2-19 apps.
// Run by .github/workflows/features.yml; kept out of the default config so webR boots do not slow shared-tests.
const channel = process.env.PW_CHANNEL || undefined;
// Per-lane port: two worktrees on one machine must not share (reuseExistingServer would serve the other tree).
// In CI a server is never reused: a stale server on the port could serve another tree.
const port = Number(process.env.ALM_FEATURES_PORT || 8089);

export default defineConfig({
  testDir: '.',
  testMatch: 'features-*.spec.mjs',
  timeout: 240_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel } }],
  webServer: {
    command: `python -m http.server ${port} --bind 127.0.0.1 --directory ../../../`,
    port,
    cwd: '.',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
