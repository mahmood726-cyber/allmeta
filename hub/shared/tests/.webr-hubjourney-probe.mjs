import { chromium } from '@playwright/test';

async function measure(label, prewarmWait) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Step 1: visit hub
  console.log(`\n=== ${label} ===`);
  const t0 = Date.now();
  await page.goto('https://mahmood726-cyber.github.io/allmeta/', { waitUntil: 'load' });
  console.log(`hub load: ${Date.now() - t0} ms`);

  // Wait for prewarm to start + linger to let WebR boot in the background
  if (prewarmWait > 0) {
    await page.waitForTimeout(prewarmWait);
    const iframeCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
    console.log(`after ${prewarmWait/1000}s on hub: ${iframeCount} iframe(s) present`);
    // Did the prewarm iframe finish?
    const torn = await page.evaluate(() => document.querySelectorAll('iframe[title="WebR pre-warm"]').length);
    console.log(`prewarm iframe remaining: ${torn} (0 = WebR was warmed and iframe torn down)`);
  }

  // Step 2: navigate to webr-studio in same tab
  const t1 = Date.now();
  await page.goto('https://mahmood726-cyber.github.io/allmeta/webr-studio/', { waitUntil: 'load' });
  console.log(`webr-studio DOMload: ${Date.now() - t1} ms`);

  try {
    await page.waitForFunction(
      () => document.getElementById('status')?.textContent?.toLowerCase() === 'ready',
      null, { timeout: 60000 }
    );
    console.log(`*** WebR ready: ${Date.now() - t1} ms ***`);
  } catch (e) {
    const status = await page.evaluate(() => document.getElementById('status')?.textContent);
    console.log(`TIMEOUT after ${Date.now() - t1} ms — last status: "${status}"`);
  }

  await browser.close();
}

// A: visit hub, immediately navigate to webr-studio (no prewarm time)
await measure('A: hub → immediate webr-studio (0 s prewarm)', 0);

// B: visit hub, wait 12 s (prewarm fires at 8 s + ~4 s download), then navigate
await measure('B: hub → 12 s linger → webr-studio (prewarm starting)', 12000);

// C: visit hub, wait 40 s (prewarm fully complete), then navigate
await measure('C: hub → 40 s linger → webr-studio (prewarm complete)', 40000);
