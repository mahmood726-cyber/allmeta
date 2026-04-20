const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run() {
  const csv = fs.readFileSync(path.resolve('C:/HTML apps/dosehtml/milk_mort_full_shifted.csv'), 'utf8').trim();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('dialog', dialog => dialog.accept());
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('PAGE CONSOLE ERROR:', msg.text());
    }
  });
  page.on('pageerror', err => {
    console.error('PAGE ERROR:', err.message);
  });

  const filePath = 'file:///' + path.resolve('C:/HTML apps/dosehtml/dose-response-pro.html').replace(/\\/g, '/');
  await page.goto(filePath, { waitUntil: 'domcontentloaded', timeout: 20000 });

  await page.evaluate((csvText) => {
    const input = document.getElementById('dataInput');
    input.value = csvText;
  }, csv);

  await page.evaluate(() => { useREML = true; });
  await page.evaluate(() => {
    const toggle = document.getElementById('rForceDiag');
    if (toggle) toggle.checked = true;
  });
  await page.evaluate(() => runAnalysis());

  await page.waitForFunction(() => typeof analysisResults !== 'undefined' && analysisResults && analysisResults.results, { timeout: 30000 });

  const summary = await page.evaluate(() => {
    const getText = (id) => {
      const el = document.getElementById(id);
      return el ? el.textContent.trim() : '';
    };

    return {
      model: document.getElementById('modelSelect')?.value || null,
      studies: getText('statStudies'),
      points: getText('statPoints'),
      tau2: getText('statTau2'),
      I2: getText('statI2'),
      Q: getText('statQ'),
      beta: analysisResults?.results?.beta || null,
      se: analysisResults?.results?.se || null
    };
  });

  await page.evaluate(() => generateRCode());
  const rCode = await page.evaluate(() => document.getElementById('rCodeOutput')?.textContent || '');
  fs.writeFileSync(path.resolve('C:/Users/user/dosehtml_generated_milk_mort_reml.R'), rCode, 'utf8');

  await browser.close();

  console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
