import { defineConfig, devices } from '@playwright/test';
// One origin for the page server: set ALM_BASE_URL to serve and test this checkout on your own port.
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://localhost:8088').replace(/\/+$/, '');
const ALM_PORT = new URL(ALM_BASE_URL).port || '80';

export default defineConfig({
  testDir: '.',
  testMatch: 'probe.spec.mjs',
  timeout: 60_000,
  workers: parseInt(process.env.ALM_AUDIT_WORKERS || '4', 10),
  reporter: [['list'], ['json', { outputFile: '.probe-report.json' }]],
  use: {
    baseURL: ALM_BASE_URL,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `python -m http.server ${ALM_PORT} --directory ../`,
    port: Number(ALM_PORT),
    cwd: '.',
    reuseExistingServer: process.env.ALM_REUSE_SERVER === '1',
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
