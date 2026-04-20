const { chromium } = require('playwright');
const path = require('path');

async function quickTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

  const filePath = 'file:///' + path.resolve('dose-response-pro-v18.2-ultimate.html').replace(/\\/g, '/');

  try {
    await page.goto(filePath, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(2000);

    const tabs = await page.locator('.tab').count();
    console.log('Tabs found:', tabs);

    const resultsTab = await page.locator('#tab-results').count();
    console.log('Results tab exists:', resultsTab > 0);

    const valTab = await page.locator('#tab-validation').count();
    console.log('Validation tab exists:', valTab > 0);

    // Try to run analysis
    await page.click('button:has-text("Load Sample")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Run Analysis")');
    await page.waitForTimeout(2000);

    const tau2 = await page.locator('#statTau2').textContent();
    console.log('Tau2 value:', tau2);

    if (errors.length > 0) {
      console.log('\nERRORS:');
      errors.forEach(e => console.log(' -', e.substring(0, 200)));
    } else {
      console.log('\nNo JavaScript errors!');
    }
  } catch (e) {
    console.log('Test error:', e.message);
  }

  await browser.close();
}

quickTest();
