/**
 * citation-dedup-behavior.spec.mjs — deterministic dedup correctness.
 *
 * citation-dedup is fully deterministic: a pair is a duplicate iff
 * (normalized DOI exact match) OR (title trigram-Jaccard >= threshold,
 * with optional year-tolerance and same-first-author guards); clusters
 * by union-find. No R reference needed — the oracle is the correct
 * dedup outcome BY CONSTRUCTION. Silent over/under-merging drops or
 * double-counts studies in a real systematic review, so this pins the
 * behaviour.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/citation-dedup/';
const rec = (id, title, opts = {}) => ({
  id, title, authors: opts.authors || '', year: opts.year || '',
  journal: '', doi: opts.doi || '',
});
const clusterOf = (clusters, id) =>
  clusters.find(c => c.includes(id)).slice().sort().join(',');

test.describe('citation-dedup', () => {
  test('loads, no console errors, hooks present', async ({ page }) => {
    const errs = [];
    const benign = t => t.includes('frame-ancestors') &&
      t.includes('Content Security Policy');
    page.on('console', m => {
      if (m.type() === 'error' && !benign(m.text())) errs.push(m.text());
    });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(
      () => typeof window.__almDedup === 'function' &&
            typeof window.__almDedupUtil === 'object', { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('DOI / title / year / author dedup rules + normalization',
    async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForFunction(
        () => typeof window.__almDedup === 'function', { timeout: 10_000 });
      const run = (records, opts) => page.evaluate(
        ([r, o]) => window.__almDedup(r, o), [records, opts || {}]);
      const util = (fn, ...a) => page.evaluate(
        ([f, args]) => window.__almDedupUtil[f](...args), [fn, a]);

      // A. DOI exact match (format variants) merges despite different
      //    title text; an unrelated DOI stays separate.
      const A = await run([
        rec('A', 'Statins for Primary Prevention: A Meta-Analysis',
          { doi: '10.1001/jama.2021.1234' }),
        rec('B', 'Statins (reanalysis) — primary prevention',
          { doi: 'https://doi.org/10.1001/JAMA.2021.1234' }),
        rec('C', 'Aspirin in Diabetes', { doi: '10.9999/xyz' }),
      ]);
      expect(A.nClusters, 'DOI: 2 clusters').toBe(2);
      expect(clusterOf(A.clusters, 'A')).toBe('A,B');
      expect(clusterOf(A.clusters, 'C')).toBe('C');

      // B. Title near-duplicate (case/punctuation only) merges; an
      //    unrelated title stays separate. No DOI.
      const B = await run([
        rec('D', 'Efficacy of SGLT2 Inhibitors in Heart Failure'),
        rec('E', 'efficacy of sglt2 inhibitors in heart failure.'),
        rec('F', 'Beta Blockers After Myocardial Infarction'),
      ]);
      expect(B.nClusters, 'title: 2 clusters').toBe(2);
      expect(clusterOf(B.clusters, 'D')).toBe('D,E');
      expect(clusterOf(B.clusters, 'F')).toBe('F');

      // C. Distinct papers — never merged.
      const C = await run([
        rec('G', 'Anticoagulation in Atrial Fibrillation', { doi: '10.1/a' }),
        rec('H', 'Vaccination Coverage in Children', { doi: '10.1/b' }),
        rec('I', 'Surgical vs Medical Management of Appendicitis'),
      ]);
      expect(C.nClusters, 'distinct: 3 clusters').toBe(3);

      // D. Year tolerance: same title, far-apart years — yearTol=0 keeps
      //    them separate; a wide tolerance merges them.
      const sameTitle = [
        rec('J', 'Vitamin D Supplementation and Mortality', { year: '2010' }),
        rec('K', 'Vitamin D Supplementation and Mortality', { year: '2018' }),
      ];
      expect((await run(sameTitle, { yearTol: 0 })).nClusters,
        'yearTol=0 → separate').toBe(2);
      expect((await run(sameTitle, { yearTol: 15 })).nClusters,
        'yearTol=15 → merged').toBe(1);

      // E. requireAuthor: same title, different first author.
      const diffAuthor = [
        rec('L', 'Probiotics for Antibiotic-Associated Diarrhea',
          { authors: 'Smith J; Doe A' }),
        rec('M', 'Probiotics for Antibiotic-Associated Diarrhea',
          { authors: 'Jones K' }),
      ];
      expect((await run(diffAuthor, { requireAuthor: 'yes' })).nClusters,
        'requireAuthor=yes, diff surname → separate').toBe(2);
      expect((await run(diffAuthor, { requireAuthor: 'no' })).nClusters,
        'requireAuthor=no → merged').toBe(1);

      // F. Normalization + Jaccard primitives.
      expect(await util('normTitle', 'The Effects of A Drug, on Health!'))
        .toBe('effects drug health');
      expect(await util('normDOI', 'https://doi.org/10.1/AbC'))
        .toBe('10.1/abc');
      expect(await util('normDOI', 'doi: 10.1/AbC')).toBe('10.1/abc');
      expect(await util('jaccardTitles',
        'SGLT2 Inhibitors in HF', 'SGLT2 Inhibitors in HF'),
        'identical → 1').toBe(1);
      expect(await util('jaccardTitles',
        'Efficacy of SGLT2 Inhibitors in Heart Failure',
        'efficacy of sglt2 inhibitors in heart failure.'),
        'near-dup ≥ 0.85').toBeGreaterThanOrEqual(0.85);
      expect(await util('jaccardTitles',
        'Anticoagulation in Atrial Fibrillation',
        'Vaccination Coverage in Children'),
        'distinct < 0.3').toBeLessThan(0.3);
    });
});
