import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// VISIT 1: cold — warm the SW + cache
console.log('--- COLD: priming webr-studio + waiting for ready ---');
const t1 = Date.now();
await page.goto('https://mahmood726-cyber.github.io/allmeta/webr-studio/', { waitUntil: 'load' });
await page.waitForFunction(
  () => document.getElementById('status')?.textContent?.toLowerCase().includes('ready'),
  null, { timeout: 90000 }
);
console.log(`Cold WebR ready: ${Date.now() - t1} ms`);

// Inspect cache
const cached = await page.evaluate(async () => {
  const out = {};
  for (const n of await caches.keys()) {
    const c = await caches.open(n);
    out[n] = (await c.keys()).length;
  }
  return out;
});
console.log('Cache state after cold load:', JSON.stringify(cached));

// VISIT 2: navigate away then back — same browser context, SW + cache survive
console.log('--- WARM: re-loading webr-studio (cache hit expected) ---');
await page.goto('about:blank');
await page.waitForTimeout(500);

const warmRequests = [];
page.on('response', r => {
  const u = r.url();
  if (u.includes('webr') || u.includes('shinylive') || u.includes('R.wasm') || u.includes('library.data')) {
    warmRequests.push({ url: u, status: r.status(), from: r.fromServiceWorker(), t: Date.now() });
  }
});

const t2 = Date.now();
await page.goto('https://mahmood726-cyber.github.io/allmeta/webr-studio/', { waitUntil: 'load' });
await page.waitForFunction(
  () => document.getElementById('status')?.textContent?.toLowerCase().includes('ready'),
  null, { timeout: 90000 }
);
console.log(`Warm WebR ready: ${Date.now() - t2} ms`);

const sw = warmRequests.filter(r => r.from).length;
const net = warmRequests.filter(r => !r.from).length;
const cdn = warmRequests.filter(r => r.url.includes('webr.r-wasm.org')).length;
console.log(`Warm tally: ${sw} from SW, ${net} from network, ${cdn} hit CDN`);

await browser.close();
