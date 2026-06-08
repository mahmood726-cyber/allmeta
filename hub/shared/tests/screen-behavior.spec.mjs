/**
 * screen-behavior.spec.mjs — the Screen citation-screener compute core.
 *
 * Deterministic, constructed-oracle checks over window.__almScreenpro:
 *  - RIS / PubMed .nbib / CSV importers (field extraction, continuation lines,
 *    quoted-comma CSV cells, DOI [doi]-tag extraction).
 *  - Dedup: DOI-exact + trigram-Jaccard title similarity, AND preservation of
 *    reviewer-applied (manual) duplicate marks across an automatic re-dedup
 *    (regression guard — manual `d` decisions must survive import-triggered dedup).
 *  - effDecision: dup > (single:r1) / (dual: resolved > agreement > conflict > partial).
 *  - computeCounts PRISMA roll-up; Cohen's κ measured on RAW independent
 *    reviewer decisions (resolution must NOT inflate agreement).
 *  - Transparent relevance score: +1 per include-term hit, -2 per exclude-term hit.
 */
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:8088/screen/';
const TOL = 1e-9;

test.describe('screen', () => {
  test('loads, no console errors, hook present', async ({ page }) => {
    const errs = [];
    const benign = t => (t.includes('frame-ancestors') &&
      t.includes('Content Security Policy')) || t.includes('ERR_CONNECTION_REFUSED');
    page.on('console', m => { if (m.type() === 'error' && !benign(m.text())) errs.push(m.text()); });
    page.on('pageerror', e => { if (!benign(e.message)) errs.push(e.message); });
    await page.goto(APP_URL);
    await page.waitForFunction(
      () => window.__almScreenpro && typeof window.__almScreenpro.counts === 'function',
      { timeout: 10_000 });
    expect(errs, 'console errors: ' + errs.join('; ')).toEqual([]);
  });

  test('importers: RIS / nbib / CSV', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    const parse = (t, n) => page.evaluate(([x, y]) => window.__almScreenpro.parse(x, y), [t, n]);

    const ris = 'TY  - JOUR\nTI  - Dapagliflozin in heart failure\nAU  - McMurray JJV\nPY  - 2019\nDO  - 10.1056/NEJMoa1911303\nER  - \nTY  - JOUR\nTI  - Empagliflozin in HFpEF\nPY  - 2021\nER  - ';
    const r = await parse(ris, 'x.ris');
    expect(r.length).toBe(2);
    expect(r[0].doi).toBe('10.1056/NEJMoa1911303');
    expect(r[0].year).toBe('2019');

    const nbib = 'PMID- 31535829\nTI  - Dapagliflozin trial.\nAB  - Background.\n      Continued line.\nDP  - 2019 Nov 21\nAID - 10.1056/NEJMoa1911303 [doi]\nER  -';
    const n = await parse(nbib, 'x.nbib');
    expect(n.length).toBe(1);
    expect(n[0].pmid).toBe('31535829');
    expect(n[0].doi).toBe('10.1056/NEJMoa1911303');
    expect(n[0].abstract).toContain('Continued line');

    const csv = 'id,title,abstract,year,doi\nA1,"SGLT2, a review","Some, abstract",2020,10.1/x';
    const c = await parse(csv, 'x.csv');
    expect(c.length).toBe(1);
    expect(c[0].title).toBe('SGLT2, a review');
    expect(c[0].abstract).toBe('Some, abstract');
  });

  test('dedup: auto + manual-preserve', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    const dedup = (recs) => page.evaluate((r) => {
      window.__almScreenpro.setState({ records: r });
      return window.__almScreenpro.dedupCount();
    }, recs => recs);

    // DOI-exact + title-similarity dups
    let c = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: 'a', title: 'Dapagliflozin in heart failure trial', doi: '10.1/x' },
        { id: 'b', title: 'Totally different aspirin paper', doi: '10.1/x' },
        { id: 'c', title: 'Dapagliflozin in heart failure trial', doi: '' },
      ] });
      return window.__almScreenpro.dedupCount();
    });
    expect(c).toBe(2);

    // regression: a manual duplicate survives an automatic re-dedup that finds none
    let m = await page.evaluate(() => {
      window.__almScreenpro.setState({ records: [
        { id: '1', title: 'unique alpha', dupManual: true },
        { id: '2', title: 'unique beta' },
      ] });
      return window.__almScreenpro.dedupCount();
    });
    expect(m).toBe(1);
  });

  test('counts, effDecision, Cohen kappa, relevance', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });

    const res = await page.evaluate(() => {
      const A = window.__almScreenpro;
      A.setState({ mode: 'dual', records: [
        { id: '1', r1: { d: 'include' }, r2: { d: 'include' } },
        { id: '2', r1: { d: 'exclude' }, r2: { d: 'exclude' } },
        { id: '3', r1: { d: 'include' }, r2: { d: 'exclude' } },
        { id: '4', r1: { d: 'include' }, r2: { d: 'exclude' }, resolved: 'include' },
      ] });
      return {
        counts: A.counts(),
        kappa: A.kappa(),
        resolved: A.effDecision({ id: '4', dup: false, r1: { d: 'include' }, r2: { d: 'exclude' }, resolved: 'include' }),
        sPos: A.score({ title: 'SGLT2 in heart failure', abstract: 'sglt2 trial' }),
      };
    });
    // resolution does not change raw inter-rater agreement: 2 of 4 agree
    expect(Math.abs(res.kappa.po - 0.5)).toBeLessThan(TOL);
    expect(res.counts.conflict).toBe(1); // the resolved one is no longer a conflict
    expect(res.resolved).toBe('include');

    // relevance with terms set
    const s = await page.evaluate(() => {
      const A = window.__almScreenpro;
      A.setState({ incTerms: ['sglt2', 'heart failure'], excTerms: ['animal'], records: [] });
      return { pos: A.score({ title: 'SGLT2 in heart failure', abstract: 'sglt2' }),
               neg: A.score({ title: 'animal model', abstract: 'animal animal' }) };
    });
    expect(s.pos).toBeGreaterThan(0);
    expect(s.neg).toBeLessThan(0);
  });

  test('local ML classifier ranks + stays interpretable', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    const res = await page.evaluate(() => {
      const A = window.__almScreenpro;
      const r = (id, d, t) => ({ id, title: t, abstract: t + ' ' + t, r1: { d } });
      A.setState({ mode: 'single', records: [
        r('i1', 'include', 'heart failure dapagliflozin sglt2 randomized trial ejection'),
        r('i2', 'include', 'empagliflozin heart failure hospitalization cardiovascular trial'),
        r('i3', 'include', 'sglt2 inhibitor heart failure reduced ejection mortality'),
        r('e1', 'exclude', 'murine animal model cardiac fibrosis molecular signaling vitro'),
        r('e2', 'exclude', 'cost effectiveness economic model budget impact payer'),
        r('e3', 'exclude', 'animal study rat cardiac remodeling western blot protein'),
        { id: 'u_inc', title: 'dapagliflozin heart failure preserved ejection trial', abstract: 'sglt2 randomized cardiovascular', r1: { d: '' } },
        { id: 'u_exc', title: 'in vitro animal cardiac signaling pathways', abstract: 'murine western blot protein', r1: { d: '' } },
      ] });
      const tr = A.mlTrain();
      return { ok: tr.ok, inc: A.mlScoreOf('u_inc'), exc: A.mlScoreOf('u_exc'), top: A.mlTopTerms() };
    });
    expect(res.ok).toBe(true);
    expect(res.inc).toBeGreaterThan(res.exc);   // ranks include-like above exclude-like
    expect(res.top.pos.length).toBeGreaterThan(0); // interpretable weights exposed
  });

  test('AI handoff: self-contained prompt, suggestions are not auto-applied', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    const res = await page.evaluate(() => {
      const A = window.__almScreenpro;
      A.setState({ mode: 'single', records: [
        { id: 'r1', title: 'Dapagliflozin heart failure trial', abstract: 'randomized', r1: { d: '' } },
        { id: 'r2', title: 'Animal model study', abstract: 'murine', r1: { d: '' } },
      ] });
      const prompt = A.aiPrompt();
      const applied = A.aiApply([
        { id: 'r1', suggestion: 'include', confidence: 0.9, rationale: 'RCT in population' },
        { id: 'r2', suggestion: 'exclude', confidence: 0.95, rationale: 'animal study' },
        { id: 'nope', suggestion: 'include' },
      ]);
      const r1 = A.recordById('r1');
      return { hasSchema: prompt.indexOf('include|exclude|maybe') >= 0, hasRecords: prompt.indexOf('"r1"') >= 0,
        applied, sugg: r1.aiSuggestion, decision: r1.r1.d };
    });
    expect(res.hasSchema && res.hasRecords).toBe(true);
    expect(res.applied).toBe(2);            // unknown id ignored
    expect(res.sugg).toBe('include');       // stored as suggestion
    expect(res.decision).toBe('');          // NOT auto-applied to the reviewer decision
  });
});
