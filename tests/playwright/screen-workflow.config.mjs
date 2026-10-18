import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: ['alm-screen-*.spec.mjs', 'screen-workflow.spec.mjs', 'screen-focus.spec.mjs', 'screen-rct.spec.mjs', 'screen-collab.spec.mjs'],
  timeout: 60000, workers: 1, retries: 0, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8000', channel: process.env.CI ? undefined : 'chrome', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'npx http-server ../.. -a 127.0.0.1 -p 8000 -c-1 --silent', url: 'http://127.0.0.1:8000/screen/index.html', reuseExistingServer: false }
});
