import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['hta-advanced-synthesis.spec.mjs', 'hta-synthesis-plots.spec.mjs'],
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 2,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/hta-advanced-report.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:8080',
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
    command: 'python3 -m http.server 8080 --bind 127.0.0.1 --directory ../..',
    url: 'http://127.0.0.1:8080/HTA/index.html',
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
    timeout: 30000
  }
});
