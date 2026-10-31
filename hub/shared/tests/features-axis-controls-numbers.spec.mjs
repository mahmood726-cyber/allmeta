import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// hub/shared/axis-controls.js: an axis bound the browser cannot read as a number must be refused with the control's
// own inline message, never treated as "automatic". Chromium leaves a type=number input with value '' and
// validity.badInput true for text such as "1e", "-", "1-2" or "1e999"; the control read value '' as null (auto),
// emitted the change and redrew the plot on an automatic axis with no message. A genuinely empty field still means
// automatic, and valid decimal forms are unchanged. Real keystrokes are typed: assigning .value erases the text and
// does not reproduce the badInput state.
const MODULE_SRC = readFileSync(new URL('../axis-controls.js', import.meta.url), 'utf-8');
const HARNESS = `<!doctype html><html><body><div id="axis-mount"></div>
<script src="/hub/shared/axis-controls.js"></script>
<script>
  window._emits = [];
  window.alm.axisControls({ target: '#axis-mount',
    axes: [{ key: 'x', label: 'X', range: [0, 10], log: false }, { key: 'y', label: 'Y', range: [-1, 1], log: false }],
    onChange: state => { window._emits.push(state); } });
</script></body></html>`;

async function open(page) {
  await page.route('**/hub/shared/axis-controls.js', route => route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC }));
  await page.goto('/');
  await page.setContent(HARNESS);
  await page.waitForFunction(() => window.alm && window.alm.axisControls);
}
const input = (page, axis, edge) => page.locator(`#axis-mount input[data-axis="${axis}"][data-edge="${edge}"]`);
async function type(page, axis, edge, text) {
  const el = input(page, axis, edge);
  await el.fill('');
  await el.pressSequentially(text);
  await el.press('Tab');
}
const emits = page => page.evaluate(() => window._emits);
const error = page => page.locator('#axis-mount [data-error]');

for (const malformed of ['1e', '-', '1-2', '1e999']) {
  test('axis-controls refuses an unreadable bound "' + malformed + '" with its inline message instead of an automatic axis', async ({ page }) => {
    await open(page);
    await type(page, 'x', 'min', malformed);
    expect(await input(page, 'x', 'min').evaluate(el => ({ value: el.value, bad: el.validity.badInput }))).toEqual({ value: '', bad: true });
    await expect(error(page)).toHaveText('X min must be a number');
    expect(await emits(page), 'no change is emitted').toEqual([]);
    // Another edit elsewhere is still withheld while the bad bound stands.
    await type(page, 'y', 'max', '2');
    await expect(error(page)).toHaveText('X min must be a number');
    expect(await emits(page)).toEqual([]);
    // Correcting it clears the message and emits the corrected range.
    await type(page, 'x', 'min', '2');
    await expect(error(page)).toHaveText('');
    const all = await emits(page);
    expect(all.length).toBe(1);
    expect(all[0].x).toEqual([2, 10]);
    expect(all[0].y).toEqual([-1, 2]);
  });
}

test('axis-controls: valid decimal bounds and an emptied field (automatic) are unchanged', async ({ page }) => {
  await open(page);
  for (const [text, value] of [['1e-3', 0.001], ['-0.5', -0.5], ['.5', 0.5], ['2.50', 2.5]]) {
    await type(page, 'x', 'min', text);
    await expect(error(page)).toHaveText('');
    expect((await emits(page)).at(-1).x).toEqual([value, 10]);
  }
  await input(page, 'x', 'max').fill('');
  await input(page, 'x', 'max').press('Tab');
  await expect(error(page)).toHaveText('');
  expect((await emits(page)).at(-1).x).toEqual([2.5, null]);
  await type(page, 'x', 'min', '99');
  await type(page, 'x', 'max', '5');
  await expect(error(page)).toHaveText('X min must be < max');
});
