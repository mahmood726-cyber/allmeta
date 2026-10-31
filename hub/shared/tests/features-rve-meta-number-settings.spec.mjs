import { test, expect } from '@playwright/test';

// rve-meta share set(): the working correlation rho goes into a type=number input (#f-rho). set() accepted any string
// Number() reads (0x0, 0b1, ' '), and a valid '+0.5' was written as text the input clears to '' (the fit then failed and
// set() reported a fit failure). The same number() helper reads entry-tab values. A value must be a complete decimal
// number (refused otherwise, nothing changed) and is written as the same number.
const APP = 'rve-meta';
async function open(page) {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(app => !!window.AlmFeatures?.get(app)?.share, APP);
}
function setRho(page, rho) {
  return page.evaluate(([app, rho]) => {
    const b = AlmFeatures.get(app).share;
    try { b.set(Object.assign({}, b.get(), { rho })); return null; } catch (e) { return String(e && e.message || e); }
  }, [APP, rho]);
}
test('rve-meta share set(): valid rho forms are restored as the same number; malformed rho is refused and changes nothing', async ({ page }) => {
  await open(page);
  for (const [text, shown] of [['0.8', '0.8'], ['+0.5', '0.5'], [' 0.6 ', '0.6'], ['1e-1', '1e-1']]) {
    expect(await setRho(page, text), 'accepted: ' + JSON.stringify(text)).toBeNull();
    expect(await page.locator('#f-rho').inputValue()).toBe(shown);
  }
  for (const bad of ['0x0', '0b1', '0o1', ' ', '0.5x', '0,5', 'NaN']) {
    expect(await setRho(page, bad), 'refused: ' + JSON.stringify(bad)).not.toBeNull();
    expect(await page.locator('#f-rho').inputValue()).toBe('1e-1');
  }
});
