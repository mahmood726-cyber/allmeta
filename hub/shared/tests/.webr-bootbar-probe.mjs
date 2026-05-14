import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto('https://mahmood726-cyber.github.io/allmeta/webr-studio/', { waitUntil: 'load' });

// Sample phase labels at intervals to confirm the ticker is working
const samples = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
  const sample = await page.evaluate(() => {
    const status = document.getElementById('status')?.textContent;
    const barW = document.getElementById('boot-bar-fill')?.style.width;
    return { status, barW };
  });
  samples.push({ t: ((i+1)*2.5).toFixed(1) + 's', ...sample });
  if (sample.status?.toLowerCase() === 'ready') break;
}

console.log('Phase samples during boot:');
for (const s of samples) {
  console.log(`  t=${s.t}  bar=${s.barW || '—'}  status="${s.status}"`);
}

await browser.close();
