// shared/webr-runner.js must report an R error as {ok:false, error:<R's message>}. Before 2026-10-31 webR's
// captureR (captureConditions:false) caught the error, wrote it to stderr, and runR returned {ok:true, stdout:""};
// the R text was discarded and the validators showed only "R must emit exactly one ALMJSON record".
// Planted stop() calls below are the defects; warnings must still succeed. Run: -c playwright.features.config.mjs
import { test, expect } from '@playwright/test';

const PAGE = '/proportion-ma/index.html';
const PLANT = "stop('planted R failure 7f3a')";

async function runner(page) {
  await page.goto(PAGE);
  await page.evaluate(() => new Promise((resolve, reject) => {
    if (window.AlmWebR) return resolve();
    const s = document.createElement('script'); s.src = '/shared/webr-runner.js'; s.onload = resolve; s.onerror = reject; document.head.append(s);
  }));
}

test('runR and runRPlots: an R error is ok:false with the R message; warnings and clean scripts still succeed', async ({ page }) => {
  test.setTimeout(300_000);
  await runner(page);
  const r = await page.evaluate(async plant => ({
    error: await AlmWebR.runR({ script: "x <- 1\n" + plant + "\ncat('ALMJSON:{\"a\":1}\\n')" }),
    warning: await AlmWebR.runR({ script: "warning('planted warning'); cat('ALMJSON:{\"a\":1}\\n')" }),
    clean: await AlmWebR.runR({ script: "cat('ALMJSON:{\"a\":2}\\n')" }),
    after: await AlmWebR.runR({ script: "cat('ALMJSON:{\"a\":3}\\n')" }),
    plotsError: await AlmWebR.runRPlots({ script: plant, plots: [] }),
    plotsWarning: await AlmWebR.runRPlots({ script: "warning('planted warning'); cat('ALMJSON:{\"a\":4}\\n')", plots: [] }),
  }), PLANT);
  expect(r.error.ok).toBe(false);
  expect(r.error.error).toContain('planted R failure 7f3a');
  expect(r.warning).toMatchObject({ ok: true, stdout: 'ALMJSON:{"a":1}' });
  expect(r.clean).toMatchObject({ ok: true, stdout: 'ALMJSON:{"a":2}' });
  expect(r.after).toMatchObject({ ok: true, stdout: 'ALMJSON:{"a":3}' }); // the session survives an R error
  expect(r.plotsError.ok).toBe(false);
  expect(r.plotsError.error).toContain('planted R failure 7f3a');
  expect(r.plotsWarning.ok).toBe(true);
  expect(r.plotsWarning.stdout).toBe('ALMJSON:{"a":4}');
});

test('Validation checks panel shows the R error text; a script with no record keeps the record-count message', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(PAGE);
  const failed = await page.evaluate(async plant => {
    const a = AlmProportionValidationAdapter.live, build = a.buildScript;
    a.buildScript = s => plant + '\n' + build(s);
    try { await AlmProportionValidation.runLive(); return 'resolved'; } catch (e) { return e.message; } finally { a.buildScript = build; }
  }, PLANT);
  expect(failed).toContain('planted R failure 7f3a');
  expect(failed).not.toContain('ALMJSON');
  await expect(page.locator('#alm-validate [role=status]')).toContainText('planted R failure 7f3a');
  const none = await page.evaluate(async () => {
    const a = AlmProportionValidationAdapter.live, build = a.buildScript;
    a.buildScript = () => "cat('no record\\n')";
    try { await AlmProportionValidation.runLive(); return 'resolved'; } catch (e) { return e.message; } finally { a.buildScript = build; }
  });
  expect(none).toBe('R must emit exactly one ALMJSON record');
});

test('Verify in R panel shows the R error text', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(PAGE);
  await page.evaluate(plant => {
    const a = AlmProportionValidationAdapter.live, build = a.buildScript;
    a.buildScript = s => plant + '\n' + build(s);
  }, PLANT);
  const toggle = page.locator('#alm-features .alm-f-toggle');
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('tab', { name: 'Verify in R', exact: true }).click();
  const panel = page.locator('#alm-f-panel-verify');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  const summary = panel.locator('[data-testid=verify-summary]');
  await expect(summary).toContainText('planted R failure 7f3a', { timeout: 240_000 });
  await expect(summary).not.toContainText('ALMJSON');
  expect(await page.evaluate(() => AlmFeaturesState.verify.error)).toContain('planted R failure 7f3a');
});
