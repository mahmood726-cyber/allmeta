import { defineConfig, devices } from '@playwright/test';

// Persona walkthrough capture for the data-entry UX (run by the `personas` job in .github/workflows/features.yml).
// It is a capture tool: it asserts that each step rendered and writes the pack to scripts/personas/pack/.
const port = Number(process.env.ALM_PERSONAS_PORT || 8091);

export default defineConfig({
  testDir: '.',
  testMatch: 'walkthrough.spec.mjs',
  timeout: 180_000,
  workers: 1,
  use: { baseURL: `http://localhost:${port}`, acceptDownloads: true, viewport: { width: 1280, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `python -m http.server ${port} --bind 127.0.0.1 --directory ../../`,
    port,
    cwd: '.',
    reuseExistingServer: !process.env.CI, // never serve another tree from a stale server in CI
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
