import { test, expect } from '@playwright/test';

// dta-sroc share set(): axis bounds are restored into the shared axis control's type=number inputs. set() accepted any
// string Number() reads (0x1, 0b1, ' ') and the input then silently cleared it to '' (automatic axis), and a valid
// decimal the input itself cannot hold ('+1', ' 0.5 ', '5.') was cleared the same way. A bound must be a complete decimal
// number (refused otherwise, nothing changed) and is written as the same number.
const APP = 'dta-sroc', KIND = 'axes';
const MIN = '#alm-axis-mount input[data-edge="min"]';

async function open(page) {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(([app, min]) => !!window.AlmFeatures?.get(app)?.share && !!document.querySelector(min), [APP, MIN]);
}
// Applies a state whose x-axis minimum is v (maximum automatic); returns the refusal message or null.
function setMin(page, v) {
  return page.evaluate(([app, kind, v]) => {
    const b = AlmFeatures.get(app).share, s = b.get();
    let patch;
    if (kind === 'axes') { const a = s.axes.slice(); a[0] = v; a[1] = ''; patch = { axes: a }; }
    else patch = { axis: Object.assign({}, s.axis, { min: v, max: '' }, kind === 'axis-applied' ? { applied: true } : {}) };
    try { b.set(Object.assign({}, s, patch)); return null; } catch (e) { return String(e && e.message || e); }
  }, [APP, KIND, v]);
}
const minValue = page => page.locator(MIN).first().inputValue();

test(APP + ' share set(): valid decimal axis bounds are restored as the same number', async ({ page }) => {
  await open(page);
  for (const [text, shown] of [['2.50', '2.50'], ['1e-3', '1e-3'], ['+1', '1'], [' 0.5 ', '0.5'], ['5.', '5']]) {
    expect(await setMin(page, text), 'accepted: ' + JSON.stringify(text)).toBeNull();
    expect(await minValue(page), 'restored: ' + JSON.stringify(text)).toBe(shown);
  }
});

test(APP + ' share set(): malformed axis bounds are refused and change nothing', async ({ page }) => {
  await open(page);
  expect(await setMin(page, '1')).toBeNull();
  expect(await minValue(page)).toBe('1');
  for (const bad of ['0x1', '0b1', '0o1', ' ', '1e', '1 2', '1,5', '1x', 'Infinity', 'NaN']) {
    expect(await setMin(page, bad), 'refused: ' + JSON.stringify(bad)).not.toBeNull();
    expect(await minValue(page), 'unchanged after ' + JSON.stringify(bad)).toBe('1');
  }
});
