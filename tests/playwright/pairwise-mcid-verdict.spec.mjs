import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Requirement: the Pairwise AI bundle's TruthCert verdict and its GRADE imprecision check use a minimal
// clinically important difference (MCID) that the user entered on the scale of the measure, or say plainly
// that they are not assessed (lane pwrest3, follow-up to #567 which did the same for the 0.15 DDMA MCID).
// Defects guarded:
//  - TruthCertConfig.delta was a constant 0.1054 (|log 0.9|, "10% RRR") used as the MCID on ANY scale: on a
//    mean difference in mmHg it is 0.1 mmHg, so BP_REDUCTION (MD -7.8 mmHg, CI excluding 0) got verdict
//    UNCERTAIN with precision "poor" (CI width compared with 8 x 0.1054 mmHg), and GRADE imprecision
//    compared the CI with 3 x / 6 x 0.1054 mmHg.
//  - the optimal information size behind GRADE imprecision ("OIS not met") was computed from that delta and
//    from the studies' standard errors instead of the per-participant variance, so SGLT2_ACM needed 38
//    participants (R: 23 568 for an MCID of OR 0.90), and its heterogeneity adjustment 1 / (1 - I2) read an
//    I2 that calculatePooledEstimate does not return, so it was always 1 (BP_REDUCTION, MCID 5: 90 vs R 119).
//  - permutation "materially different" compared with a null delta (always true) once delta had no default.
// Reference: Pairwiseai/tests/ois_r460.json (ois_reference.R, R 4.6.0 + metafor 5.2.1).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || path.join(HERE, '..', '..');
const REF = JSON.parse(fs.readFileSync(path.join(ROOT, 'Pairwiseai', 'tests', 'ois_r460.json'), 'utf8'));
// Both pages (lane pwrest4 gave Truthcert1's own TruthCert the same MCID treatment as the bundle).
const PAGES = { 'Pairwise AI bundle': '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html',
  'TruthCert Pairwise Pro': '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html' };
const VERDICTS = ['STABLE', 'STABLE-NID', 'MODERATE', 'EXPOSED', 'UNCERTAIN'];

async function open(page, PATH) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.dismiss());
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  await page.goto(PATH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof runAnalysis === 'function');
  return errors;
}

async function run(page, demo, mcid) {
  await page.evaluate(d => loadDemoDataset(d), demo);
  await page.waitForTimeout(400);
  await page.evaluate(m => {
    const el = document.getElementById('mcidInput');
    if (el) el.value = m;
    window.__prev = AppState.results; runAnalysis();
  }, mcid);
  await page.waitForFunction(() => AppState.results && AppState.results !== window.__prev && AppState.truthcert
    && AppState.truthcert.results && AppState.truthcert.results.theta === AppState.results.pooled.theta, null, { timeout: 30000 });
  return page.evaluate(() => {
    computeGRADE();   // the Analysis-tab GRADE (the "Full" analyses compute it the same way)
    const tc = AppState.truthcert, v = document.getElementById('panel-verdict');
    const cfg = document.getElementById('htaConfigSection');
    return { verdict: tc.verdict, grade: tc.grade, ois: tc.results.ois, measure: AppState.results.measure,
      mainGrade: AppState.results.grade, panel: v ? v.innerText : '', delta: TruthCertConfig.delta,
      htaShown: !!cfg && cfg.style.display === 'block' };
  });
}

for (const [NAME, PATH] of Object.entries(PAGES)) {
  test(NAME + ': ' + 'TruthCertConfig carries no fixed MCID', async ({ page }) => {
    await open(page, PATH);
    expect(await page.evaluate(() => TruthCertConfig.delta)).toBeNull();
  });

  for (const demo of ['BP_REDUCTION', 'SGLT2_ACM']) {
    test(NAME + ': ' + `${demo}: with no MCID the verdict and GRADE imprecision say they are not assessed`, async ({ page }) => {
      test.setTimeout(90000);
      const errors = await open(page, PATH);
      const g = await run(page, demo, '');
      expect(g.verdict.verdict).toBe('NOT ASSESSED');
      expect(g.verdict.reason).toContain('MCID');
      expect(g.verdict.reason).toContain(g.measure);
      expect(g.grade.domains.imprecision.rating).toBe('Not assessed');
      expect(g.grade.domains.imprecision.downgrade).toBe(0);
      expect(g.grade.certainty).toContain('imprecision not assessed');
      expect(g.mainGrade.domains.imprecision.rating, 'Analysis-tab GRADE').toBe('Not assessed');
      expect(g.ois.ok).toBe(false);
      expect(g.panel).toContain('NOT ASSESSED');
      expect(g.panel).toContain('MCID');
      expect(g.panel).not.toContain('0.1054');
      expect(g.panel).not.toMatch(/OIS not met/);
      expect(g.htaShown, 'HTA is not offered on a verdict that was not assessed').toBe(false);
      expect(errors).toEqual([]);
    });
  }

  for (const c of REF.cases) {
    test(NAME + ': ' + `${c.set}: MCID ${c.mcid} is used on the scale of the ${c.measure} (delta ${c.delta.toFixed(4)}, OIS ${c.ois})`, async ({ page }) => {
      test.setTimeout(90000);
      const errors = await open(page, PATH);
      const g = await run(page, c.set, String(c.mcid));
      expect(g.measure).toBe(c.measure);
      expect(Math.abs(g.verdict.mcid.delta - c.delta)).toBeLessThan(1e-12);
      expect(VERDICTS).toContain(g.verdict.verdict);
      expect(g.ois.ok).toBe(true);
      expect(g.ois.totalN).toBe(c.totalN);
      expect(g.ois.oisRequired, `OIS page ${g.ois.oisRequired} R ${c.ois}`).toBe(c.ois);
      expect(g.ois.metOIS).toBe(c.totalN >= c.ois);
      const imp = g.grade.domains.imprecision;
      expect(imp.rating).not.toBe('Not assessed');
      if (c.totalN < c.ois) { expect(imp.rating).toBe('Serious'); expect(imp.reason).toContain('OIS not met'); }
      expect(g.grade.certainty).not.toContain('not assessed');
      expect(g.mainGrade.domains.imprecision.rating).not.toBe('Not assessed');
      expect(g.panel).toContain('MCID ' + c.mcid);
      expect(errors).toEqual([]);
    });
  }

  test(NAME + ': ' + 'BP_REDUCTION: an MCID of 5 mmHg no longer calls a -7.8 mmHg effect with a CI excluding 0 "poor" precision', async ({ page }) => {
    test.setTimeout(90000);
    await open(page, PATH);
    const g = await run(page, 'BP_REDUCTION', '5');
    expect(g.verdict.ci_excludes_null).toBe(true);
    expect(g.verdict.precision).not.toBe('poor');
  });

  test(NAME + ': ' + 'an unusable MCID is refused with the reason, and a changed MCID re-runs the verdict', async ({ page }) => {
    test.setTimeout(90000);
    const errors = await open(page, PATH);
    let g = await run(page, 'SGLT2_ACM', '1');
    expect(g.verdict.verdict).toBe('NOT ASSESSED');
    expect(g.verdict.reason).toMatch(/ratio/i);
    g = await run(page, 'SGLT2_ACM', 'abc');
    expect(g.verdict.verdict).toBe('NOT ASSESSED');
    expect(g.verdict.reason).toMatch(/not a number/i);
    // markup typed as the MCID is not echoed into the GRADE reason / decision log (both are innerHTML)
    const dialogs = [];
    page.on('dialog', d => dialogs.push(d.message()));
    g = await run(page, 'SGLT2_ACM', '<img src=x onerror=alert(7)>');
    expect(g.verdict.verdict).toBe('NOT ASSESSED');
    expect(await page.evaluate(() => document.querySelectorAll('img[src="x"]').length)).toBe(0);
    expect(dialogs).toEqual([]);
    g = await run(page, 'BP_REDUCTION', '0');
    expect(g.verdict.verdict).toBe('NOT ASSESSED');
    // change the MCID after the run: the verdict follows it without another Run
    await page.evaluate(() => { const el = document.getElementById('mcidInput'); el.value = '5'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForFunction(() => AppState.truthcert && AppState.truthcert.verdict.verdict !== 'NOT ASSESSED', null, { timeout: 10000 });
    expect(await page.evaluate(() => AppState.truthcert.verdict.mcid.delta)).toBe(5);
    expect(errors).toEqual([]);
  });

  // Review findings (lane pwrest4, independent Codex review): the Analysis-tab GRADE read ci_lower / ci_upper at
  // the top of the results object, where they are not (they are in results.pooled), so with an MCID it skipped the
  // CI checks and said "None"; a changed MCID re-ran only the TruthCert verdict, leaving the Analysis-tab GRADE as
  // it was; and a verdict that became NOT ASSESSED left the HTA section shown from the previous verdict.
  test(NAME + ': ' + 'the Analysis-tab GRADE judges the pooled CI, follows a changed MCID, and HTA hides when the verdict is not assessed', async ({ page }) => {
    test.setTimeout(90000);
    const errors = await open(page, PATH);
    // SGLT2_ACM, MCID OR 0.99 (delta 0.01005): the CI is far wider than 6 x delta
    let g = await run(page, 'SGLT2_ACM', '0.99');
    expect(g.mainGrade.domains.imprecision.rating, g.mainGrade.domains.imprecision.reason).toBe('Serious');
    expect(g.mainGrade.domains.imprecision.reason).toContain('MCID');
    // blank MCID, then enter one: both GRADEs follow without another Run
    g = await run(page, 'SGLT2_ACM', '');
    expect(g.mainGrade.domains.imprecision.rating).toBe('Not assessed');
    await page.evaluate(() => { const el = document.getElementById('mcidInput'); el.value = '0.99'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForFunction(() => AppState.truthcert && AppState.truthcert.verdict.verdict !== 'NOT ASSESSED', null, { timeout: 10000 });
    expect(await page.evaluate(() => AppState.results.grade.domains.imprecision.rating)).toBe('Serious');
    // an assessed verdict shows HTA; clearing the MCID hides it again
    g = await run(page, 'BP_REDUCTION', '5');
    expect(g.htaShown, `verdict ${g.verdict.verdict}`).toBe(true);
    await page.evaluate(() => { const el = document.getElementById('mcidInput'); el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForFunction(() => AppState.truthcert && AppState.truthcert.verdict.verdict === 'NOT ASSESSED', null, { timeout: 10000 });
    const after = await page.evaluate(() => ({ cfg: document.getElementById('htaConfigSection').style.display,
      main: AppState.results.grade.domains.imprecision.rating }));
    expect(after.cfg).not.toBe('block');
    expect(after.main).toBe('Not assessed');
    expect(errors).toEqual([]);
  });
}
