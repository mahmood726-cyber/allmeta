import base from '../../hub/shared/tests/playwright.config.mjs';
export default {...base,testDir:'../../hub/shared/tests',testMatch:'dta-sroc-plus-pixels.spec.mjs',
 timeout:120000,expect:{timeout:15000},updateSnapshots:'none',
 snapshotPathTemplate:'{testDir}/../../../dta-sroc/validate/pixel-references/{arg}{ext}',
 projects:[{name:'windows-edge',use:{channel:'msedge'}}],
 use:{...base.use,baseURL:'http://127.0.0.1:8000',viewport:{width:1280,height:900},deviceScaleFactor:1,reducedMotion:'reduce',colorScheme:'light'},
 webServer:{command:'python -m http.server 8000 --bind 127.0.0.1 --directory ../../../',port:8000,cwd:'../../hub/shared/tests',reuseExistingServer:false}
};
