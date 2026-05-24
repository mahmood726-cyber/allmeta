/* Interactive diagnostic for nma-pro-v2 plot rendering.
 *
 * User report (2026-05-24): "as i think in nma pro expacially they done
 * always diplay" — plots don't always render.
 *
 * This spec:
 *   1. Loads /nma-pro-v2/nma-pro-v8.0.html (the monolith)
 *   2. Verifies Plotly is loaded (vendored copy works)
 *   3. Logs every console message + network failure
 *   4. Looks for the runAnalysisBtn (the real button id)
 *   5. Clicks it, waits up to 60 s for networkPlot OR forestPlot to fill
 *   6. Reports which plots have actual Plotly SVGs vs which are stuck on
 *      the .plot-container__empty placeholder
 */
import { test, expect } from "@playwright/test";

test.setTimeout(180_000);

test("nma-pro-v2 plot rendering diagnostic", async ({ page }) => {
  const consoleLog: string[] = [];
  const netFails: string[] = [];

  page.on("console", msg => {
    consoleLog.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", err => {
    consoleLog.push(`[pageerror] ${err.message}`);
  });
  page.on("requestfailed", req => {
    netFails.push(`${req.url()} -> ${req.failure()?.errorText ?? "?"}`);
  });

  await page.goto("/nma-pro-v2/nma-pro-v8.0.html", { waitUntil: "load" });

  // Plotly should be defined within a few seconds.
  await page.waitForFunction(
    () => typeof (window as unknown as { Plotly?: unknown }).Plotly !== "undefined",
    null,
    { timeout: 15_000 },
  );
  const plotlyOk = await page.evaluate(() => {
    const w = window as unknown as { Plotly?: { version?: string } };
    return { defined: typeof w.Plotly !== "undefined", version: w.Plotly?.version };
  });
  console.log("Plotly status:", plotlyOk);

  // What plot containers exist?
  const containers = await page.locator(".plot-container").evaluateAll(els =>
    els.map(el => ({
      id: el.id,
      hasEmptyPlaceholder: !!el.querySelector(".plot-container__empty"),
      hasPlotlySvg: !!el.querySelector(".main-svg"),
    })),
  );
  console.log("Initial plot-container inventory:", JSON.stringify(containers, null, 2));

  // What run buttons exist?
  const runButtons = await page.locator("button[id]").evaluateAll(els =>
    els
      .map(el => ({ id: (el as HTMLElement).id, text: (el as HTMLElement).innerText.trim().slice(0, 40) }))
      .filter(b => /run|analy|compute/i.test(b.id) || /run|analy|compute/i.test(b.text)),
  );
  console.log("Run-ish buttons:", JSON.stringify(runButtons, null, 2));

  // The Run Analysis button needs DATA. loadDemo is a top-level `function`
  // declaration in the monolith, so it lives on window. (BenchmarkDatasets
  // is `const` and therefore NOT on window — call loadDemo directly.)
  const loaded = await page.evaluate(() => {
    const w = window as unknown as { loadDemo?: () => unknown };
    if (typeof w.loadDemo === "function") {
      try { w.loadDemo(); return "ok"; }
      catch (e) { return "err: " + (e as Error).message; }
    }
    return "loadDemo missing";
  });
  console.log("loadDataset result:", loaded);

  // Wait briefly for renderStudyTable to settle, then verify state.
  await page.waitForTimeout(500);
  const stateAfterLoad = await page.evaluate(() => {
    const w = window as unknown as { AppState?: { studies?: unknown[] } };
    const studies = w.AppState?.studies ?? [];
    const tbody = document.getElementById("studyTableBody");
    return {
      appStateStudyCount: studies.length,
      tableRowCount: tbody?.children.length ?? -1,
    };
  });
  console.log("after loadDemo:", stateAfterLoad);

  // Click the canonical Run Analysis button if present.
  const runBtn = page.locator("#runAnalysisBtn");
  if (await runBtn.count() > 0) {
    console.log("clicking #runAnalysisBtn …");
    await runBtn.scrollIntoViewIfNeeded();
    await runBtn.click({ timeout: 5_000 });
  } else {
    console.log("WARN: #runAnalysisBtn not found");
  }

  // Wait up to 60 s for any plot-container to be populated by Plotly.
  const populated = await page
    .waitForFunction(() => {
      const cs = document.querySelectorAll(".plot-container");
      for (const c of Array.from(cs)) {
        if (c.querySelector(".main-svg")) return true;
      }
      return false;
    }, null, { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);

  const after = await page.locator(".plot-container").evaluateAll(els =>
    els.map(el => ({
      id: el.id,
      hasEmptyPlaceholder: !!el.querySelector(".plot-container__empty"),
      hasPlotlySvg: !!el.querySelector(".main-svg"),
      childCount: el.childElementCount,
    })),
  );
  console.log("Post-click plot-container inventory:", JSON.stringify(after, null, 2));

  console.log(`Console messages (${consoleLog.length}):`);
  for (const m of consoleLog.slice(0, 40)) console.log("  " + m);
  console.log(`Network failures (${netFails.length}):`);
  for (const n of netFails.slice(0, 20)) console.log("  " + n);

  // Hard assertion: at least one plot must render.
  expect(populated, "no .plot-container ever showed a Plotly .main-svg").toBeTruthy();
  expect(after.some(c => c.hasPlotlySvg), "no populated plot found in final DOM").toBeTruthy();
});
