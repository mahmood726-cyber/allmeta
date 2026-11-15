import { test, expect } from '@playwright/test';

// Requirement (post-merge review rrevpw2 of #572, lane pwrest4), both pages unless stated:
//  - the Bias tab's trim-and-fill card shows the original / adjusted effect on the scale of the measure and the
//    change as a percentage only for a ratio measure (it showed exp(theta): BP_REDUCTION MD -7.77 as "0.000",
//    and an exp-based "Change %" for a mean difference);
//  - a trim-and-fill that was not run is never shown as a green "No asymmetry detected"; Truthcert1 runs it when
//    the Bias tab is opened, as its own not-run text says (nothing called onTabActivate there);
//  - the GRADE report line never prints "T&F: undefined imputed" (bundle);
//  - no user-visible text names an internal lane;
//  - Truthcert1: the Report tab renders and generates its report (two generateGRADESummary declarations, the later
//    one with another signature, threw on the GRADE style; generateFullReport read AppState.reportSettings.sections
//    before anything had set it).

const PAGES = {
  'Pairwise AI bundle': '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html',
  'TruthCert Pairwise Pro': '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html',
};

async function open(page, path) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.dismiss());
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof runAnalysis === 'function');
  return errors;
}
async function run(page, demo) {
  await page.evaluate(d => loadDemoDataset(d), demo);
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__prev = AppState.results; runAnalysis(); });
  await page.waitForFunction(() => AppState.results && AppState.results.pooled && AppState.results !== window.__prev, null, { timeout: 30000 });
  await page.waitForTimeout(600);
}
const tfCard = page => page.evaluate(() => {
  const t = document.getElementById('panel-bias').innerText, i = t.indexOf('Trim and Fill');
  if (i < 0) return '';
  const c = t.slice(i), j = c.search(/Metaoverfit/i);   // this card only
  return j < 0 ? c.slice(0, 600) : c.slice(0, j);
});

for (const [name, path] of Object.entries(PAGES)) {
  test(`${name}: trim-and-fill card on the scale of the measure; not run is not green; opening the Bias tab runs it`, async ({ page }) => {
    test.setTimeout(120000);
    const errors = await open(page, path);
    await run(page, 'BP_REDUCTION');
    // a result whose trim-and-fill has not run yet: the card must not say "No asymmetry detected"
    const notRun = await page.evaluate(() => {
      const r = AppState.results, keep = r.trimfill;
      r.trimfill = { skipped: true, not_run: 'Trim-and-fill was not run for this result.' };
      safeRender(renderBiasPanel, 'panel-bias', r);
      const t = document.getElementById('panel-bias').innerText;
      r.trimfill = keep;
      return t;
    });
    expect(notRun, 'not-run trim-and-fill shown as no asymmetry').not.toContain('No asymmetry detected');
    expect(notRun).toContain('not run');
    // opening the Bias tab computes it (Truthcert1 had nothing calling onTabActivate)
    await page.evaluate(() => { document.querySelector('[data-tab="data"]').click(); document.querySelector('[data-tab="bias"]').click(); });
    await page.waitForFunction(() => AppState.results.trimfill && !AppState.results.trimfill.skipped, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const tf = await page.evaluate(() => AppState.results.trimfill);
    const card = await tfCard(page);
    const fmt = x => x.toFixed(3);
    expect(card, 'original effect on the MD scale').toContain(fmt(tf.original.theta));
    expect(card, 'adjusted effect on the MD scale').toContain(fmt(tf.adjusted.theta));
    expect(card, 'the effect was printed as exp(theta)').not.toMatch(/0\.000\s+(original|adjusted) effect/i);
    expect(card, 'no percentage change for a mean difference').not.toMatch(/[+-]?\d+\.\d%/);
    // a ratio measure keeps its ratio and percentage change
    await run(page, 'SGLT2_ACM');
    await page.evaluate(() => { document.querySelector('[data-tab="data"]').click(); document.querySelector('[data-tab="bias"]').click(); });
    await page.waitForFunction(() => AppState.results.trimfill && !AppState.results.trimfill.skipped, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const tf2 = await page.evaluate(() => AppState.results.trimfill);
    const card2 = await tfCard(page);
    expect(card2).toContain(Math.exp(tf2.original.theta).toFixed(3));
    expect(card2).toMatch(/[+-]?\d+\.\d%/);
    expect(errors).toEqual([]);
  });

  test(`${name}: the report renders, the GRADE profile never says "undefined imputed", no lane names in the text`, async ({ page }) => {
    test.setTimeout(120000);
    const errors = await open(page, path);
    await run(page, 'BP_REDUCTION');
    await page.evaluate(() => document.querySelector('[data-tab="report"]').click());
    await page.waitForFunction(() => document.getElementById('generatedReportContainer'), null, { timeout: 10000 });
    const rep = await page.evaluate(async () => {
      const s = document.getElementById('reportStyle');
      if (s) { s.value = 'grade'; s.dispatchEvent(new Event('change', { bubbles: true })); }
      if (typeof updateReportSettings === 'function') updateReportSettings();
      let err = null;
      try { generateFullReport(); } catch (e) { err = String(e); }
      await new Promise(r => setTimeout(r, 300));
      const g = (() => { try { return generateGRADESummary(AppState.results); } catch (e) { return 'THREW ' + e; } })();
      return { err, text: document.getElementById('generatedReportContainer').innerText, grade: g };
    });
    expect(rep.err).toBeNull();
    expect(rep.grade).not.toMatch(/^THREW/);
    expect(rep.text.length, 'report generated').toBeGreaterThan(200);
    expect(rep.grade).not.toContain('undefined');
    expect(rep.text).not.toContain('undefined imputed');
    // the verdict's trim-and-fill line for a verdict without one
    const vtxt = await page.evaluate(() => {
      const tc = AppState.truthcert; if (!tc) return '';
      const keep = tc.results.trimAndFill; tc.results.trimAndFill = {};
      try { renderTruthCertTrimFill(tc); } finally { tc.results.trimAndFill = keep; }
      return document.getElementById('trimFillResults').textContent;
    });
    expect(vtxt).not.toMatch(/lane\s+pw/i);
    const all = await page.evaluate(() => document.body.innerText);
    expect(all).not.toMatch(/lane\s+pw[a-z]*\d/i);
    expect(errors).toEqual([]);
  });
}
