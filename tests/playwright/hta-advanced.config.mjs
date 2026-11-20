import { defineConfig } from '@playwright/test';
// One origin for the page server: set ALM_BASE_URL to serve and test this checkout on your own port.
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const ALM_PORT = new URL(ALM_BASE_URL).port || '80';

export default defineConfig({
  testDir: '.',
  testMatch: ['hta-advanced-synthesis.spec.mjs', 'hta-synthesis-plots.spec.mjs'],
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 2,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/hta-advanced-report.json' }]],
  use: {
    baseURL: ALM_BASE_URL,
    browserName: 'chromium',
    launchOptions: {
      // Optional local browser; CI uses Playwright's installed Chromium.
      executablePath: process.env.HTA_CHROMIUM_EXECUTABLE || undefined,
      args: JSON.parse(process.env.HTA_CHROMIUM_ARGS || '[]')
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `python3 -m http.server ${ALM_PORT} --bind 127.0.0.1 --directory ../..`,
    url: ALM_BASE_URL + '/HTA/index.html',
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
    timeout: 30000
  }
});
