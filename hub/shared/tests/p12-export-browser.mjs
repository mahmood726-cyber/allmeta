// Optional real-browser replay. Run from wt/ after installing the existing
// hub/shared/tests package dependencies and Playwright Chromium.
// Browser profiles and downloads use Playwright's temporary directories.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [], downloads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('download', download => downloads.push(download));
  await page.goto(new URL('../../../limit-ma/index.html', import.meta.url).href);
  const good = '0.1, 0.2, A\n0.2, 0.3, B\n0.3, 0.4, C';
  const recovered = '0.4, 0.2, A\n0.5, 0.3, B\n0.6, 0.4, C\n0.7, 0.5, D';
  const run = async text => {
    await page.locator('#src').fill(text);
    await page.locator('#btn-run').click();
  };
  const status = page.locator('#alm-export-mount [data-export-status]');
  const exportResult = async (action, suffix) => {
    const waiting = page.waitForEvent('download');
    await page.locator(`[data-action="${action}"]`).click();
    const download = await waiting;
    assert.equal(download.suggestedFilename(), 'limit-ma-results' + suffix);
    const text = await readFile(await download.path(), 'utf8');
    assert.ok(text.length > 0);
    if (action === 'json') {
      assert.deepEqual(JSON.parse(text), await page.evaluate(() => window._almLastLimit()));
    }
    assert.equal(await status.textContent(), '');
  };
  for (const [action, suffix] of [['csv', '.csv'], ['md', '.md'], ['report-md', '-report.md'],
    ['report-txt', '-report.txt'], ['json', '.json']]) {
    await run(good);
    await exportResult(action, suffix);
    await run('0.1, 0.2, A\n0.2, 0.3, B');
    assert.equal(await page.evaluate(() => window._almLastLimit()), null);
    const count = downloads.length;
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.locator(`[data-action="${action}"]`).click();
      assert.equal(await status.getAttribute('role'), 'status');
      assert.equal(await status.getAttribute('aria-live'), 'polite');
      assert.ok(await status.isVisible());
      assert.match(await status.textContent(), /No results yet.*run the analysis first.*export/i);
    }
    await page.waitForTimeout(100);
    assert.equal(downloads.length, count, 'refused analysis must not download');
    await run(recovered);
    assert.equal(await page.evaluate(() => window._almLastLimit().k), 4);
    await exportResult(action, suffix);
    console.log(`PASS browser: ${action} successful export, repeated refusal, visible live region and recovery`);
  }
  await page.evaluate(() => { window._almLastLimit = () => undefined; });
  const count = downloads.length;
  for (const action of ['csv', 'md', 'report-md', 'report-txt', 'json']) {
    await page.locator(`[data-action="${action}"]`).click();
    assert.match(await status.textContent(), /No results yet.*run the analysis first.*export/i);
  }
  await page.waitForTimeout(100);
  assert.equal(downloads.length, count);
  assert.deepEqual(errors, [], 'no browser exception during load or export');
  console.log('PASS browser: all five undefined snapshots refused without downloads or page errors');
} finally {
  await browser.close();
}
