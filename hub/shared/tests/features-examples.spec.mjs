import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { evidenceFiles, clearExampleEvidence, prepareExampleEvidence } from '../../../validation/examples/plain-evidence.mjs';

const root = new URL('../../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('validation/examples/manifest.json', root), 'utf8'));
const url = app => `http://127.0.0.1:${process.env.ALM_FEATURES_PORT || 8089}/${app}/`;
const plain = new URL('hub/shared/tests/rchecks-out/examples/', root);
test.beforeAll(()=>{
  prepareExampleEvidence(plain, manifest);
});

for (const item of manifest) {
  test(`${item.app}: real package example loads, runs and displays its citation`, async ({ page }) => {
    const artifact = new URL(item.app + '.app.json', plain);
    // Playwright restarts the worker after a failure, including beforeAll.
    // Clear this test's evidence only; retain prior successful page captures.
    clearExampleEvidence(plain, item.app);
    await page.goto(url(item.app));
    await expect(page.locator('#alm-real-example-load')).toBeVisible();
    const input = page.locator(item.input);
    const original = await input.inputValue();
    expect(original.length).toBeGreaterThan(0);
    await expect(page.locator('#alm-real-example-citation')).toHaveText('');
    await page.selectOption('#alm-real-example-choice', item.dataset);
    expect(await input.inputValue(), 'selection alone preserves the current analysis').toBe(original);
    await page.click('#alm-real-example-load');
    await expect(page.locator('#alm-real-example-status')).toHaveAttribute('data-state', 'ready');
    const data = JSON.parse(readFileSync(new URL(`validation/examples/${item.app}/${item.dataset}.json`, root), 'utf8'));
    await expect(page.locator('#alm-real-example-citation')).toContainText(data.citation);
    await expect(page.locator('#alm-real-example-citation')).toContainText(data.source_package);
    await expect(page.locator('#alm-real-example-citation')).toContainText('Data values are facts');
    const payload = await page.evaluate(() => AlmExamples.capture());
    expect(payload.app).toBe(item.app);
    expect(payload.dataset).toBe(item.dataset);
    expect(payload.appValues.length).toBeGreaterThan(0);
    expect(payload.display.length).toBeGreaterThan(0);
    expect(payload.display.every(v => v.text.length && Number.isFinite(v.value))).toBe(true);
    writeFileSync(artifact, JSON.stringify(payload) + '\n');
    for(const [name,content] of Object.entries(evidenceFiles(payload,data)))
      writeFileSync(new URL(item.app+'.'+name,plain),content);
    // Planted UI corruption must be detected even if a legacy live adapter rerenders.
    await page.evaluate(() => { AlmExamples.displayElements()[0].textContent = '987654321'; });
    await expect(page.evaluate(() => AlmExamples.capture())).rejects.toThrow(/display/i);
  });
}

test('planted missing citation fails before it can overwrite the current data', async ({ page }) => {
  const item = manifest.find(x => x.app === 'correlation-ma');
  await page.route('**/validation/examples/correlation-ma/*.json', async route => {
    const response = await route.fetch();
    const data = await response.json();
    delete data.citation;
    await route.fulfill({ response, json: data });
  });
  await page.goto(url(item.app));
  await expect(page.locator('#alm-real-example-load')).toBeVisible();
  const original = await page.locator(item.input).inputValue();
  await page.click('#alm-real-example-load');
  await expect(page.locator('#alm-real-example-status')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#alm-real-example-status')).toContainText('citation');
  expect(await page.locator(item.input).inputValue()).toBe(original);
  await expect(page.evaluate(() => AlmExamples.capture())).rejects.toThrow(/example/i);
});

for (const app of ['dta-sroc', 'limit-ma', 'gosh']) {
  test(`${app}: example panel preserves plot layout and detects a planted layout shift`, async ({ page }) => {
    await page.goto(url(app));
    await expect(page.locator('#alm-real-example-load')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => {
      const panel = document.getElementById('alm-real-example-panel');
      const features = document.getElementById('alm-features');
      if (panel.closest('main') || panel.previousElementSibling !== features)
        throw Error('Example panel is outside the shared feature area');
      const plots = [...document.querySelectorAll('svg,canvas')].filter(el => !el.closest('#alm-real-example-panel,#alm-features'));
      const bounds = () => plots.map(el => {
        const r = el.getBoundingClientRect();
        return [r.left + scrollX, r.top + scrollY, r.width, r.height];
      });
      const shown = bounds();
      panel.remove();
      const control = bounds();
      // Deliberately reproduce the former placement above the plots.
      document.body.prepend(panel);
      const planted = bounds();
      features.insertAdjacentElement('afterend', panel);
      return { shown, control, planted, restored: bounds() };
    });
    expect(layout.control.length).toBeGreaterThan(0);
    expect(layout.shown).toEqual(layout.control);
    expect(layout.planted).not.toEqual(layout.control);
    expect(layout.restored).toEqual(layout.control);
  });
}
