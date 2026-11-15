// Runs ALL of this session's Playwright specs together via system Chrome
// (bundled-chromium CDN is blocked on this host). One http-server, sequential.
import { defineConfig } from "@playwright/test";
// One origin for the page server: set ALM_BASE_URL to serve and test this checkout on your own port.
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const ALM_PORT = new URL(ALM_BASE_URL).port || '80';

export default defineConfig({
  testDir: ".",
  testMatch: [
    // benchmark gap closures + shell
    "review-project-shell.spec.mjs", "screen-collab.spec.mjs", "sr-records.spec.mjs",
    "extract-pdf.spec.mjs", "screen-rct.spec.mjs", "living-monitor.spec.mjs", "grade-integrity.spec.mjs",
    // differentiation integrations
    "transportability.spec.mjs", "km-fusion.spec.mjs", "benefit-risk.spec.mjs", "transitivity.spec.mjs",
    "registry-survival.spec.mjs", "search-completeness.spec.mjs", "surrogate.spec.mjs", "registry-pubbias.spec.mjs",
  ],
  timeout: 45_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: ALM_BASE_URL, channel: "chrome", headless: true, screenshot: "off", video: "off" },
  webServer: {
    command: `npx http-server ../.. -p ${ALM_PORT} -c-1 --silent`,
    url: ALM_BASE_URL + "/index.html",
    reuseExistingServer: process.env.ALM_REUSE_SERVER === '1',
    timeout: 30_000,
  },
});
