/**
 * Regression for prisma-screen #1: the count model tallied each PRISMA box
 * independently (and a dead if/else counted an include at the title/abstract
 * stage as a final included study), so "Studies included" could exceed
 * "Reports assessed" — an impossible flow diagram. computeCounts now walks each
 * record to exactly one funnel position, so the PRISMA 2020 identities hold by
 * construction: identified >= screened >= sought >= assessed >= included, and
 * excludedFull <= assessed.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/prisma-screen/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

const rec = (tag1, stage = 'title_abstract', reason = '') => ({ tag1, tag2: '', stage, reason });

test('prisma-screen: funnel counts are PRISMA-consistent (included never exceeds assessed)', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__almScreen && typeof window.__almScreen.counts === 'function', { timeout: 10000 });

  const r = await page.evaluate(() => {
    const C = (recs) => window.__almScreen.counts(recs);

    // Case A — realistic two-stage screen.
    const A = C([
      { tag1: 'duplicate', tag2: '', stage: 'title_abstract', reason: '' },
      { tag1: 'duplicate', tag2: '', stage: 'title_abstract', reason: '' },
      { tag1: 'exclude', tag2: '', stage: 'title_abstract', reason: 'off-topic' },
      { tag1: 'exclude', tag2: '', stage: 'title_abstract', reason: 'wrong population' },
      { tag1: 'exclude', tag2: '', stage: 'title_abstract', reason: 'not RCT' },
      { tag1: 'maybe', tag2: '', stage: 'title_abstract', reason: '' },
      { tag1: 'include', tag2: '', stage: 'full_text', reason: '' },
      { tag1: 'include', tag2: '', stage: 'full_text', reason: '' },
      { tag1: 'exclude', tag2: '', stage: 'full_text', reason: 'wrong comparator' },
      { tag1: 'maybe', tag2: '', stage: 'full_text', reason: '' },
      { tag1: 'include', tag2: '', stage: 'full_text', reason: 'full text not retrieved' },
    ]);

    // Case B — the exact old-code violation: include-tagged AND not retrieved.
    const B = C([
      { tag1: 'include', tag2: '', stage: 'full_text', reason: 'not retrieved' },
      { tag1: 'include', tag2: '', stage: 'full_text', reason: '' },
    ]);

    // Case C — single-stage screen (everything at title/abstract).
    const C1 = C([
      { tag1: 'include', tag2: '', stage: 'title_abstract', reason: '' },
      { tag1: 'include', tag2: '', stage: 'title_abstract', reason: '' },
      { tag1: 'include', tag2: '', stage: 'title_abstract', reason: '' },
      { tag1: 'exclude', tag2: '', stage: 'title_abstract', reason: 'off-topic' },
      { tag1: 'exclude', tag2: '', stage: 'title_abstract', reason: 'off-topic' },
      { tag1: 'maybe', tag2: '', stage: 'title_abstract', reason: '' },
    ]);

    const identitiesHold = (c) =>
      c.identified >= c.screened && c.screened >= c.sought &&
      c.sought >= c.assessed && c.assessed >= c.included &&
      c.excludedFull <= c.assessed && c.included >= 0 && c.excludedFull >= 0;

    return { A, B, C1, holdsA: identitiesHold(A), holdsB: identitiesHold(B), holdsC: identitiesHold(C1) };
  });
  console.log('  prisma:', JSON.stringify(r));

  // Case A exact funnel.
  expect(r.A.identified).toBe(11);
  expect(r.A.duplicates).toBe(2);
  expect(r.A.screened).toBe(9);
  expect(r.A.excludedScreen).toBe(3);
  expect(r.A.sought).toBe(5);
  expect(r.A.notRetrieved).toBe(1);
  expect(r.A.assessed).toBe(4);
  expect(r.A.excludedFull).toBe(1);
  expect(r.A.included).toBe(2);
  expect(r.A.maybe).toBe(2);   // pendingScreen(1) + pendingFull(1)
  expect(r.holdsA, 'Case A identities hold').toBe(true);

  // Case B: the regression — included must NOT exceed assessed.
  expect(r.B.included).toBe(1);
  expect(r.B.assessed).toBe(1);
  expect(r.B.notRetrieved).toBe(1);
  expect(r.holdsB, 'Case B identities hold (no included>assessed)').toBe(true);

  // Case C: single-stage includes still counted.
  expect(r.C1.included).toBe(3);
  expect(r.C1.assessed).toBe(3);
  expect(r.C1.excludedScreen).toBe(2);
  expect(r.C1.maybe).toBe(1);
  expect(r.holdsC, 'Case C identities hold').toBe(true);

  expect(errors, 'no console errors').toEqual([]);
});
