import config from './playwright.config.mjs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
process.env.ALM_TEST_BASE_URL='http://127.0.0.1:8000';
export default {
 ...config,
 outputDir: '../../../integration-evidence/screen-csv-test-results',
 use: {...config.use, baseURL:process.env.ALM_TEST_BASE_URL},
 webServer: {
  ...config.webServer,
  command:'python -m http.server 8000 --bind 127.0.0.1 --directory .',
  cwd:root, port:undefined,
  url:process.env.ALM_TEST_BASE_URL+'/screen/validate/MANIFEST.json',
 },
};
