// Accounts + cross-device sync (shared/alm-auth.js) and Paper Studio autosave.
// With no backend configured the module must run in honest LOCAL-ONLY mode (no
// network, clear messaging), and its newest-wins merge engine must be correct.
// Paper Studio writing must autosave to localStorage and restore on reload.
import { test, expect } from "@playwright/test";

test("alm-auth runs local-only when unconfigured, with honest messaging", async ({ page }) => {
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.AlmAuth);

  expect(await page.evaluate(() => window.AlmAuth.isConfigured())).toBe(false);
  const badge = page.locator("#alm-auth .alm-auth-btn");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("This browser only");

  // Clicking it explains the limitation truthfully (does not claim cloud storage).
  await badge.click();
  const card = page.locator(".alm-auth-card");
  await expect(card).toContainText("only in this browser on this device");
  await page.locator(".alm-auth-card .alm-x").click();

  expect(errs).toEqual([]);
});

test("sync merge engine is newest-wins per key (both directions)", async ({ page }) => {
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.AlmAuth);
  const r = await page.evaluate(() => {
    const A = window.AlmAuth;
    A._setTrackedForTest(["k"]);
    // remote newer overwrites local
    localStorage.setItem("alm-sync-meta-v1", JSON.stringify({ k: 1000 }));
    localStorage.setItem("k", "LOCAL_OLD");
    const c1 = A._mergeRemote({ k: { v: "REMOTE_NEW", t: 2000 } });
    const afterNewer = localStorage.getItem("k");
    // local newer is kept against a stale remote
    localStorage.setItem("alm-sync-meta-v1", JSON.stringify({ k: 5000 }));
    localStorage.setItem("k", "LOCAL_NEWER");
    const c2 = A._mergeRemote({ k: { v: "REMOTE_STALE", t: 3000 } });
    const afterOlder = localStorage.getItem("k");
    localStorage.removeItem("k"); localStorage.removeItem("alm-sync-meta-v1");
    return { afterNewer, c1, afterOlder, c2 };
  });
  expect(r.afterNewer).toBe("REMOTE_NEW");
  expect(r.c1).toEqual(["k"]);
  expect(r.afterOlder).toBe("LOCAL_NEWER");
  expect(r.c2).toEqual([]);
});

test("shared-machine guard: a different user signing in does not upload the previous user's local work", async ({ page }) => {
  await page.goto("/screen/index.html");
  await page.waitForFunction(() => !!window.AlmAuth);
  const r = await page.evaluate(() => {
    const A = window.AlmAuth;
    A._setTrackedForTest(["k"]);
    // user A owned this browser and edited k recently
    A._claimOwner("user-A");
    localStorage.setItem("alm-sync-meta-v1", JSON.stringify({ k: 9999 }));
    localStorage.setItem("k", "USER_A_WORK");
    // user B signs in: guard zeroes local change-times so the cloud wins on merge
    A._prepareOwner("user-B");
    const metaAfter = JSON.parse(localStorage.getItem("alm-sync-meta-v1") || "{}");
    // user B's cloud copy (any timestamp) now overrides A's leftover local work
    const changed = A._mergeRemote({ k: { v: "USER_B_CLOUD", t: 1 } });
    const val = localStorage.getItem("k");
    // same-user path keeps local work
    A._claimOwner("user-C");
    localStorage.setItem("alm-sync-meta-v1", JSON.stringify({ k: 9999 }));
    localStorage.setItem("k", "USER_C_LOCAL");
    A._prepareOwner("user-C");
    const sameUser = A._mergeRemote({ k: { v: "USER_C_STALE", t: 5 } });
    const valSame = localStorage.getItem("k");
    localStorage.removeItem("k"); localStorage.removeItem("alm-sync-meta-v1"); localStorage.removeItem("alm-sync-owner");
    return { metaZeroed: Object.keys(metaAfter).length === 0, changed, val, sameUser, valSame };
  });
  expect(r.metaZeroed).toBe(true);          // different user → local change-times cleared
  expect(r.val).toBe("USER_B_CLOUD");        // cloud (user B) wins, A's work not kept/uploaded
  expect(r.sameUser).toEqual([]);            // same user → stale remote ignored
  expect(r.valSame).toBe("USER_C_LOCAL");    // same user's local work preserved
});

test("Paper Studio autosaves writing to localStorage and restores it on reload", async ({ page }) => {
  await page.goto("/paper/index.html");
  await page.waitForFunction(() => !!window.PaperStudio);
  // status starts honest, not a misleading static "Saved"
  await expect(page.locator("#paperSaveStatus")).toContainText("Autosaves as you type");

  await page.evaluate(() => {
    const f = document.querySelector('#paperCanvas [data-field="studentText.title"]') ||
              document.querySelector('#paperCanvas [data-field]');
    f.focus();
    f.innerText = "AUTOSAVE SPEC TITLE";
    f.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  // debounced save (500ms) lands and is reflected in the indicator + storage
  await expect(page.locator("#paperSaveStatus")).toContainText("Saved", { timeout: 4000 });
  const saved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("rapidmeta.paperState") || "{}");
    return s.studentText && s.studentText.title;
  });
  expect(saved).toBe("AUTOSAVE SPEC TITLE");

  await page.reload();
  await page.waitForFunction(() => !!window.PaperStudio);
  const restored = await page.evaluate(() => {
    const el = document.querySelector('#paperCanvas [data-field="studentText.title"]');
    return el ? el.innerText : null;
  });
  expect(restored).toBe("AUTOSAVE SPEC TITLE");
});

test("every workflow stage states the user's task in plain language", async ({ page }) => {
  const stages = [
    ["/search/index.html", "find the studies"],
    ["/screen/index.html", "decide which records to include"],
    ["/extract/index.html", "VERIFY the numbers"],
    ["/forest-plot/index.html", "pool the effects"],
    ["/paper/index.html", "write up the review"],
  ];
  for (const [url, phrase] of stages) {
    await page.goto(url);
    const task = page.locator(".alm-task summary").first();
    await expect(task).toBeVisible();
    await expect(task).toContainText(phrase);
  }
});
