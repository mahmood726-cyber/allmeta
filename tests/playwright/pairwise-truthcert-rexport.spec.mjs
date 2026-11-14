import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Requirement: the R script on the Code tab of TruthCert Pairwise Pro (Truthcert1 production) reproduces the
// page's random-effects result for the tau2 estimator and CI method the user chose (lane pwrest, follow-up
// to #566). Defect guarded: the export always wrote rma(yi, vi, method="REML") with the default z test,
// whatever estimator (DL, PM, ML, HS, SJ, HE, EB) and HKSJ setting the page used, and rounded yi / vi to 4
// decimals. The exported script is run in R (metafor) and its tau2, estimate, SE and 95% CI are compared
// with the page's; the HKSJ CI is compared with the page's HKSJ CI (q floored at 1 = metafor test="adhoc").

const PATH = '/Truthcert1/TruthCert-PairwisePro-v1.0-production.html';
const METHODS = ['REML', 'DL', 'PM', 'ML', 'HS', 'SJ', 'HE', 'EB'];
const ITERATIVE = new Set(['REML', 'ML', 'PM', 'EB']);
const EMIT = '\ncat("\\nRESULT_JSON", jsonlite::toJSON(list(b = as.numeric(res$b), se = res$se, tau2 = res$tau2, ' +
  'ci_lb = res$ci.lb, ci_ub = res$ci.ub, method = res$method, test = res$test), digits = I(17), auto_unbox = TRUE), "\\n")\n';

function rscript() {
  for (const c of [process.env.RSCRIPT, 'C:/Program Files/R/R-4.6.0/bin/Rscript.exe']) if (c && fs.existsSync(c)) return c;
  return null;
}

async function exportFor(page, demo, method, hksj) {
  await page.evaluate(d => loadDemoDataset(d), demo);
  await page.waitForTimeout(200);
  await page.evaluate(([m, hk]) => {
    const s = document.getElementById('tau2MethodSelect'); s.value = m; s.dispatchEvent(new Event('change'));
    const c = document.getElementById('hksjCheckbox');
    if (c.checked !== hk) { c.checked = hk; c.dispatchEvent(new Event('change')); }
    window.__prev = AppState.results;
  }, [method, hksj]);
  await page.locator('#runAnalysisBtn').click();
  await page.waitForFunction(() => AppState.results && AppState.results.pooled && AppState.results !== window.__prev,
    null, { timeout: 30000 });
  return page.evaluate(() => {
    const r = AppState.results;
    return { setting: AppState.settings.tau2Method, hk: AppState.settings.hksj, tau2: r.tau2, theta: r.pooled.theta,
      se: r.hksj ? r.hksj.se_hksj : r.pooled.se, ci: r.hksj ? [r.hksj.ci_lower, r.hksj.ci_upper] : [r.pooled.ci_lower, r.pooled.ci_upper],
      code: document.querySelector('#panel-code pre code').textContent };
  });
}

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

for (const demo of ['BCG', 'BP_REDUCTION']) {
  test(`${demo}: the exported R script reproduces the page for every estimator, with and without HKSJ`, async ({ page }) => {
    test.setTimeout(300000);
    await page.addInitScript(() => localStorage.setItem('truthcert_visited', 'true'));
    page.on('dialog', d => d.dismiss());
    await page.goto(PATH, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof loadDemoDataset === 'function');
    const cases = [];
    for (const m of METHODS) for (const hk of [true, false]) cases.push({ m, hk, page: await exportFor(page, demo, m, hk) });
    for (const c of cases) {
      expect(c.page.setting).toBe(c.m);
      expect(c.page.code, `${c.m} export`).toContain(`method="${c.m}"`);
      expect(c.page.code).toContain(c.hk ? 'test="adhoc"' : 'test="z"');
    }
    const rs = rscript();
    test.skip(!rs, 'Rscript not found (set RSCRIPT): the exported R scripts were NOT run');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc1-rexport-'));
    try {
      for (const c of cases) {
        const f = path.join(tmp, `${c.m}_${c.hk}.R`);
        fs.writeFileSync(f, c.page.code + EMIT, 'utf8');
        const out = spawnSync(rs, ['--no-environ', f], { cwd: tmp, encoding: 'utf8', timeout: 120000 });
        expect(out.status, `${demo} ${c.m} hk=${c.hk}: ${out.stderr.slice(-800)}`).toBe(0);
        const res = JSON.parse(out.stdout.split('RESULT_JSON', 2)[1].trim().split('\n')[0]);
        expect(res.method).toBe(c.m);
        const tol = ITERATIVE.has(c.m) ? 1e-5 : 1e-8;
        const ctx = `${demo} ${c.m} hk=${c.hk}`;
        if (c.page.tau2 > 1e-10) expect(rel(res.tau2, c.page.tau2), `${ctx} tau2 R ${res.tau2} page ${c.page.tau2}`).toBeLessThan(tol);
        else expect(res.tau2, `${ctx} tau2`).toBeLessThan(1e-8);
        expect(rel(res.b, c.page.theta), `${ctx} estimate`).toBeLessThan(tol);
        expect(rel(res.se, c.page.se), `${ctx} SE R ${res.se} page ${c.page.se}`).toBeLessThan(tol);
        expect(rel(res.ci_lb, c.page.ci[0]), `${ctx} CI lower`).toBeLessThan(tol);
        expect(rel(res.ci_ub, c.page.ci[1]), `${ctx} CI upper`).toBeLessThan(tol);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}
