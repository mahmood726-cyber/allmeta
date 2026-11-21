import { defineConfig } from '@playwright/test';
// One origin for the page server: set ALM_BASE_URL to serve and test this checkout on your own port.
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const ALM_PORT = new URL(ALM_BASE_URL).port || '80';
export default defineConfig({
  testDir: '.', testMatch: ['alm-screen-*.spec.mjs', 'alm-extract.spec.mjs', 'screen-workflow.spec.mjs', 'screen-focus.spec.mjs', 'screen-rct.spec.mjs', 'screen-collab.spec.mjs', 'screen-dedup-review.spec.mjs'],
  timeout: 60000, workers: 1, retries: 0, reporter: 'list',
  use: { baseURL: ALM_BASE_URL, channel: process.env.CI ? undefined : 'chrome', headless: true, trace: 'retain-on-failure' },
  webServer: { command: `npx http-server ../.. -a 127.0.0.1 -p ${ALM_PORT} -c-1 --silent`, url: ALM_BASE_URL + '/screen/index.html', reuseExistingServer: false }
});
