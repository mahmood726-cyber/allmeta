import {defineConfig,devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: ['validate-*.spec.mjs','addons-wave0.spec.mjs'],
  timeout: 600000, workers: 1,
  use: {baseURL:'http://127.0.0.1:8000',locale:'en-US',timezoneId:'UTC'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome'],channel:process.env.PW_CHANNEL||undefined}}],
  webServer:{command:'python -m http.server 8000 --bind 127.0.0.1',
    cwd:fileURLToPath(new URL('../../../',import.meta.url)),url:'http://127.0.0.1:8000',reuseExistingServer:false}
});
