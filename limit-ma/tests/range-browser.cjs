const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({channel: 'chrome'});
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(process.argv[2] || path.join(__dirname, '../index.html'))).href);
    await page.locator('#src').fill('0,0.1\n0,0.2\n0,0.3');
    await page.locator('#btn-run').click();
    const snapshot = () => page.evaluate(() => ({
      result: window._almLastLimit(), table: document.querySelector('#body').innerHTML,
      plot: document.querySelector('#plot').innerHTML,
      error: document.querySelector('#limit-error').textContent,
    }));
    const before = await snapshot();
    assert.equal(before.result.k, 3);
    assert.ok(before.plot.includes('<circle'));
    const failures = [];
    for (const [axis, value] of [['y', '0.33'], ['y', '0.34'], ['x', '0.1'], ['x', '0.2']]) {
      const input = page.locator(`[data-axis="${axis}"][data-edge="min"]`);
      await input.fill(value);
      await input.dispatchEvent('change');
      const state = await snapshot();
      console.log(JSON.stringify({axis, value, error: state.error, nonfinite: /NaN|Infinity/.test(state.plot), plotEmpty: !state.plot, resultsKept: JSON.stringify(state.result) === JSON.stringify(before.result)}));
      try {
        assert.match(state.error, /range/i, 'Invalid effective range needs a visible range error');
        assert.ok(await page.locator('#limit-error[role="alert"]').isVisible());
        assert.equal(state.plot, '', 'Invalid range must clear the plot');
        assert.deepEqual(state.result, before.result, 'Export results must be preserved');
        assert.equal(state.table, before.table);
      } catch (error) { failures.push(`${axis}=${value}: ${error.message}`); }
      await input.fill('');
      await input.dispatchEvent('change');
      assert.deepEqual(await snapshot(), before, 'Clearing override must restore the finite plot and results');
      assert.ok(!/NaN|Infinity/.test((await snapshot()).plot));
    }
    assert.deepEqual(failures, []);
    console.log('PASS: equal/exceeding automatic X and SE bounds alert and clear only the plot; clearing overrides restores finite coordinates');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
