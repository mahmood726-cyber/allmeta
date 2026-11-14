import { test, expect } from '@playwright/test';

// Requirement: the Clinical, Clinical Translation and Power panels of TruthCert Pairwise Pro
// (Truthcert1 production) and the served Pairwise AI bundle show only numbers defined for the
// data's measure, and say what is not computed instead of inventing it (lane tcxd).
// Defects guarded:
//  - Compute Clinical: "P(clinically meaningful)" used an MCID fixed at 0.15 on any scale; the
//    OR -> RR step (Zhang-Yu) was multiplied by an extra (1 - CER), so the NNT was wrong.
//  - Translate: the pooled estimate was treated as an SMD and as a log OR at once, so a log OR was
//    also reported as an SMD / U3 / overlap and a mean difference as an odds ratio and NNT.
//  - Power: "Studies for 80% Power" was ((z_a + z_b) se / theta)^2, the ratio k_req / k, not a count
//    (the page's own power curve, se * sqrt(k / k'), contradicts it).

const PAGES = [
  ['TruthCert Pairwise Pro', '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html'],
  ['Pairwise AI bundle', '/Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html'],
];
const QNORM80 = 0.8416212335729143;  // R qnorm(0.8)

async function run(page, path, demo) {
  await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
  page.on('dialog', d => d.dismiss());
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDemoDataset === 'function');
  await page.evaluate(d => loadDemoDataset(d), demo);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__prev = AppState.results; });
  await page.locator('#runAnalysisBtn').click();
  await page.waitForFunction(() => AppState.results && AppState.results.pooled && AppState.results !== window.__prev,
    null, { timeout: 30000 });
}

for (const [name, path] of PAGES) {
  test(`${name}: binary OR -- clinical, translation and power numbers are the defined ones`, async ({ page }) => {
    test.setTimeout(60000);
    await run(page, path, 'SGLT2_ACM');
    const got = await page.evaluate(() => {
      document.getElementById('clinicalCER').value = '0.20';
      computeClinical();
      runClinicalTranslation();
      runPowerAnalysis();
      const r = AppState.results;
      return { m: r.measure, th: r.pooled.theta, se: r.pooled.se, k: r.studies.length,
        clin: document.getElementById('clinical-results').textContent,
        tr: document.getElementById('clinicalResults').textContent,
        pw: document.getElementById('powerResults').textContent };
    });
    expect(got.m).toBe('OR');
    const OR = Math.exp(got.th), cer = 0.2, rr = OR / (1 - cer + cer * OR), arr = cer * (1 - rr);
    // Compute Clinical
    expect(got.clin).not.toContain('P(clinically meaningful)');
    expect(got.clin).not.toContain('exceeds MCID');
    expect(got.clin).toContain('Not computed');
    expect(got.clin).toContain('MCID');
    expect(got.clin).toContain(Math.abs(1 / arr).toFixed(1));
    // Translate
    expect(got.tr).toContain(`Odds Ratio: ${OR.toFixed(2)}`);
    expect(got.tr).toContain(`Risk Ratio: ${rr.toFixed(2)}`);
    expect(got.tr).toContain(`NNT: ${Math.round(Math.abs(1 / arr))}`);
    for (const s of ['SMD:', 'U3:', 'Overlap:', 'Prob Superiority:']) expect(got.tr, `${s} shown for an OR`).not.toContain(s);
    expect(got.tr).toContain('Not computed');
    // Power: number of studies, consistent with the power curve's se * sqrt(k / k')
    const kReq = Math.ceil(got.k * ((1.96 + QNORM80) * got.se / Math.abs(got.th)) ** 2);
    expect(got.pw.replace(/\s+/g, ' ')).toContain(`Studies for 80% Power ${kReq} currently have ${got.k}`);
  });

  test(`${name}: mean difference -- no odds ratio, risk ratio, NNT or SMD invented from an MD`, async ({ page }) => {
    test.setTimeout(60000);
    await run(page, path, 'BP_REDUCTION');
    const got = await page.evaluate(() => {
      computeClinical();
      runClinicalTranslation();
      return { m: AppState.results.measure, clin: document.getElementById('clinical-results').textContent,
        tr: document.getElementById('clinicalResults').textContent };
    });
    expect(got.m).toBe('MD');
    for (const s of ['Odds Ratio:', 'Risk Ratio:', 'NNT:', 'ARR:', 'SMD:', 'U3:', 'Overlap:', 'Prob Superiority:']) {
      expect(got.tr, `${s} shown for an MD`).not.toContain(s);
    }
    expect(got.tr).toContain('Not computed');
    expect(got.clin).not.toContain('P(clinically meaningful)');
    expect(got.clin).not.toMatch(/NN[TH] \(/);
  });
}
