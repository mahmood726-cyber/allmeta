import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'probe.spec.mjs',
  timeout: 60_000,
  workers: parseInt(process.env.ALM_AUDIT_WORKERS || '4', 10),
  reporter: [['list'], ['json', { outputFile: '.probe-report.json' }]],
  use: {
    baseURL: 'http://localhost:8088',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python -m http.server 8088 --directory ../',
    port: 8088,
    cwd: '.',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
