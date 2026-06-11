// Rayyan-style immersive Focus mode for the Screen app: one big card, no
// sidebar, sticky progress + key legend, keyboard-driven and persisted.
import { test, expect } from "@playwright/test";

const APP = "/screen/index.html";

test("Focus mode toggles, hides chrome, persists, and keeps the keyboard flow", async ({ page }) => {
  await page.goto(APP);   // fresh Playwright context => empty localStorage, not in focus mode
  await page.waitForFunction(() => !!window.__almScreenpro);
  await page.click("#btn-example");                       // load demo records -> a card renders
  await expect(page.locator("#card-host .card")).toBeVisible();

  // starts NOT in focus mode; the setup sidebar is visible
  await expect(page.locator("body")).not.toHaveClass(/focus-mode/);
  await expect(page.locator('aside[aria-label="Project setup"]')).toBeVisible();

  // toggle on via the button
  await page.click("#btn-focus");
  await expect(page.locator("body")).toHaveClass(/focus-mode/);
  await expect(page.locator("#btn-focus")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('aside[aria-label="Project setup"]')).toBeHidden();   // sidebar gone
  await expect(page.locator("#focus-legend")).toBeVisible();                       // key legend shown

  // keyboard still drives screening inside focus mode: 'i' includes + auto-advances
  const posBefore = await page.locator("#pos").textContent();
  await page.keyboard.press("i");
  await expect(page.locator("#pos")).not.toHaveText(posBefore);                    // advanced to next record

  // 'f' exits focus mode
  await page.keyboard.press("f");
  await expect(page.locator("body")).not.toHaveClass(/focus-mode/);

  // re-enter, then reload — the focus preference persists
  await page.click("#btn-focus");
  await expect(page.locator("body")).toHaveClass(/focus-mode/);
  await page.reload();
  await page.waitForFunction(() => !!window.__almScreenpro);
  await expect(page.locator("body")).toHaveClass(/focus-mode/);
  await expect(page.locator("#btn-focus")).toHaveText(/Exit focus/);
});
