import base from './playwright.config.mjs';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,timeout:120000,expect:{timeout:15000},
 testMatch:'*-plus-pixels.spec.mjs',testIgnore:['dta-sroc-plus-pixels.spec.mjs'],updateSnapshots:'none',
 snapshotPathTemplate:'{testDir}/pixel-references/{arg}{ext}',
 use:{...base.use,baseURL:'http://127.0.0.1:8000'},
 webServer:{...base.webServer,command:'python -m http.server 8000 --bind 127.0.0.1 --directory ../../../',port:8000,reuseExistingServer:false},
});
