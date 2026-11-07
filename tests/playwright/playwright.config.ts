import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://127.0.0.1:8080",
    trace: "retain-on-failure",
    screenshot: "on",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npx http-server ../.. -p 8080 -c-1 --silent",
    url: "http://127.0.0.1:8080/index.html",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
