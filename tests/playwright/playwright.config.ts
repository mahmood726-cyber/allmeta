import { defineConfig, devices } from "@playwright/test";
// One origin for the page server: set ALM_BASE_URL to serve and test this checkout on your own port.
const ALM_BASE_URL = (process.env.ALM_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const ALM_PORT = new URL(ALM_BASE_URL).port || '80';

export default defineConfig({
  testDir: ".",
  // The deployed-site crawl fetches the live Pages site, so here it would judge the
  // last deploy instead of this checkout. nightly-pages-crawl.yml runs it with
  // playwright.pages.config.ts; hub-crawl.spec.ts covers this checkout.
  testIgnore: "pages-crawl.spec.ts",
  timeout: 45_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/html-report", open: "never" }],
    ["json", { outputFile: "artifacts/report.json" }],
  ],
  use: {
    baseURL: ALM_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "on",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx http-server ../.. -p ${ALM_PORT} -c-1 --silent`,
    url: ALM_BASE_URL + "/index.html",
    reuseExistingServer: process.env.ALM_REUSE_SERVER === '1',
    timeout: 30_000,
  },
});
