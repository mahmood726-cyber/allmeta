// System-Chrome config for the review-project shell smoke.
// Bundled-chromium CDN download is blocked on this host, so drive the
// installed Google Chrome via channel:"chrome" (per the project's recorded
// Playwright gotcha). Reuses the repo http-server.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "review-project-shell.spec.mjs",
  timeout: 45_000,
  expect: { timeout: 5_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8080",
    channel: "chrome",
    headless: true,
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "npx http-server ../.. -p 8080 -c-1 --silent",
    url: "http://127.0.0.1:8080/index.html",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
