import { test, expect } from '@playwright/test';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUTPUT = join(__dirname, '.probe-output.jsonl');
const APPS = JSON.parse(process.env.ALM_AUDIT_APPS_JSON || '[]');
const TIMEOUT_MS = parseInt(process.env.ALM_AUDIT_TIMEOUT_MS || '30000', 10);

// CSS-only union for structural landmarks.
// NOTE: 'button:has-text(/regex/i)' CANNOT be combined with plain CSS selectors
// in a comma-separated string in Playwright ≥1.50 — the slash-regex form triggers
// a CSS parse error on the whole selector.  Action buttons are handled via the
// .or(getByRole) composition below (see _mountLocator factory).
// Cycle 3.3: widened to include free-standing inputs, select, and form so that
// interactive apps like focus-studio (no svg/canvas/textarea/table) are detected.
const MOUNT_CSS = 'svg, canvas, textarea, table input, input[type="text"], input[type="number"], input[type="search"], select, form';

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
      // Brief settle after networkidle so JS-rendered elements (e.g. SVG via innerHTML)
      // have time to paint before we check visibility.  isVisible() is immediate (the
      // deprecated timeout option is ignored in Playwright ≥1.50), so we use waitFor
      // with state:'visible' which actually polls until the element appears.
      await page.waitForTimeout(500);
      try {
        // Use locator.or() to combine CSS landmarks with a Playwright-native role
        // locator for action buttons.  Mixing 'button:has-text(/regex/)' in a plain
        // CSS comma-list fails in Playwright 1.60 with a CSS parse error.
        const mountLoc = page.locator(MOUNT_CSS).or(
          page.getByRole('button', { name: /compute|run|pool|estimate|analy[sz]e|extract|score|update|render|start|reset|skip|add|new|save|load|export|build|generate|fit|simulate|plot|chart|submit|apply|copy|continue|next|back|search|find|upload|download|clear|cancel|create|edit|delete|remove/i })
        );
        await mountLoc.first().waitFor({ state: 'visible', timeout: 2000 });
        mount_found = true;
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
