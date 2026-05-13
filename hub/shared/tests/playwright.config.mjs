import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8088',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python -m http.server 8088 --directory ../../',
    port: 8088,
    cwd: '.',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
