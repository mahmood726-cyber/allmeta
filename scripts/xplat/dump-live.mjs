import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { apps, loadExample, payload } from './live-browser.mjs';
import { createLiveServer } from './live-server.mjs';

// Resolve the repo's existing Playwright install, independent of process.cwd().
const require = createRequire(new URL('../../hub/shared/tests/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'validation/live');
// Own ephemeral server: never accidentally export from another worktree's port.
const server = createLiveServer(root);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: true });
  await mkdir(output, { recursive: true });
  for (const app of apps) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await loadExample(page, app, `http://127.0.0.1:${server.address().port}`);
      const data = await payload(page, app);
      await writeFile(path.join(output, app + '.json'), JSON.stringify(data, null, 2) + '\n');
      const planted = structuredClone(data);
      const target = planted.appValues.find(v => /^(split\.0\.direct|mu1|coef\.0\.estimate)$/.test(v.key));
      if (!target || !Number.isFinite(target.value) || target.value === 0) throw Error('No nonzero defect target');
      target.value *= 1.001;
      await writeFile(path.join(output, app + '.planted.json'), JSON.stringify(planted, null, 2) + '\n');
      console.log(`DUMP ${app} ${data.appValues.length} quantities; planted ${target.key}`);
    } finally { await context.close(); }
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
