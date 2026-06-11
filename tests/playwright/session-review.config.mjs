// Runs ALL of this session's Playwright specs together via system Chrome
// (bundled-chromium CDN is blocked on this host). One http-server, sequential.
import { defineConfig } from "@playwright/test";

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
  use: { baseURL: "http://127.0.0.1:8080", channel: "chrome", headless: true, screenshot: "off", video: "off" },
  webServer: {
    command: "npx http-server ../.. -p 8080 -c-1 --silent",
    url: "http://127.0.0.1:8080/index.html",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
