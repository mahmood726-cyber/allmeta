import { test, expect } from './validation-fixture.mjs';

for (const [app, input] of [['dta-sroc','f-data'], ['meta-regression','f-data'], ['mh-peto','src'], ['multilevel-ma','src'], ['pubbias-tests','src']]) {
  test(app + ': example picker neither saves a draft nor changes original indices', async ({ page }) => {
    await page.goto('/' + app + '/index.html');
    await expect(page.locator('#alm-real-example-choice')).toBeVisible();
    const keys = () => page.evaluate(app => Object.keys(JSON.parse(localStorage.getItem('alm-autosave:' + app) || '{}').values || {}).sort(), app);
    const edit = () => page.evaluate(id => document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true })), input);
    await page.evaluate(() => localStorage.clear());
    await page.locator('#alm-real-example-choice').dispatchEvent('change');
    await page.waitForTimeout(1500);
    expect(await keys()).toEqual([]);
    // Positive control: an original field still creates a draft.
    await edit();
    await expect.poll(keys).toContain(input);
    const mounted = await keys();
    expect(mounted).not.toContain('alm-real-example-choice');
    // Removing the transient panel must leave exactly the same keys.
    await page.locator('#alm-real-example-panel').evaluate(el => el.remove());
    await page.evaluate(() => localStorage.clear());
    await edit();
    await expect.poll(keys).toEqual(mounted);
  });
}
