import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('--- VISIT 1: hub (prime SW + prefetch) ---');
await page.goto('https://mahmood726-cyber.github.io/allmeta/', { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(35000); // let prefetches complete

const cacheKeys = await page.evaluate(async () => {
  const out = {};
  for (const n of await caches.keys()) {
    const c = await caches.open(n);
    out[n] = (await c.keys()).map(r => r.url.replace(self.location.origin, ''));
  }
  return out;
});
console.log('Cached after prefetch:', JSON.stringify(cacheKeys, null, 2));

console.log('--- VISIT 2: webr-studio cold ---');
const requests = [];
page.on('response', r => {
  const u = r.url();
  if (u.includes('webr') || u.includes('shinylive') || u.includes('R.wasm') || u.includes('library.data')) {
    requests.push({ url: u, status: r.status(), from: r.fromServiceWorker(), t: Date.now() });
  }
});

const t1 = Date.now();
await page.goto('https://mahmood726-cyber.github.io/allmeta/webr-studio/', { waitUntil: 'load', timeout: 60000 });
console.log(`webr-studio DOMload: ${Date.now() - t1} ms`);

// Wait for status badge to flip from "booting" to "ready"
console.log('--- waiting for WebR ready badge ---');
try {
  await page.waitForFunction(
    () => document.getElementById('status')?.textContent?.toLowerCase().includes('ready'),
    null,
    { timeout: 90000 }
  );
  console.log(`WebR ready: ${Date.now() - t1} ms`);
} catch (e) {
  console.log(`WebR ready TIMEOUT at ${Date.now() - t1} ms`);
  const status = await page.evaluate(() => document.getElementById('status')?.textContent);
  console.log(`Status badge: "${status}"`);
}

// Wait a bit more in case more requests are still in flight
await page.waitForTimeout(3000);

const sw = requests.filter(r => r.from);
const net = requests.filter(r => !r.from);
const cdn = requests.filter(r => r.url.includes('webr.r-wasm.org'));
const errs = requests.filter(r => r.status >= 400);
console.log(`Tally: ${sw.length} from SW, ${net.length} from network (${cdn.length} hit CDN), ${errs.length} HTTP errors`);

console.log('--- all webr/shinylive responses ---');
for (const r of requests) {
  const elapsed = ((r.t - t1) / 1000).toFixed(1);
  const path = r.url.replace('https://mahmood726-cyber.github.io', '').replace('https://webr.r-wasm.org', '[CDN]');
  console.log(`  +${elapsed}s ${r.status}  ${r.from?'[SW]':'[NET]'}  ${path}`);
}

await browser.close();
