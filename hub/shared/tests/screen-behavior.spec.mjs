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

// ---- Paper-1 (Screen) audit fixes: findings 4, 11a, 11b ----
test.describe('screen audit fixes', () => {
  // Kwok seed-101 SHAPE (audit finding 4): early relevant finds, then a long run
  // of later, scattered finds. Once the model has learned, re-sorting the screened
  // records by CURRENT score puts every found include first and fakes a long
  // irrelevant tail, so buscar certified far too early (943 vs 1,759 on Kwok).
  // Constructed fixture: N=2000, 40 relevant, 25 in the first 200 screened and 15
  // spread out to position 930.
  const FIXTURE = () => {
    let a = 101;
    const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const words = 'alpha bravo cobalt delta ember fjord gamma harbor indigo jasper kestrel lumen magnet nectar onyx prism quartz raven sable tundra umber vortex willow xenon yarrow zephyr amber basil cedar dune'.split(' ');
    const N = 2000, rel = new Set();
    for (let p = 0; p < 200; p += 8) rel.add(p);            // 25 early finds
    for (let k = 0; k < 15; k++) rel.add(230 + 50 * k);       // 15 later finds, last at 930
    const recs = [];
    for (let i = 0; i < N; i++) {
      const t = [];
      for (let w = 0; w < 7; w++) t.push(words[Math.floor(rnd() * words.length)]);
      recs.push({ id: 'k' + i, title: t.join(' ') + ' ' + i.toString(36) + ' ' + (i * 7919).toString(36), abstract: '', r1: { d: '' }, gold: rel.has(i) ? 1 : 0 });
    }
    return recs;
  };

  test('stopping test uses screening order, not current-score order (Kwok-101 shape)', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    const out = await page.evaluate((recs) => {
      const A = window.__almScreenpro;
      A.setState({ mode: 'single', records: recs.map(({ gold, ...r }) => r) });
      const N = recs.length, gold = recs.map(r => r.gold), dups = A.dedupCount();
      // final-model scores rank every relevant record above every irrelevant one
      recs.forEach((r, i) => { A.recordById(r.id).mlScore = gold[i] ? 0.9 + i * 1e-6 : 0.1 + i * 1e-7; });
      const rows = [];
      let done = 0;
      for (let n = 100; n <= 1900; n += 100) {
        for (; done < n; done++) {
          const r = A.recordById(recs[done].id);
          r.r1.d = gold[done] ? 'include' : 'exclude';
          r.screenSeq = done + 1;   // what decide() stamps, in screening order
        }
        const chron = gold.slice(0, n);
        const ref = A.mlBuscarP(chron, N, 0.95);            // buscar on the true screening order
        const old = A.mlBuscarP(chron.slice().sort((x, y) => y - x), N, 0.95); // old: re-sorted by score
        const st = A.mlStopping();
        rows.push({ n, app: st.buscarP, ref, old, screened: st.screened });
      }
      return { dups, rows };
    }, FIXTURE());
    expect(out.dups).toBe(0);
    const first = key => { const r = out.rows.find(x => x[key] < 0.05); return r ? r.n : Infinity; };
    for (const r of out.rows) {
      expect(r.screened).toBe(r.n);
      expect(Math.abs(r.app - r.ref), 'n=' + r.n + ': app p must equal buscar on the screening order').toBeLessThan(1e-12);
    }
    // the fixture reproduces the defect: score re-sorting certifies earlier ...
    expect(first('old')).toBeLessThan(first('ref'));
    // ... and the corrected panel never certifies earlier than chronological order.
    expect(first('app')).toBeGreaterThanOrEqual(first('ref'));
    expect(first('ref')).toBeLessThan(Infinity);
    console.log('first certification at n: score-order ' + first('old') + ', chronological ' + first('ref') + ', app ' + first('app'));
  });

  test('stopping test: maybe is not irrelevant; unknown order refuses', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    const out = await page.evaluate(() => {
      const A = window.__almScreenpro, recs = [], seq = [];
      for (let i = 0; i < 400; i++) {
        let d = '', s = null;
        if (i < 300) { d = (i % 15 === 0) ? 'include' : 'exclude'; s = i + 1; seq.push(i % 15 === 0 ? 1 : 0); }
        else if (i < 360) d = 'maybe';            // must count as NOT yet screened
        recs.push({ id: 'm' + i, title: 'record ' + i + ' ' + (i * 104729).toString(36) + ' z' + (i * 31).toString(36), r1: { d }, screenSeq: s });
      }
      A.setState({ mode: 'single', records: recs });
      const st = A.mlStopping();
      const ref = A.mlBuscarP(seq, 400, 0.95);
      const asIrrelevant = A.mlBuscarP(seq.concat(new Array(60).fill(0)), 400, 0.95); // old behaviour
      // a merged reviewer decision has no known order, so the test must refuse
      A.mergeReviewer({ _schema: 'sr-reviewer-v1', reviewer: 'r1', decisions: [{ id: 'm390', title: recs[390].title, d: 'exclude' }] }, 'r1');
      const st2 = A.mlStopping();
      return { st, ref, asIrrelevant, st2, seq390: A.recordById('m390').screenSeq };
    });
    expect(out.st.screened).toBe(300);
    expect(out.st.pending).toBe(60);
    expect(out.st.unordered).toBe(0);
    expect(Math.abs(out.st.buscarP - out.ref)).toBeLessThan(1e-12);
    expect(out.asIrrelevant).toBeLessThan(out.ref);   // counting maybe as irrelevant was anti-conservative
    expect(out.seq390).toBeNull();
    expect(out.st2.unordered).toBe(1);
    // refusal is an explicit state, not a sentinel p-value (PR #140 review finding 4)
    expect(out.st2.status).toBe('unordered');
    expect(out.st2.buscarP).toBeNull();
  });

  test('decisions made in the app are stamped in screening order', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    await page.evaluate(() => window.__almScreenpro.setState({ mode: 'single', sort: 'order', records: [
      { id: 'a', title: 'first alpha record about kestrels' }, { id: 'b', title: 'second bravo record on quartz' },
      { id: 'c', title: 'third cobalt record with ravens' }, { id: 'd', title: 'fourth delta record for tundra' } ] }));
    await page.locator('#card-host [data-dec="exclude"]').click();   // a
    await page.locator('#card-host [data-dec="maybe"]').click();     // b
    await page.locator('#card-host [data-dec="include"]').click();   // c
    const seq = await page.evaluate(() => ['a', 'b', 'c', 'd'].map(id => window.__almScreenpro.recordById(id).screenSeq));
    expect(seq[0]).toBeGreaterThan(0);
    expect(seq[1]).toBeNull();                 // maybe is not screened
    expect(seq[2]).toBeGreaterThan(seq[0]);
    expect(seq[3]).toBeNull();
  });

  test('stopping panel is labelled experimental and never says "statistically safe to stop"', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    await page.evaluate(() => {
      const r = (id, d, t, s) => ({ id, title: t, abstract: t + ' ' + t, r1: { d }, screenSeq: s });
      window.__almScreenpro.setState({ mode: 'single', records: [
        r('i1', 'include', 'heart failure dapagliflozin sglt2 randomized trial ejection', 1),
        r('e1', 'exclude', 'murine animal model cardiac fibrosis molecular signaling vitro', 2),
        r('i2', 'include', 'empagliflozin heart failure hospitalization cardiovascular trial', 3),
        r('e2', 'exclude', 'cost effectiveness economic model budget impact payer', 4),
        { id: 'u1', title: 'dapagliflozin heart failure preserved ejection trial', abstract: 'sglt2 randomized cardiovascular', r1: { d: '' } },
      ] });
    });
    await page.locator('#btn-train').click();
    const perf = page.locator('#ml-perf');
    await expect(perf).toContainText('Experimental');
    await expect(perf).toContainText('order you screened them');
    expect(await page.content()).not.toContain('statistically safe to stop');
  });

  test('notices are shown through shared/toast.js (window.Toast)', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro && window.Toast, { timeout: 10_000 });
    expect(await page.evaluate(() => typeof window.AlmToast)).toBe('undefined');
    await page.locator('#btn-example').click();
    await expect(page.locator('.toast-container .toast-item').first()).toContainText('Example loaded');
  });

  test('PRISMA push exports only title/abstract-stage counts', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    await page.evaluate(() => window.__almScreenpro.setState({ mode: 'dual', records: [
      { id: '1', title: 'one alpha kestrel', r1: { d: 'include' }, r2: { d: 'include' } },
      { id: '2', title: 'two bravo quartz', r1: { d: 'exclude' }, r2: { d: 'exclude' } },
      { id: '3', title: 'three cobalt raven', r1: { d: 'exclude' }, r2: { d: 'exclude' } },
      { id: '4', title: 'four delta tundra', r1: { d: 'maybe' }, r2: { d: 'maybe' } },
      { id: '5', title: 'five ember willow', r1: { d: 'include' }, r2: { d: 'exclude' } },
      { id: '6', title: 'six fjord xenon', r1: { d: '' }, r2: { d: '' } },
      { id: '7', title: 'seven gamma yarrow', r1: { d: '' }, r2: { d: '' } },
      { id: '8', title: 'one alpha kestrel', r1: { d: '' }, r2: { d: '' } },  // duplicate of 1
    ] }));
    await page.evaluate(() => { window.__toasts = []; const show = Toast.show; Toast.show = (m, ...a) => { window.__toasts.push(m); return show(m, ...a); }; });
    await page.locator('#btn-prisma').click();
    const notices = await page.evaluate(() => window.__toasts);
    expect(notices.length).toBe(1);
    expect(notices[0]).toContain('NOT counted as excluded');
    expect(notices[0]).toContain('1 maybe, 1 unresolved conflict(s), 2 not yet screened');
    const flow = await page.evaluate(() => JSON.parse(localStorage.getItem('prisma-flow-v1')));
    expect(flow.db).toBe(8);
    expect(flow.removed).toBe(1);
    // PR #140 review finding 2: "screened" was identified - duplicates (7), so 4
    // records that never received a decision were reported as screened. Records
    // screened = records with a completed title/abstract decision (1 include +
    // 2 exclude); the pool available for screening is reported separately.
    expect(flow.screened).toBe(3);
    expect(flow.screeningPool).toBe(7);
    expect(flow.screened).toBe(flow.excludedScreen + flow.includedAtScreen);
    expect(notices[0]).not.toContain('7 screened');
    expect(flow.excludedScreen).toBe(2);               // decisive excludes only
    expect(flow.includedAtScreen).toBe(1);
    expect(flow.screenPending).toEqual({ maybe: 1, conflict: 1, undecided: 2 });
    for (const k of ['sought', 'notRetrieved', 'assessed', 'excludedEligible', 'excludedBreakdown', 'studies', 'reports']) {
      expect(flow[k], k + ' is a full-text field and must be left blank').toBe('');
      expect(flow.notProvided).toContain(k);
    }
    // PRISMA Flow then shows blank full-text fields, not title/abstract counts
    await page.goto(APP_URL.replace('/screen/', '/prisma-flow/'));
    await expect(page.locator('#f-excluded-screen')).toHaveValue('2');
    for (const id of ['#f-sought', '#f-assessed', '#f-studies', '#f-reports', '#f-excluded-breakdown']) await expect(page.locator(id)).toHaveValue('');
  });
});

// ---- PR #140 review (Codex, 18 Oct 2026): four blocking findings ----
test.describe('screen audit fixes, PR #140 review', () => {
  const FOUR = [
    { id: 'p1', title: 'alpha kestrel dapagliflozin trial', r1: { d: 'include' }, screenSeq: 1 },
    { id: 'p2', title: 'bravo quartz murine fibrosis model', r1: { d: 'exclude' }, screenSeq: 2 },
    { id: 'p3', title: 'cobalt raven empagliflozin outcomes', r1: { d: '' } },
    { id: 'p4', title: 'delta tundra economic budget impact', r1: { d: '' } },
  ];
  const svgTexts = page => page.evaluate(() =>
    Array.from(document.querySelectorAll('#svg-host svg text')).map(t => t.textContent));

  // Finding 1: blank full-text fields were read back as 0, drawn as "(n = 0)" and
  // re-saved as 0, and the pending/missingness metadata was dropped.
  test('PRISMA Flow keeps not-provided counts unknown through render, re-save, reload and JSON export', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    await page.evaluate(recs => window.__almScreenpro.setState({ mode: 'single', records: recs }), FOUR);
    await page.locator('#btn-prisma').click();
    await page.goto(APP_URL.replace('/screen/', '/prisma-flow/'));
    await page.waitForSelector('#svg-host svg');
    const check = async () => {
      const t = await svgTexts(page);
      const after = label => t[t.indexOf(label) + 1];
      expect(t).toContain('Reports sought for retrieval');
      expect(after('Reports sought for retrieval')).toBe('(n = not provided)');
      expect(after('Reports not retrieved')).toBe('(n = not provided)');
      expect(after('Reports assessed for eligibility')).toBe('(n = not provided)');
      expect(t).toContain('With reasons (n = not provided)');
      expect(t).toContain('Studies included in review (n = not provided)');
      expect(t).toContain('Reports of included studies (n = not provided)');
      expect(after('Records screened')).toBe('(n = 2)');
      const desc = await page.evaluate(() => document.querySelector('#svg-host svg desc').textContent);
      expect(desc).toContain('Reports sought for retrieval: not provided');
      expect(desc).not.toMatch(/sought for retrieval: 0|assessed for eligibility: 0|included in review: 0/);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('prisma-flow-v1')));
      for (const k of ['sought', 'notRetrieved', 'assessed', 'excludedEligible', 'studies', 'reports']) {
        expect(saved[k], k + ' must stay unknown after PRISMA Flow re-saves').toBeNull();
        expect(saved.notProvided).toContain(k);
      }
      expect(saved.screenPending).toEqual({ maybe: 0, conflict: 0, undecided: 2 });
      expect(saved.includedAtScreen).toBe(1);
      expect(saved.screeningPool).toBe(4);
      await expect(page.locator('#warn-banner')).toContainText('not provided');
      await expect(page.locator('#warn-banner')).toContainText('2 not yet screened');
    };
    await check();
    await page.reload();
    await page.waitForSelector('#svg-host svg');
    await check();                      // the re-saved state round-trips
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-json').click()]);
    const fs = await import('node:fs');
    const out = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    expect(out.sought).toBeNull();
    expect(out.notProvided).toContain('studies');
    expect(out.screenPending).toEqual({ maybe: 0, conflict: 0, undecided: 2 });
    // a value the user types is provided, including an explicit 0
    await page.locator('#f-sought').fill('1');
    await page.locator('#f-not-retrieved').fill('0');
    const t2 = await svgTexts(page);
    expect(t2[t2.indexOf('Reports sought for retrieval') + 1]).toBe('(n = 1)');
    expect(t2[t2.indexOf('Reports not retrieved') + 1]).toBe('(n = 0)');
    const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem('prisma-flow-v1')));
    expect(s2.sought).toBe(1);
    expect(s2.notRetrieved).toBe(0);
    expect(s2.notProvided).not.toContain('sought');
    expect(s2.notProvided).not.toContain('notRetrieved');
    expect(s2.notProvided).toContain('assessed');
  });

  // Finding 2: "screened" was identified - duplicates, so untouched records were
  // exported, toasted and displayed as screened.
  test('records screened counts completed decisions only, in the export, the notice and the stats', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    await page.evaluate(recs => window.__almScreenpro.setState({ mode: 'single', records: recs }), FOUR);
    const c = await page.evaluate(() => window.__almScreenpro.counts());
    expect(c.screened).toBe(2);
    expect(c.pool).toBe(4);
    await expect(page.locator('.stat', { hasText: 'Screened' }).locator('.v')).toHaveText('2');
    await page.evaluate(() => { window.__toasts = []; const show = Toast.show; Toast.show = (m, ...a) => { window.__toasts.push(m); return show(m, ...a); }; });
    await page.locator('#btn-prisma').click();
    const notice = (await page.evaluate(() => window.__toasts))[0];
    expect(notice).not.toContain('4 screened');
    expect(notice).toContain('2 of 4');
    expect(notice).toContain('2 not yet screened');
    const flow = await page.evaluate(() => JSON.parse(localStorage.getItem('prisma-flow-v1')));
    expect(flow.screened).toBe(2);
    expect(flow.screeningPool).toBe(4);
    // maybe / unresolved conflict are pending, not screened
    await page.evaluate(() => window.__almScreenpro.setState({ mode: 'dual', records: [
      { id: 'q1', title: 'one alpha', r1: { d: 'include' }, r2: { d: 'include' } },
      { id: 'q2', title: 'two bravo', r1: { d: 'maybe' }, r2: { d: 'maybe' } },
      { id: 'q3', title: 'three cobalt', r1: { d: 'include' }, r2: { d: 'exclude' } },
    ] }));
    const c2 = await page.evaluate(() => window.__almScreenpro.counts());
    expect(c2.screened).toBe(1);
    expect(c2.pool).toBe(3);
  });

  // Finding 3: a single-to-dual merge reconciled stamps BEFORE switching mode, so
  // a record that became a conflict kept its old stamp and, once resolved, was
  // placed at its original position instead of the resolution's.
  test('screening order is re-derived on merge, resolution, mode toggle and reload', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    await page.evaluate(() => window.__almScreenpro.setState({ mode: 'single', sort: 'order', records: [
      { id: 'a', title: 'first alpha record about kestrels' }, { id: 'b', title: 'second bravo record on quartz' },
      { id: 'c', title: 'third cobalt record with ravens' } ] }));
    await page.locator('#card-host [data-dec="exclude"]').click();   // a  -> 1
    await page.locator('#card-host [data-dec="include"]').click();   // b  -> 2
    const rec = id => page.evaluate(id => { const A = window.__almScreenpro, r = A.recordById(id); return { d: A.effDecision(r), seq: r.screenSeq }; }, id);
    expect((await rec('a')).seq).toBe(1);
    expect((await rec('b')).seq).toBe(2);
    // merge an R2 file while the project is still in single-reviewer mode
    const payload = { _schema: 'sr-reviewer-v1', reviewer: 'r2', decisions: [
      { id: 'a', title: 'first alpha record about kestrels', d: 'include' },
      { id: 'c', title: 'third cobalt record with ravens', d: 'exclude' } ] };
    await page.locator('#rev-file').setInputFiles({ name: 'r2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
    await expect(page.locator('#merge-status')).toContainText('Merged into R2');
    expect(await rec('a')).toEqual({ d: 'conflict', seq: null });     // was {conflict, 1}
    expect(await rec('b')).toEqual({ d: 'include', seq: 2 });
    expect(await rec('c')).toEqual({ d: 'exclude', seq: null });      // merged: order unknown
    let st = await page.evaluate(() => window.__almScreenpro.mlStopping());
    expect(st.status).toBe('unordered');
    expect(st.buscarP).toBeNull();
    // resolving the conflict makes it decisive NOW: it goes after b
    await page.locator('[data-res-inc="a"]').click();
    const ra = await rec('a');
    expect(ra.d).toBe('include');
    expect(ra.seq).toBeGreaterThan(2);
    // reload: stamps persist and the counter does not reuse a position
    await page.reload();
    await page.waitForFunction(() => window.__almScreenpro);
    expect(await rec('a')).toEqual(ra);
    expect((await rec('b')).seq).toBe(2);
    // toggling to single changes a's effective decision (R1 exclude): order unknown
    await page.locator('#f-dual').uncheck();
    expect(await rec('a')).toEqual({ d: 'exclude', seq: null });
    expect(await rec('c')).toEqual({ d: '', seq: null });
    st = await page.evaluate(() => window.__almScreenpro.mlStopping());
    expect(st.status).toBe('unordered');
    // ... and back to dual: the resolution is effective again but its order was lost
    await page.locator('#f-dual').check();
    expect(await rec('a')).toEqual({ d: 'include', seq: null });
    expect((await rec('b')).seq).toBe(2);                              // unchanged decision keeps its stamp
    // the test hook's mode switch goes through the same reconciliation
    await page.evaluate(() => window.__almScreenpro.setMode('single'));
    expect(await rec('c')).toEqual({ d: '', seq: null });
    expect(await rec('a')).toEqual({ d: 'exclude', seq: null });
  });

  test('changing a decisive decision re-stamps it at the time of the change', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    await page.evaluate(() => window.__almScreenpro.setState({ mode: 'single', sort: 'order', records: [
      { id: 'a', title: 'first alpha record about kestrels' }, { id: 'b', title: 'second bravo record on quartz' },
      { id: 'c', title: 'third cobalt record with ravens' } ] }));
    await page.locator('#card-host [data-dec="exclude"]').click();   // a -> 1
    await page.locator('#card-host [data-dec="exclude"]').click();   // b -> 2
    await page.keyboard.press('k');                                   // back to b
    await page.keyboard.press('k');                                   // back to a
    await page.locator('#card-host [data-dec="include"]').click();   // a: exclude -> include
    const s = await page.evaluate(() => ['a', 'b'].map(id => window.__almScreenpro.recordById(id)).map(r => [r.r1.d, r.screenSeq]));
    expect(s[0][0]).toBe('include');
    expect(s[1]).toEqual(['exclude', 2]);
    expect(s[0][1]).toBeGreaterThan(2);
  });

  // Finding 4: with nothing left to screen, buscar's sentinel p = 1 was shown as
  // "0.0% confidence ... keep screening".
  test('stopping test states: complete, empty, no include yet, not started, unknown order, tested', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    const st = await page.evaluate(() => {
      const A = window.__almScreenpro, out = {};
      const mk = (ds, seqs) => ds.map((d, i) => ({ id: 's' + i, title: 'record ' + i + ' ' + (i * 7919).toString(36), r1: { d }, screenSeq: seqs ? seqs[i] : (d === 'include' || d === 'exclude' ? i + 1 : null) }));
      A.setState({ mode: 'single', records: mk(['include', 'exclude', 'include', 'exclude']) }); out.complete = A.mlStopping();
      A.setState({ mode: 'single', records: mk(['exclude', 'exclude', 'exclude']) }); out.completeNoInc = A.mlStopping();
      A.setState({ mode: 'single', records: [] }); out.empty = A.mlStopping();
      A.setState({ mode: 'single', records: mk(['exclude', 'exclude', '', '']) }); out.noInc = A.mlStopping();
      A.setState({ mode: 'single', records: mk(['', '']) }); out.notStarted = A.mlStopping();
      A.setState({ mode: 'single', records: mk(['include', 'exclude', ''], [1, null, null]) }); out.unordered = A.mlStopping();
      A.setState({ mode: 'single', records: mk(['include', 'exclude', 'maybe']) }); out.pendingMaybe = A.mlStopping();
      return out;
    });
    expect(st.complete).toMatchObject({ status: 'complete', total: 4, screened: 4, found: 2, buscarP: null });
    expect(st.completeNoInc).toMatchObject({ status: 'complete', found: 0, buscarP: null });
    expect(st.empty).toMatchObject({ status: 'empty', total: 0, buscarP: null });
    expect(st.noInc).toMatchObject({ status: 'no-include', buscarP: null });
    expect(st.notStarted).toMatchObject({ status: 'not-started', buscarP: null });
    expect(st.unordered).toMatchObject({ status: 'unordered', unordered: 1, buscarP: null });
    expect(st.pendingMaybe.status).toBe('tested');       // a maybe is still unscreened
    expect(typeof st.pendingMaybe.buscarP).toBe('number');
  });

  test('stopping panel says screening is complete instead of "0.0% ... keep screening"', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForFunction(() => window.__almScreenpro, { timeout: 10_000 });
    const r = (id, d, t, s) => ({ id, title: t, abstract: t + ' ' + t, r1: { d }, screenSeq: s });
    const recs = [
      r('i1', 'include', 'heart failure dapagliflozin sglt2 randomized trial ejection', 1),
      r('e1', 'exclude', 'murine animal model cardiac fibrosis molecular signaling vitro', 2),
      r('i2', 'include', 'empagliflozin heart failure hospitalization cardiovascular trial', 3),
      r('e2', 'exclude', 'cost effectiveness economic model budget impact payer', 4),
    ];
    await page.evaluate(recs => window.__almScreenpro.setState({ mode: 'single', records: recs }), recs);
    await page.locator('#btn-train').click();
    const perf = page.locator('#ml-perf');
    await expect(perf).toContainText('Experimental');
    await expect(perf).toContainText('screening is complete');
    await expect(perf).toContainText('not applicable');
    await expect(perf).not.toContainText('keep screening');
    await expect(perf).not.toContainText('0.0%');
    await expect(perf).not.toContainText('Confidence');
    // unknown order: the rendered panel refuses
    const withGap = recs.map((x, i) => i === 1 ? Object.assign({}, x, { screenSeq: null }) : x)
      .concat([{ id: 'u1', title: 'dapagliflozin heart failure preserved ejection trial', abstract: 'sglt2 randomized cardiovascular', r1: { d: '' } }]);
    await page.evaluate(recs => window.__almScreenpro.setState({ mode: 'single', records: recs }), withGap);
    await page.locator('#btn-train').click();
    await expect(perf).toContainText('not applied');
    await expect(perf).not.toContainText('Confidence');
  });
});
