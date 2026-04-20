import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
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
