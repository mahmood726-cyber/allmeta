// P2: grade-sof auto-runs the integrity panel over the study + pooled buses and
// surfaces multiverse-robustness / small-study / E-value verdicts in the
// certainty step — flagging a false-robust pool.
import { test, expect } from "@playwright/test";

test("grade-sof runs the integrity-by-default panel and flags a false-robust pool", async ({ page }) => {
  await page.goto("/grade-sof/index.html");

  // engines + panel live in-page
  const ready = await page.evaluate(() => ({
    panel: !!(window.AlmIntegrityPanel && window.AlmIntegrityPanel.assess),
    deps: !!(window.AlmSpecCollapse && window.AlmEgger && window.AlmEValue && window.AlmMaCore),
  }));
  expect(ready).toEqual({ panel: true, deps: true });

  // seed the buses with the spec-collapse atlas false-robust dataset (log scale)
  const res = await page.evaluate(() => {
    localStorage.setItem("ma-studies-v1", JSON.stringify({
      _schema: "ma-studies-v1",
      studies: [
        { est: -0.25, se: 0.22 }, { est: -0.15, se: 0.20 }, { est: -0.40, se: 0.30 }, { est: 0.00, se: 0.18 },
        { est: -0.30, se: 0.26 }, { est: -0.05, se: 0.17 }, { est: -0.45, se: 0.33 }, { est: -0.12, se: 0.19 },
      ],
    }));
    window.MaPooled.write(window.MaPooled.fromEstSE(0.80, 0.11, { scale: "ratio", measure: "OR", k: 8 }));
    const r = window.__almIntegrity();
    const sc = r.checks.find((c) => c.key === "spec-collapse");
    return { keys: r.checks.map((c) => c.key), scStatus: sc.status, scVerdict: sc.verdict, flags: r.summary.flags };
  });

  expect(res.keys).toEqual(["spec-collapse", "egger", "evalue"]);
  expect(res.scStatus).toBe("flag");
  expect(res.scVerdict).toMatch(/FALSE-ROBUST/);
  expect(res.flags).toBeGreaterThanOrEqual(1);

  // the panel renders into the certainty UI
  await page.click("#btn-integrity");
  const host = page.locator("#integrity-host");
  await expect(host).toContainText("Multiverse robustness");
  await expect(host).toContainText(/FALSE-ROBUST/);
  await expect(host).toContainText("E-value");
  await expect(host).toContainText("INSPECT-SR");   // pointer to the checklist app
});
