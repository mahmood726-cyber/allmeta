/**
 * app-smoke.spec.mjs — functional regression floor for every app that has
 * no dedicated sanity/parity spec.
 *
 * Portfolio-scale harness (same philosophy as a11y-sweep): one parameterised
 * file, app list DERIVED from the filesystem at collection time (never a
 * hardcoded list — it would drift). For each uncovered app it asserts:
 *   1. the page loads,
 *   2. no uncaught console/page errors (benign CSP frame-ancestors filtered),
 *   3. a real <h1> with text (not an empty shell),
 *   4. no unpopulated template tokens in shipped HTML
 *      ({{...}}, __PLACEHOLDER__, REPLACE_ME) — per the HTML-apps rules.
 *
 * Apps WITH a dedicated *-sanity/*-parity spec are excluded (already
 * covered, and some have bespoke load expectations e.g. monolith redirects).
 */
import { test, expect } from '@playwright/test';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');           // allmeta repo root
const INFRA = new Set(['hub', 'shared', 'tests', 'scripts', 'docs',
  'node_modules', 'test-results', 'local-install', 'r-shiny']);

// Apps already covered by a dedicated spec (exclude from smoke).
const covered = new Set(
  readdirSync(here)
    .filter(f => f.endsWith('.spec.mjs'))
    .map(f => f.replace(/-(sanity|parity)\.spec\.mjs$/, '')
                .replace(/\.spec\.mjs$/, '')));

const apps = readdirSync(root)
  .filter(d => !INFRA.has(d))
  .filter(d => { try { return statSync(join(root, d)).isDirectory(); }
                 catch { return false; } })
  .filter(d => existsSync(join(root, d, 'index.html')))
  .filter(d => !covered.has(d))
  .sort();

const benign = t =>
  (t.includes('frame-ancestors') && t.includes('Content Security Policy'));
const TOKEN = /\{\{[^}]+\}\}|__PLACEHOLDER__|REPLACE_ME|\bTODO_FILL\b/;

test.describe('app smoke (uncovered apps)', () => {
  for (const app of apps) {
    test(`${app} — loads, no errors, real heading, no placeholders`,
      async ({ page }) => {
        const errs = [];
        page.on('console', m => {
          if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
        });
        page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });

        await page.goto(`http://localhost:8088/${app}/index.html`,
          { waitUntil: 'load', timeout: 20_000 });
        // Settle async init / redirects.
        await page.waitForTimeout(900);

        // 3. real heading
        const h1 = (await page.locator('h1').first()
          .textContent().catch(() => '') || '').trim();
        expect(h1.length, `${app}: no non-empty <h1>`).toBeGreaterThan(0);

        // 4. no unpopulated template tokens in rendered HTML
        const html = await page.content();
        const m = html.match(TOKEN);
        expect(m, `${app}: unpopulated token ${m && m[0]}`).toBeNull();

        // 2. no uncaught errors
        expect(errs, `${app} console/page errors: ${errs.join(' | ')}`)
          .toEqual([]);
      });
  }

  test('harness covers a non-trivial number of apps', () => {
    expect(apps.length, 'no uncovered apps discovered?').toBeGreaterThan(20);
  });
});
