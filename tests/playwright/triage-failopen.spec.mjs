/**
 * Playwright spec: hub fail-open contract for triage.json
 *
 * Three cases:
 *   (a) triage.json missing  → hub renders cards, no .tier-badge--validated
 *   (b) triage.json malformed → hub renders cards, no .tier-badge--validated
 *   (c) triage.json valid, one tier-1 app → hub renders, .tier-badge--validated visible
 *
 * The spec backs up and restores any pre-existing triage.json so a real scan
 * output is never clobbered. Port 8080 is handled by the webServer block in
 * playwright.config.ts (npx http-server ../.. -p 8080 -c-1 --silent).
 */

import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo root is two levels up from tests/playwright/
const REPO = resolve(__dirname, "../..");
const TRIAGE = resolve(REPO, "triage.json");

/** Save and remove any existing triage.json; returns its content or null. */
function backupTriage() {
  if (!existsSync(TRIAGE)) return null;
  const buf = readFileSync(TRIAGE);
  unlinkSync(TRIAGE);
  return buf;
}

/** Restore a previously backed-up triage.json. No-op if buf is null. */
function restore(buf) {
  if (buf) writeFileSync(TRIAGE, buf);
}

/**
 * Wait for the project card grid to be populated.
 * The hub renders cards asynchronously; we poll until at least one .project-card is visible.
 */
async function waitForCards(page) {
  await expect(page.locator(".project-card").first()).toBeVisible({ timeout: 10_000 });
}

test.describe("Triage fail-open contract", () => {
  // Case (a): triage.json absent — hub should render fine, no tier badge
  test("hub renders when triage.json is missing", async ({ page }) => {
    const buf = backupTriage();
    try {
      await page.goto("/");
      await waitForCards(page);
      // Confirm at least one card is visible
      const cardCount = await page.locator(".project-card").count();
      expect(cardCount).toBeGreaterThan(0);
      // No validated badges — fail-open means no badge, not no render
      await expect(page.locator(".tier-badge--validated")).toHaveCount(0);
    } finally {
      restore(buf);
    }
  });

  // Case (b): triage.json malformed — hub should still render, no tier badge
  test("hub renders when triage.json is malformed", async ({ page }) => {
    const buf = backupTriage();
    writeFileSync(TRIAGE, "not valid json {{{");
    try {
      await page.goto("/");
      await waitForCards(page);
      const cardCount = await page.locator(".project-card").count();
      expect(cardCount).toBeGreaterThan(0);
      await expect(page.locator(".tier-badge--validated")).toHaveCount(0);
    } finally {
      unlinkSync(TRIAGE);
      restore(buf);
    }
  });

  // Case (c): valid triage.json with one tier-1 app — badge must appear
  test("hub renders Tier-1 badge when triage.json is valid", async ({ page }) => {
    const buf = backupTriage();
    // 'forest-plot' maps to path "./forest-plot/index.html"; projectKey() produces "forest-plot".
    const sample = {
      scanner_version: "0.1.0",
      generated_at: "2026-05-13T10:30:00Z",
      totals: { tier_1: 1, tier_2: 0, tier_3: 0, tier_4: 0, tier_5: 0, total: 1 },
      apps: {
        "forest-plot": {
          tier: 1,
          auto_tier: 1,
          override: null,
          kind: "numerical",
          confidence: "high",
          reasons: ["test_count=12"],
          signals: {},
        },
      },
    };
    writeFileSync(TRIAGE, JSON.stringify(sample, null, 2));
    try {
      await page.goto("/");
      await waitForCards(page);
      // At least one .tier-badge--validated must be visible
      await expect(page.locator(".tier-badge--validated").first()).toBeVisible({ timeout: 10_000 });
    } finally {
      unlinkSync(TRIAGE);
      restore(buf);
    }
  });
});
