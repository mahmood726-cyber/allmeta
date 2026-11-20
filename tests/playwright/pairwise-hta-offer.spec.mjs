import { test, expect } from '@playwright/test';

// Requirement: the HTA configuration (#htaConfigSection) is offered, and its prerequisites notice
// (#htaPrerequisites) hidden, only while the verdict on the page has an evidence tier, i.e. is neither
// UNCERTAIN nor NOT ASSESSED; otherwise both are back in their state at page load (lane pwrest3, agy review of
// #572). Defects guarded:
//  - restoreTruthCertVerdict (project load) showed HTA for any saved verdict other than UNCERTAIN, so a saved
//    NOT ASSESSED verdict (bundle, no MCID) offered HTA; and it had no else branch, so loading a saved
//    UNCERTAIN verdict after an assessed run left the previous run's HTA section open.
//  - runTruthCertAnalysis had the same missing else: a run (or MCID change) giving UNCERTAIN / NOT ASSESSED
//    after one that offered HTA left HTA offered.

const PAGES = [
  // Truthcert1 has an MCID input since lane pwrest4 (no MCID: NOT ASSESSED), so it runs the NOT ASSESSED checks too
  ['TruthCert Pairwise Pro', '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html', '0.80'],
  ['Pairwise AI bundle', '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html', '0.80'],
];

async function open(page, path) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.dismiss());
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function' && typeof saveProject === 'function');
  return errors;
}

async function run(page, mcid) {
  await page.waitForTimeout(400);
  await page.evaluate(m => {
    const el = document.getElementById('mcidInput'); if (el) el.value = m;
    window.__prev = AppState.results; runAnalysis();
  }, mcid);
  await page.waitForFunction(() => AppState.results && AppState.results !== window.__prev && AppState.truthcert
    && AppState.truthcert.results && AppState.truthcert.results.theta === AppState.results.pooled.theta, null, { timeout: 30000 });
}

const hta = page => page.evaluate(() => ({
  verdict: AppState.truthcert ? AppState.truthcert.verdict.verdict : null,
  pre: document.getElementById('htaPrerequisites').style.display,
  cfg: document.getElementById('htaConfigSection').style.display,
}));

for (const [name, path, mcid] of PAGES) {
  test(`${name}: HTA is offered only for a verdict with a tier, after a run and after a project load`, async ({ page }) => {
    test.setTimeout(120000);
    const errors = await open(page, path);
    const initial = await hta(page);
    expect(initial.cfg, 'HTA configuration hidden at load').toBe('none');
    await page.evaluate(() => loadDemoDataset('SGLT2_ACM'));
    await run(page, mcid);
    const ok = await hta(page);
    expect(['STABLE', 'STABLE-NID', 'MODERATE', 'EXPOSED']).toContain(ok.verdict);
    expect(ok.cfg, 'HTA offered for an assessed verdict').toBe('block');
    const saved = await page.evaluate(() => JSON.stringify(saveProject()));

    // a project whose saved verdict is UNCERTAIN, loaded while HTA is offered
    const unc = JSON.parse(saved); unc.truthcert.verdict.verdict = 'UNCERTAIN'; unc.truthcert.verdict.tier = 'D';
    await page.evaluate(s => loadProject(s), JSON.stringify(unc));
    await page.waitForTimeout(400);
    let g = await hta(page);
    expect(g.verdict).toBe('UNCERTAIN');
    expect({ pre: g.pre, cfg: g.cfg }, 'loaded UNCERTAIN: HTA back to its state at load').toEqual({ pre: initial.pre, cfg: initial.cfg });

    // the assessed project loads with HTA offered again
    await page.evaluate(s => loadProject(s), saved);
    await page.waitForTimeout(400);
    expect((await hta(page)).cfg).toBe('block');

    // a run that ends UNCERTAIN (determineVerdict planted) after one that offered HTA
    await page.evaluate(() => { window.__realDV = window.determineVerdict;
      window.determineVerdict = (...a) => ({ ...window.__realDV(...a), verdict: 'UNCERTAIN' }); });
    await page.evaluate(() => loadDemoDataset('SGLT2_ACM'));
    await run(page, mcid);
    await page.evaluate(() => { window.determineVerdict = window.__realDV; });
    g = await hta(page);
    expect(g.verdict).toBe('UNCERTAIN');
    expect({ pre: g.pre, cfg: g.cfg }, 'run UNCERTAIN: HTA back to its state at load').toEqual({ pre: initial.pre, cfg: initial.cfg });

    if (mcid) {
      // a saved NOT ASSESSED verdict (no MCID) loaded while HTA is offered, and an MCID cleared after a run
      await page.evaluate(() => loadDemoDataset('SGLT2_ACM'));
      await run(page, '');
      expect((await hta(page)).verdict).toBe('NOT ASSESSED');
      const na = await page.evaluate(() => JSON.stringify(saveProject()));
      await page.evaluate(s => loadProject(s), saved);
      await page.waitForTimeout(400);
      expect((await hta(page)).cfg).toBe('block');
      await page.evaluate(s => loadProject(s), na);
      await page.waitForTimeout(400);
      g = await hta(page);
      expect(g.verdict).toBe('NOT ASSESSED');
      expect({ pre: g.pre, cfg: g.cfg }, 'loaded NOT ASSESSED: HTA back to its state at load').toEqual({ pre: initial.pre, cfg: initial.cfg });

      await page.evaluate(s => loadProject(s), saved);
      await page.waitForTimeout(400);
      await page.evaluate(() => { const el = document.getElementById('mcidInput'); el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.waitForFunction(() => AppState.truthcert && AppState.truthcert.verdict.verdict === 'NOT ASSESSED', null, { timeout: 10000 });
      g = await hta(page);
      expect({ pre: g.pre, cfg: g.cfg }, 'MCID cleared: HTA back to its state at load').toEqual({ pre: initial.pre, cfg: initial.cfg });
    }
    expect(errors).toEqual([]);
  });
}
