import {defineConfig, devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';
// Lane A3 specs on a private port (ALM_A3_PORT, default 8163), never the shared 8088 server.
const port = Number(process.env.ALM_A3_PORT || 8163);
export default defineConfig({
  // ALM_A3_REGRESSION=1 also runs the existing plot-export specs that use relative URLs.
  testDir: '.', testMatch: ['addons-a3*.spec.mjs'].concat(process.env.ALM_A3_REGRESSION ? ['plot-export.spec.mjs', 'batch1-plot-export.spec.mjs', 'batch2-plot-export.spec.mjs'] : []),
  timeout: 120000, workers: 1,
  use: {baseURL: 'http://127.0.0.1:' + port, acceptDownloads: true,
    // Software rasterisation: with GPU raster on, identical code produced different raster bytes
    // between runs (measured), which would make a byte-level golden meaningless.
    launchOptions: {args: ['--disable-gpu', '--disable-gpu-rasterization', '--disable-accelerated-2d-canvas']}},
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined}}],
  webServer: {command: 'python -m http.server ' + port + ' --bind 127.0.0.1',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)), url: 'http://127.0.0.1:' + port + '/hub/shared/tests/addons-a3-fixture.html', reuseExistingServer: false}
});
