import base from './playwright.config.mjs';
import {defineConfig} from '@playwright/test';
// One origin for the page server: set ALM_BASE_URL to serve and test this checkout on your own port.
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const ALM_PORT = new URL(ALM_BASE_URL).port || '80';
export default defineConfig({...base,timeout:120000,expect:{timeout:15000},
 testMatch:'*-plus-pixels.spec.mjs',testIgnore:['dta-sroc-plus-pixels.spec.mjs'],updateSnapshots:'none',
 snapshotPathTemplate:'{testDir}/pixel-references/{arg}{ext}',
 use:{...base.use,baseURL:ALM_BASE_URL},
 webServer:{...base.webServer,command:`python -m http.server ${ALM_PORT} --bind 127.0.0.1 --directory ../../../`,port:Number(ALM_PORT),reuseExistingServer:false},
});
