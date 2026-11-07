import { test, expect } from '@playwright/test';

test('initial preset controls participate in Influence replay locking before the first preset frame', async ({ page }) => {
  test.setTimeout(240000);
  await page.addInitScript(() => {
    const requestFrame = window.requestAnimationFrame.bind(window);
    window.__presetFrames = [];
    // Reproduce a slow first preset frame without delaying any app rendering.
    window.requestAnimationFrame = callback => callback === window.AlmFigPresets?.scan
      ? window.__presetFrames.push(callback)
      : requestFrame(callback);
  });
  await page.goto('/influence/index.html');
  await page.waitForFunction(() => !!window.AlmFigPresets);
  await page.evaluate(() => AlmInfluenceValidation.prepare());
  const before = await page.evaluate(() => {
    window.__pageControls = () => [...document.querySelectorAll('textarea,input,select,button')]
      .filter(el => !el.closest('#alm-validate'));
    return __pageControls().map(el => el.disabled);
  });
  await page.evaluate(() => { window.__presetReplay = AlmInfluenceValidation.runCorpus(); });
  await expect(page.locator('#src')).toBeDisabled();
  const during = await page.evaluate(() => {
    __presetFrames.splice(0).forEach(callback => callback(performance.now()));
    return { locked: __pageControls().every(el => el.disabled),
      exports: document.querySelectorAll('.alm-figpresets button').length };
  });
  expect(during.exports).toBe(4);
  expect(during.locked).toBe(true);
  const result = await page.evaluate(() => __presetReplay);
  expect(result.checks).toBe(164802);
  expect(result.passed).toBe(164802);
  expect(result.failed).toEqual([]);
  expect(await page.evaluate(() => __pageControls().map(el => el.disabled))).toEqual(before);
  await expect(page.locator('#src')).toBeEditable();
  await expect(page.locator('.alm-figpresets button').first()).toBeEnabled();
});
