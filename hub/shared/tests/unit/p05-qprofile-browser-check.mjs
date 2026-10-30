// Check availability without installing packages or writing browser output in wt.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
try {
  const { chromium } = require('@playwright/test');
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  console.log('P05_BROWSER_AVAILABLE', browser.version());
  await browser.close();
} catch (error) {
  console.error('P05_BROWSER_UNAVAILABLE:', error.message);
  process.exitCode = 1;
}
