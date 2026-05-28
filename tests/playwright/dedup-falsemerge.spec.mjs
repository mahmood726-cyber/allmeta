/**
 * Regression for citation-dedup transitive false-merge: a DOI-exact match merged
 * records regardless of title, so a shared/erroneous DOI — or a cross-criterion
 * chain (A~B by title, B~C by DOI) — merged clearly different works (data loss).
 * DOI merges now require a low title-similarity floor (when both titles exist),
 * while true duplicates and missing-title DOI matches still merge.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/citation-dedup/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

test('citation-dedup: DOI matches need a title floor (no false-merge); true dups still merge', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almDedup === 'function', { timeout: 10000 });

  const r = await page.evaluate(() => {
    // __almDedup returns { clusters: [[id,...],...], nClusters }
    const same = (res, a, b) => res.clusters.some(c => c.includes(a) && c.includes(b));
    const D = (recs) => window.__almDedup(recs, { threshold: 0.85 });

    // 1. shared/erroneous DOI, unrelated titles → NOT merged
    const erroneous = D([
      { id: 'e0', title: 'SGLT2 inhibitors and heart failure mortality', doi: '10.1/x', authors: 'A', year: '2020' },
      { id: 'e1', title: 'A qualitative study of nurse burnout in oncology', doi: '10.1/x', authors: 'B', year: '2019' },
    ]);
    // 2. cross-criterion chain: a~b by identical title; c shares b's DOI, unrelated title
    const chain = D([
      { id: 'a', title: 'randomized trial of drug A in chronic heart failure', doi: '', authors: 'X', year: '2021' },
      { id: 'b', title: 'randomized trial of drug A in chronic heart failure', doi: '10.3/z', authors: 'X', year: '2021' },
      { id: 'c', title: 'ethnographic review of museum curation practices', doi: '10.3/z', authors: 'Q', year: '2005' },
    ]);
    // 3. true duplicate: same DOI + same title → merged
    const trueDup = D([
      { id: 't0', title: 'metformin and cardiovascular outcomes in type 2 diabetes', doi: '10.2/y', authors: 'C', year: '2018' },
      { id: 't1', title: 'metformin and cardiovascular outcomes in type 2 diabetes', doi: '10.2/y', authors: 'C', year: '2018' },
    ]);
    // 4. same DOI but one title missing → trust DOI, merge
    const missingTitle = D([
      { id: 'm0', title: '', doi: '10.4/w', authors: '', year: '' },
      { id: 'm1', title: 'Some indexed study', doi: '10.4/w', authors: 'D', year: '2017' },
    ]);
    return {
      erroneousMerged: same(erroneous, 'e0', 'e1'),
      chainGroups: chain.nClusters,
      chainABTogether: same(chain, 'a', 'b'),
      chainCWithB: same(chain, 'b', 'c'),
      trueDupMerged: same(trueDup, 't0', 't1'),
      missingTitleMerged: same(missingTitle, 'm0', 'm1'),
    };
  });
  console.log('  dedup:', JSON.stringify(r));

  expect(r.erroneousMerged, 'shared/erroneous DOI on unrelated titles must NOT merge').toBe(false);
  expect(r.chainABTogether, 'A~B (identical title) still merge').toBe(true);
  expect(r.chainCWithB, 'C (DOI-only, unrelated title) must NOT chain in').toBe(false);
  expect(r.chainGroups, 'chain yields 2 clusters, not 1').toBe(2);
  expect(r.trueDupMerged, 'true duplicate (same DOI + title) still merges').toBe(true);
  expect(r.missingTitleMerged, 'same DOI with a missing title trusts the DOI').toBe(true);
  expect(errors, 'no console errors').toEqual([]);
});
