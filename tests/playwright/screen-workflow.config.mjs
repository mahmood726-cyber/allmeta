import { defineConfig } from '@playwright/test';
const baseURL = 'http://127.0.0.1:' + (process.env.SCREEN_TEST_PORT || '8000');
export default defineConfig({
  testDir: '.', testMatch: ['alm-screen-*.spec.mjs', 'alm-extract.spec.mjs', 'alm-a11y-offline.spec.mjs', 'alm-pipeline-e2e.spec.mjs', 'screen-workflow.spec.mjs', 'screen-hybrid.spec.mjs', 'screen-focus.spec.mjs', 'screen-rct.spec.mjs', 'screen-collab.spec.mjs', 'screen-ux.spec.mjs'],
  timeout: 60000, workers: 1, retries: 0, reporter: 'list',
  use: { baseURL, channel: process.env.CI ? undefined : 'chrome', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'node screen-test-server.cjs', url: baseURL + '/screen/index.html', reuseExistingServer: false }
});
