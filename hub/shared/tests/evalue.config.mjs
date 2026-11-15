import base from './playwright.config.mjs';
// One origin for the page server: set ALM_BASE_URL to serve and test this checkout on your own port.
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const ALM_PORT = new URL(ALM_BASE_URL).port || '80';

export default {
  ...base,
  testMatch: 'evalue-input-integrity.spec.mjs',
  workers: 1,
  use: { ...base.use, baseURL: ALM_BASE_URL },
  webServer: {
    command: `python -m http.server ${ALM_PORT} --bind 127.0.0.1 --directory ../../../`,
    url: ALM_BASE_URL + '/evalue/',
    cwd: '.',
    reuseExistingServer: false,
    timeout: 15_000,
  },
};
