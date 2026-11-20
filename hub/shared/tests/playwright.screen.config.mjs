import config from './playwright.config.mjs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
// ALM_BASE_URL picks the origin (and so the port) this config serves; default unchanged.
process.env.ALM_TEST_BASE_URL=(process.env.ALM_BASE_URL||'http://127.0.0.1:8000').replace(/\/+$/,'');
const ALM_PORT=new URL(process.env.ALM_TEST_BASE_URL).port||'80';
export default {
 ...config,
 outputDir: '../../../integration-evidence/screen-csv-test-results',
 use: {...config.use, baseURL:process.env.ALM_TEST_BASE_URL},
 webServer: {
  ...config.webServer,
  command:`python -m http.server ${ALM_PORT} --bind 127.0.0.1 --directory .`,
  cwd:root, port:undefined,
  url:process.env.ALM_TEST_BASE_URL+'/screen/validate/MANIFEST.json',
 },
};
