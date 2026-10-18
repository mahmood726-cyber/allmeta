import base from './playwright.config.mjs';
export default {
  ...base,
  testMatch: ['bucher*.spec.mjs', 'nma-bus-reader.spec.mjs'],
  grep: /bucher|Bucher/,
  workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:8000' },
  webServer: {
    command: 'python -m http.server 8000 --bind 127.0.0.1 --directory ../../../',
    url: 'http://127.0.0.1:8000/bucher/',
    cwd: '.',
    reuseExistingServer: false,
    timeout: 15_000,
  },
};
