/**
 * Guards the parity dashboard (/parity) and its generated ledger.
 * (1) The committed parity/parity-ledger.js must be in sync with the actual spec files
 *     (regenerate the counts in-process and compare) — the dashboard cannot drift ahead
 *     of the evidence, which is the whole point of the "provability" claim.
 * (2) The dashboard renders the headline counts and one row per spec, no console errors.
 */
import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const URL = 'http://localhost:8088/parity/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const testsDir = join(repoRoot, 'hub', 'shared', 'tests');

function liveCounts() {
  const files = readdirSync(testsDir).filter(f => /parity/i.test(f) && f.endsWith('.spec.mjs') && f !== 'parity-ledger.spec.mjs');
  let asserts = 0;
  for (const f of files) {
    const src = readFileSync(join(testsDir, f), 'utf8');
    asserts += (src.match(/toBeCloseTo\([^,]+,\s*\d+\s*\)/g) || []).length;
  }
  return { specCount: files.length, assertionCount: asserts };
}

test('committed ledger is in sync with the spec files', async () => {
  const ledgerSrc = readFileSync(join(repoRoot, 'parity', 'parity-ledger.js'), 'utf8');
  const json = JSON.parse(ledgerSrc.replace(/^[\s\S]*?window\.ALM_PARITY_LEDGER\s*=\s*/, '').replace(/;\s*$/, ''));
  const live = liveCounts();
  expect(json.specCount, 'specCount drift — re-run scripts/build-parity-ledger.mjs').toBe(live.specCount);
  expect(json.assertionCount, 'assertionCount drift — re-run scripts/build-parity-ledger.mjs').toBe(live.assertionCount);
  expect(json.rows).toHaveLength(live.specCount);
  // every listed spec actually exists
  const present = new Set(readdirSync(testsDir));
  for (const r of json.rows) expect(present.has(r.spec), `${r.spec} missing`).toBe(true);
});

test('parity dashboard renders headline cards + one row per spec', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.ALM_PARITY_LEDGER && document.querySelectorAll('#rows tr').length > 0, { timeout: 10000 });
  const n = await page.evaluate(() => window.ALM_PARITY_LEDGER.specCount);
  expect(await page.locator('#rows tr').count()).toBe(n);
  expect(await page.locator('#cards .card').count()).toBe(5);
  // filtering narrows the table
  await page.fill('#q', 'metafor');
  const filtered = await page.locator('#rows tr').count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThanOrEqual(n);
  expect(errs, 'no console errors').toEqual([]);
});
