import { test, expect } from '@playwright/test';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUTPUT = join(__dirname, '.probe-output.jsonl');
const APPS = JSON.parse(process.env.ALM_AUDIT_APPS_JSON || '[]');
const TIMEOUT_MS = parseInt(process.env.ALM_AUDIT_TIMEOUT_MS || '30000', 10);

const MOUNT_SELECTOR = [
  'svg',
  'canvas',
  'textarea',
  'table input',
  'button:has-text(/compute|run|pool|estimate|analy[sz]e|extract|score|update|render/i)',
].join(', ');

const NEEDS_SERVICE_PATTERNS = [
  /\bnot reachable\b/i,
  /connection (refused|failed)/i,
  /\bcannot connect\b/i,
  /server (down|unavailable)/i,
  /\bunavailable\b/i,
  /ollama not (running|reachable)/i,
  /start the .* server/i,
];

// Ensure a fresh file at the start of the test run.
test.beforeAll(() => {
  writeFileSync(OUTPUT, '');
});

for (const app of APPS) {
  test(`probe ${app.key}`, async ({ page }) => {
    const t0 = Date.now();
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

    let load_ok = false;
    let timed_out = false;
    let mount_found = false;
    let ui_text_matches = [];

    try {
      const url = `${app.path.startsWith('./') ? '/' + app.path.slice(2) : app.path}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
      load_ok = true;
      try {
        mount_found = await page.locator(MOUNT_SELECTOR).first().isVisible({ timeout: 2000 });
      } catch (_) {
        mount_found = false;
      }
      const text = (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')) || '';
      ui_text_matches = NEEDS_SERVICE_PATTERNS
        .filter(p => p.test(text))
        .map(p => p.source);
    } catch (err) {
      const m = String(err && err.message || err);
      if (/timeout/i.test(m)) timed_out = true;
      load_ok = false;
    }
    const load_time_ms = Date.now() - t0;
    const record = {
      key: app.key,
      url: app.path,
      load_ok,
      timed_out,
      load_time_ms,
      console_errors: consoleErrors,
      mount_found,
      ui_text_matches,
      probe_crashed: false,
    };
    appendFileSync(OUTPUT, JSON.stringify(record) + '\n');
    // The test always "passes" — failures are recorded in the JSONL, not the spec's exit.
    expect(true).toBe(true);
  });
}
