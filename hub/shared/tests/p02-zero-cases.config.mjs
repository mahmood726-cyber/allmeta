import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.', testMatch:['usability-dose-response-ma.spec.mjs','p02-zero-cases.spec.mjs'],
  timeout:30000, workers:1, retries:0, outputDir:'../../../dose-response-ma/browser-results',
  use:{baseURL:'http://127.0.0.1:8000',launchOptions:{executablePath:process.env.PW_EXECUTABLE || undefined}},
  webServer:{command:'python -m http.server 8000 --bind 127.0.0.1 --directory ../../../',
    url:'http://127.0.0.1:8000/dose-response-ma/index.html',reuseExistingServer:false}
});
