/**
 * Load-smoke for the hub's productivity apps (not meta-analysis tools, but live
 * catalog entries): they must load with no console/page errors and render their
 * primary control. Systematic classes (aria, dup-id, placeholders, localStorage)
 * are covered by the cross-app scans; this guards basic runtime health.
 */
import { test, expect } from '@playwright/test';
const BASE = 'http://127.0.0.1:8080';
const BENIGN = [
  /frame-ancestors' is ignored when delivered via a <meta>/,
  /favicon\.ico/i,
  /Service Worker registration failed/i,
];

// The hub's catalogued productivity apps (Productivity category in hub/projects.js).
// NB: there is no "triage" hub app — the word only appears inside kanban-lab's
// summary text; the root triage.html / triage/ package is separate project tooling.
const APPS = [
  { path: '/focus-studio/index.html', name: 'focus-studio' },
  { path: '/kanban-lab/index.html', name: 'kanban-lab' },
];

for (const app of APPS) {
  test(`productivity app loads clean: ${app.name}`, async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !BENIGN.some(re => re.test(m.text()))) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGE: ' + e.message));

    await page.goto(BASE + app.path, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Has a usable control surface (at least one button/input rendered).
    const interactives = await page.locator('button, input, [role="button"], [draggable="true"]').count();
    expect(interactives, `${app.name} renders at least one control`).toBeGreaterThan(0);

    expect(errors, `console/page errors on ${app.name}`).toEqual([]);
  });
}
