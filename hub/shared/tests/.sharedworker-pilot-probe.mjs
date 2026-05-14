import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Collect console messages too
const consoleLines = [];
page.on('console', msg => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleLines.push(`[pageerror] ${err.message}`));

await page.goto('https://mahmood726-cyber.github.io/allmeta/webr-pilot/', { waitUntil: 'load' });
console.log('Page loaded');

// Click "Run all" and wait for completion line in the log
await page.click('#b-all');
console.log('Run-all started, waiting up to 4 min for completion line...');

try {
  await page.waitForFunction(
    () => document.getElementById('log').textContent.includes('--- run-all complete ---'),
    null,
    { timeout: 240000 }
  );
} catch (e) {
  console.log('TIMEOUT reaching completion — capturing whatever we have');
}

const log = await page.evaluate(() => document.getElementById('log').textContent);
console.log('\n========= PILOT LOG =========');
console.log(log);

// Open a second tab to test session sharing
console.log('\n========= 2ND TAB (test session sharing) =========');
const page2 = await ctx.newPage();
await page2.goto('https://mahmood726-cyber.github.io/allmeta/webr-pilot/', { waitUntil: 'load' });
await page2.waitForTimeout(1500);
await page2.click('#b-session');
await page2.waitForTimeout(3000);
const log2 = await page2.evaluate(() => document.getElementById('log').textContent);
console.log(log2);

console.log('\n========= CONSOLE (errors/warnings) =========');
consoleLines.slice(-30).forEach(l => console.log(l));

await browser.close();
