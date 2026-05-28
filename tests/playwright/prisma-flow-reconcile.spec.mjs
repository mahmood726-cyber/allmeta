/**
 * Regression for the PRISMA-flow review:
 *  #2 final reconciliation rung (reports = assessed − excluded-with-reasons; studies ≤ those)
 *     — also catches the numerically-impossible chain (included > assessed) from prisma-screen.
 *  #3 SVG <desc> read non-existent state keys (screenedExcl/assessedExcl/included) and so
 *     reported 0 excluded/included to screen readers; now uses the real keys.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/prisma-flow/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('prisma-flow: reconciliation catches impossible chains; <desc> reports real counts', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almPrisma === 'function', { timeout: 10000 });

  const v = await page.evaluate(() => {
    const consistent = { db: 100, reg: 0, removed: 10, screened: 90, excludedScreen: 60, sought: 30, notRetrieved: 5, assessed: 25, excludedEligible: 10, reports: 15, studies: 12 };
    const impossible = { ...consistent, assessed: 2, sought: 7 };  // studies/reports (12/15) > assessed (2)
    const isRecon = (w) => /Reports of included|Studies included .*cannot exceed|should equal assessed/.test(w);
    return {
      consistentWarns: window.__almPrisma(consistent).filter(isRecon),
      impossibleWarns: window.__almPrisma(impossible).filter(isRecon),
    };
  });
  console.log('  validate:', JSON.stringify(v));
  expect(v.consistentWarns, 'consistent chain → no reconciliation warning').toEqual([]);
  expect(v.impossibleWarns.length, 'impossible chain (included>assessed) is flagged').toBeGreaterThan(0);

  // <desc> accessible description now reports the real excluded/included numbers.
  const set = { '#f-db': '100', '#f-removed': '10', '#f-screened': '90', '#f-excluded-screen': '60',
                '#f-sought': '30', '#f-not-retrieved': '5', '#f-assessed': '25', '#f-excluded-eligible': '10',
                '#f-studies': '12', '#f-reports': '15' };
  for (const [sel, val] of Object.entries(set)) await page.fill(sel, val);
  await page.waitForTimeout(300);
  const desc = await page.evaluate(() => document.querySelector('svg desc')?.textContent || '');
  console.log('  desc:', desc);
  expect(desc, 'excluded count not zero').toMatch(/excluded: 60/);
  expect(desc, 'excluded-with-reasons not zero').toMatch(/with reasons: 10/);
  expect(desc, 'studies included not zero').toMatch(/included in review: 12/);

  expect(errors, 'no console errors').toEqual([]);
});
