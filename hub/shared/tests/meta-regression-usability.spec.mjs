// Usability checks for the meta-regression extras (#alm-plus): one-click example,
// row-specific refusals, keyboard fitting, accessible names and narrow layout.
// Each positive check is paired with a planted negative showing it can fail.
// Optional: set PLUS_SHOTS_DIR to also write the bubble-plot screenshots there.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';

async function ready(page) {
  await page.goto('/meta-regression/');
  await page.waitForFunction(() => window.AlmMetaPlusValidation && window.AlmMetaPlusUI);
}
const shot = (info, name) => process.env.PLUS_SHOTS_DIR ? path.join(process.env.PLUS_SHOTS_DIR, name) : info.outputPath(name);

test('one-click example restores the BCG data and fits it', async ({ page }) => {
  await ready(page);
  await page.locator('#plus-data').fill('yi,vi,a,b\n1,1,2,3');
  // Planted negative: after editing, no stale result or plot remains.
  await expect(page.locator('#plus-results')).toBeEmpty();
  await expect(page.locator('#plus-plot svg')).toHaveCount(0);
  await page.locator('#plus-interaction').check();
  await page.getByRole('button', { name: 'Load BCG example and fit' }).click();
  await expect(page.locator('#plus-status')).toContainText('Example loaded');
  await expect(page.locator('#plus-interaction')).not.toBeChecked();
  await expect(page.locator('#plus-plot [data-role="bubble"]')).toHaveCount(13);
  await expect(page.locator('#plus-export')).toBeEnabled();
  const audit = await page.evaluate(() => { const c = AlmMetaPlusUI.current(); return AlmMetaPlusDisplay.displayed(c.result, c.input); });
  expect(audit).toEqual([]);
  // The example equals the R-validated BCG configuration bytes in the textarea default.
  expect(await page.locator('#plus-data').inputValue()).toBe(await page.evaluate(() => document.getElementById('plus-data').defaultValue));
});

test('refusals name the row, line and column; valid input is not styled as refused', async ({ page }) => {
  await ready(page);
  const cases = [
    ['yi,vi,a,b\n1,1,2,3\n2,1,,4\n3,1,4,5\n4,1,5,1', 'Row 2 (line 3), column a: value is missing'],
    ['yi,vi,a,b\n1,1,2,3\n2,1,x,4\n3,1,4,5\n4,1,5,1', 'Row 2 (line 3), column a: "x" is not a number'],
    ['yi,vi,a,b\n1,0,2,3\n2,1,3,4\n3,1,4,5\n4,1,5,1', 'Row 1 (line 2), column vi: sampling variances must be greater than zero'],
    ['yi,vi,a,b\n1,1,2\n2,1,3,4', 'Row 1 (line 2) has 3 values but the header has 4'],
    ['effect,var,a,b\n1,1,2,3', 'The first line must be the header yi,vi'],
    ['yi,vi,a,b\n1,1,2,3\n2,1,3,4\n3,1,4,5', 'Need more studies than coefficients'],
    ['yi,vi,a,b\n0x1F,1,2,3\n2,1,3,4\n3,1,4,5\n4,1,5,1', 'Row 1 (line 2), column yi: "0x1F" is not a number'],
    ['yi,vi,a,b\n1,1,0b101,3\n2,1,3,4\n3,1,4,5\n4,1,5,1', 'Row 1 (line 2), column a: "0b101" is not a number'],
    ['yi,vi,a,b\n1,1,2,0o17\n2,1,3,4\n3,1,4,5\n4,1,5,1', 'Row 1 (line 2), column b: "0o17" is not a number'],
    ['yi,vi,a,b\n1,1,2,Infinity\n2,1,3,4\n3,1,4,5\n4,1,5,1', 'Row 1 (line 2), column b: "Infinity" is not a number'],
  ];
  for (const [csv, message] of cases) {
    await page.locator('#plus-data').fill(csv);
    await page.locator('#plus-run').click();
    await expect(page.locator('#plus-status')).toContainText('Refused: ' + message);
    await expect(page.locator('#plus-status')).toHaveClass(/plus-refused/);
    await expect(page.locator('#plus-plot')).toBeEmpty();
    await expect(page.locator('#plus-export')).toBeDisabled();
  }
  await expect(page.locator('#plus-status')).toHaveAttribute('role', 'status');
  // Decimal and exponent forms are accepted (contrast to the hex/binary/octal refusals above).
  const parsed = await page.evaluate(() => AlmMetaPlusUI.parse('yi,vi,a,b\n-.5,1e-3,+2,3E2\n1.,2,3,4', false));
  expect(parsed.yi).toEqual([-0.5, 1]); expect(parsed.vi).toEqual([0.001, 2]); expect(parsed.mods).toEqual([[2, 300], [3, 4]]);
  // Rank refusals carry a centring/rescaling hint; other refusals do not.
  await page.locator('#plus-data').fill('yi,vi,a,b\n1,1,1,1\n2,1,2,2\n3,1,3,3\n4,1,4,4\n5,1,5,5');
  await page.locator('#plus-run').click();
  await expect(page.locator('#plus-status')).toContainText('Refused:');
  await expect(page.locator('#plus-advice')).toContainText('centre or rescale');
  await page.locator('#plus-data').fill('yi,vi,a,b\n1,1,2,3\n2,1,,4\n3,1,4,5\n4,1,5,1');
  await page.locator('#plus-run').click();
  await expect(page.locator('#plus-advice')).toBeEmpty();
  // Planted negative: a valid fit clears the refused styling and message.
  await page.getByRole('button', { name: 'Load BCG example and fit' }).click();
  await expect(page.locator('#plus-status')).not.toHaveClass(/plus-refused/);
  await expect(page.locator('#plus-status')).not.toContainText('Refused');
});

test('keyboard: Tab reaches the controls and Ctrl+Enter fits; plain Enter does not', async ({ page }) => {
  await ready(page);
  await page.locator('#plus-data').fill('yi,vi,a,b');
  await page.locator('#plus-data').focus();
  for (const line of ['1,0.1,1,3', '2,0.2,2,1', '1.5,0.1,3,4', '3,0.3,4,2', '2.5,0.2,5,6']) await page.keyboard.type('\n' + line);
  await page.keyboard.press('Enter'); // planted negative: plain Enter only adds a line
  await expect(page.locator('#plus-plot svg')).toHaveCount(0);
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#plus-plot [data-role="bubble"]')).toHaveCount(5);
  const order = [];
  await page.locator('#plus-data').focus();
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement.id)); }
  expect(order).toEqual(['plus-interaction', 'plus-run', 'plus-example', 'plus-export']);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space'); // activates the example button from the keyboard
  await expect(page.locator('#plus-status')).toContainText('Example loaded');
});

test('accessible names and axe (WCAG 2 A/AA) inside #alm-plus; a removed label is caught', async ({ page }) => {
  await ready(page);
  await expect(page.getByLabel('CSV: yi, vi, then moderator columns')).toBeVisible();
  await expect(page.getByLabel('Include the interaction between the first two moderators')).toBeVisible();
  await expect(page.getByRole('img', { name: 'ML meta-regression bubble plot with confidence band' })).toBeVisible();
  const scan = () => new AxeBuilder({ page }).include('#alm-plus').exclude('#alm-plus-validate').withTags(['wcag2a', 'wcag2aa']).analyze();
  const clean = await scan();
  expect(clean.violations.map(v => v.id)).toEqual([]);
  // Planted negative: strip the textarea's label and description.
  await page.evaluate(() => { document.querySelector('label[for="plus-data"]').remove(); document.getElementById('plus-data').removeAttribute('aria-describedby'); });
  const broken = await scan();
  expect(broken.violations.map(v => v.id)).toContain('label');
});

test('375 px layout: no horizontal overflow from the extras; bubble plot screenshots', async ({ page }, info) => {
  const overflow = () => page.evaluate(() => {
    const s = document.getElementById('alm-plus'), r = s.getBoundingClientRect();
    return { sectionWider: s.scrollWidth > s.clientWidth + 1, offRight: r.right > window.innerWidth + 1, offLeft: r.left < -1,
      plotWidth: document.querySelector('#plus-plot svg').getBoundingClientRect().width };
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page);
  const narrow = await overflow();
  expect(narrow).toMatchObject({ sectionWider: false, offRight: false, offLeft: false });
  expect(narrow.plotWidth).toBeGreaterThan(250);
  await page.locator('#plus-plot').screenshot({ path: shot(info, 'u08-bubble-375px.png') });
  await page.locator('#alm-plus').screenshot({ path: shot(info, 'u08-alm-plus-375px.png') });
  // Planted negative: a 600 px element inside the section must be detected.
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'plant'; d.style.width = '600px'; d.style.height = '1px'; document.getElementById('alm-plus').appendChild(d); });
  expect((await overflow()).sectionWider || (await overflow()).offRight).toBe(true);
  await page.evaluate(() => document.getElementById('plant').remove());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#plus-interaction').check();
  await page.locator('#plus-run').click();
  await expect(page.locator('#plus-plot [data-role="band"]')).toHaveCount(1);
  await page.locator('#plus-plot').screenshot({ path: shot(info, 'u08-bubble-1280px-interaction.png') });
  await page.locator('#plus-interaction').uncheck();
  await page.locator('#plus-run').click();
  await page.locator('#plus-plot').screenshot({ path: shot(info, 'u08-bubble-1280px-additive.png') });
});

// Keys the ORIGINAL app's autosave writes on main (da66b89), captured with the same procedure.
const MAIN_AUTOSAVE_KEYS = ['alm-plot-1-format', 'alm-plot-1-physical-width', 'alm-plot-1-resolution', 'f-data', 'f-effectlabel',
  'f-modlabel', 'f-scale', 'f-title', 'idx:1', 'idx:10', 'idx:11', 'idx:12', 'idx:13', 'idx:14', 'idx:15', 'idx:17', 'idx:2', 'idx:6'];
test('original autosave keys are exactly those on main; the extras are never saved into them', async ({ page }) => {
  await ready(page);
  const keysOf = appKey => page.evaluate(k => Object.keys((JSON.parse(localStorage.getItem('alm-autosave:' + k) || '{}').values) || {}).sort(), appKey);
  await page.evaluate(() => { localStorage.clear(); document.getElementById('f-data').dispatchEvent(new Event('input', { bubbles: true })); });
  await expect.poll(() => keysOf('meta-regression'), { timeout: 10000 }).toEqual(MAIN_AUTOSAVE_KEYS);
  // Editing the extras must not write to (or re-index) the original key.
  await page.evaluate(() => localStorage.clear());
  await page.locator('#plus-data').fill('yi,vi,a,b\n1,1,2,3');
  await page.locator('#plus-interaction').check();
  await page.waitForTimeout(1500);
  expect(await keysOf('meta-regression')).toEqual([]);
  await page.evaluate(() => document.getElementById('f-data').dispatchEvent(new Event('input', { bubbles: true })));
  await expect.poll(() => keysOf('meta-regression'), { timeout: 10000 }).toEqual(MAIN_AUTOSAVE_KEYS);
  // Planted negative: an autosave installed with the default selectors (as before this fix) picks up the extras.
  await page.evaluate(() => { AlmAutosave.install({ appKey: 'u08-negative' }); document.getElementById('f-data').dispatchEvent(new Event('input', { bubbles: true })); });
  await expect.poll(() => keysOf('u08-negative'), { timeout: 10000 }).toContain('plus-data');
  expect(await keysOf('u08-negative')).not.toEqual(MAIN_AUTOSAVE_KEYS);
});
