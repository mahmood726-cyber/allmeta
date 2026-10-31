import { test, expect } from '@playwright/test';

// multivariate-ma number settings. The assumed within-study correlation (rhoW mode) and the rhoW sweep grid are
// type=number inputs read with Number(): text the browser cannot read ("1e", "-", or an emptied field) leaves value ''
// and Number('') is 0, so the page silently fitted rhoW = 0 or swept from 0. share set() accepted any string Number()
// reads (0x0, ' ') and the input then cleared it to '' (= 0), and a valid '+0.3' was cleared the same way. Now an
// unreadable value is refused with the existing message, and valid decimal forms give the same fit.
const APP = 'multivariate-ma';
const SRC = 'Trial 1, 0.47, 0.0075, -0.32, 0.0077\nTrial 2, 0.20, 0.0057, -0.60, 0.0008\nTrial 3, 0.40, 0.0021, -0.12, 0.0014\n' +
  'Trial 4, 0.26, 0.0029, -0.31, 0.0015\nTrial 5, 0.56, 0.0148, -0.39, 0.0304';
const REFUSED = 'Refused: Assumed within-study correlation must satisfy |ρw| < 1.';

async function open(page) {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(app => !!window.AlmFeatures?.get(app)?.share, APP);
}
function setRho(page, rhoW) {
  return page.evaluate(([app, src, rhoW]) => {
    const b = AlmFeatures.get(app).share;
    try { b.set(Object.assign({}, b.get(), { src, names: ['A', 'B'], mode: 'rhoW', rhoW })); }
    catch (e) { return { error: String(e && e.message || e) }; }
    return { error: null, value: document.getElementById('f-rhow').value, fit: JSON.stringify(window._almLastMultivariate()) };
  }, [APP, SRC, rhoW]);
}

test('multivariate-ma share set(): valid rhoW forms give the same fit; malformed rhoW is refused and changes nothing', async ({ page }) => {
  await open(page);
  const ref = await setRho(page, '0.3');
  expect(ref.error).toBeNull();
  expect(ref.fit).not.toBe('null');
  for (const [text, shown] of [['+0.3', '0.3'], [' 0.3 ', '0.3'], ['3e-1', '3e-1'], ['.30', '.30']]) {
    const r = await setRho(page, text);
    expect(r.error, 'accepted: ' + JSON.stringify(text)).toBeNull();
    expect(r.value).toBe(shown);
    expect(r.fit, 'same fit for ' + JSON.stringify(text)).toBe(ref.fit);
  }
  for (const bad of ['0x0', '0b0', '0o0', ' ', '0.3x', '0,3', 'NaN']) {
    expect((await setRho(page, bad)).error, 'refused: ' + JSON.stringify(bad)).not.toBeNull();
    expect(await page.locator('#f-rhow').inputValue()).toBe('.30');
  }
});

for (const typed of ['1e', '-', '']) {
  test('multivariate-ma page: an unreadable assumed correlation ' + JSON.stringify(typed) + ' is refused, never fitted as 0', async ({ page }) => {
    await open(page);
    expect((await setRho(page, '0.3')).error).toBeNull();
    const rho = page.locator('#f-rhow');
    await rho.fill('');
    if (typed) await rho.pressSequentially(typed);
    await expect(page.locator('#headline')).toHaveText(REFUSED);
    expect(await page.evaluate(() => window._almLastMultivariate())).toBeNull();
  });
}

test('multivariate-ma sweep: an unreadable grid value is refused, never read as 0', async ({ page }) => {
  await open(page);
  expect((await setRho(page, '0.3')).error).toBeNull();
  for (const id of ['plus-from', 'plus-to', 'plus-step']) {
    const before = await page.locator('#' + id).inputValue();
    await page.locator('#' + id).fill('');
    await page.locator('#' + id).pressSequentially('-');
    await page.locator('#plus-run').click();
    await expect(page.locator('#plus-status')).toHaveText('Refused: From, to and step must be numbers.');
    await page.locator('#' + id).fill(before);
  }
  await page.locator('#plus-run').click();
  await expect(page.locator('#plus-status')).toContainText('Sweep complete');
});
