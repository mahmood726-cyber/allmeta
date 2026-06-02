import { defineConfig, devices } from "@playwright/test";

// Config for the deployed-artifact crawl (pages-crawl.spec.ts). Unlike the main
// config, it does NOT start a local web server — it hits the live GitHub Pages
// site over the network — and runs only the pages-crawl spec. A couple of
// workers + one retry keep it gentle on the live host while tolerating transient
// network blips.
export default defineConfig({
  testDir: ".",
  testMatch: "pages-crawl.spec.ts",
  timeout: 45_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: 4,
  retries: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/pages-crawl-report.json" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
