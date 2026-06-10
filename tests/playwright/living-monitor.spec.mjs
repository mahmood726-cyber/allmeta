// P1: the living-review app seals each recorded analysis version into a signed,
// SHA-256-chained audit trail, and verification pinpoints any tampered version.
import { test, expect } from "@playwright/test";

test("living-review update history is signed, chained, and tamper-evident", async ({ page }) => {
  await page.goto("/living-meta/living-meta-complete.html");

  // wait for the app + data layer + signed-audit hook to be ready
  await page.waitForFunction(() => window.__almLiving && window.LMA && window.LMA.db && window.LMA.db.appState, null, { timeout: 15000 });

  const result = await page.evaluate(async () => {
    const A = window.__almLiving, pid = "pw-test";
    await window.LMA.db.appState.put({ id: `history_${pid}`, updates: [] }); // clean slate
    A.setKey("SECRET");

    await A.record(pid, { k: 5, estimate: -0.15, ci_lower: -0.25, ci_upper: -0.05, tau2: 0.02, I2: 30 });
    await A.record(pid, { k: 7, estimate: -0.20, ci_lower: -0.30, ci_upper: -0.10, tau2: 0.03, I2: 35 });

    const hist = await A.history(pid);
    const good = await A.verify(pid);

    await A.tamper(pid, 1, "estimate", -0.99);     // alter the 2nd recorded version
    const bad = await A.verify(pid);

    const wrongKey = (window.LMA.setSignKey("WRONG"), await A.verify(pid));
    return {
      n: hist.length, sealed: !!(hist[1] && hist[1]._seal && hist[1]._seal.signed),
      good, bad, wrongBroken: wrongKey.valid,
    };
  });

  expect(result.n).toBe(2);
  expect(result.sealed).toBe(true);                 // versions carry a signature seal
  expect(result.good.valid).toBe(true);
  expect(result.good.signed).toBe(true);
  expect(result.bad.valid).toBe(false);             // content tamper caught
  expect(result.bad.brokenAt).toBe(1);
  expect(result.wrongBroken).toBe(false);           // wrong key fails the signature

  // the header verify control + key control exist
  await expect(page.locator("#verify-provenance-btn")).toBeVisible();
  await expect(page.locator("#sign-key-btn")).toBeVisible();
});
