/**
 * Verifies bayesian-mcmc ACTS on its convergence diagnostics (P1):
 *  - single chain -> "needs >=2 chains" notice (Rhat uncomputable)
 *  - multi-chain -> "Not converged" banner appears IFF Rhat>1.01 or ESS<400
 *    (consistency with the displayed diagnostic cells; no convergence assumption).
 */
import { test, expect } from '@playwright/test';
const URL = 'http://127.0.0.1:8080/bayesian-mcmc/index.html';
const BENIGN = /frame-ancestors' is ignored when delivered via a <meta>/;

async function run(page, chains, iter) {
  await page.fill('#chains', String(chains));
  await page.fill('#iter', String(iter));
  await page.click('#btn-run');
  await page.waitForFunction(() => /Done\./.test(document.getElementById('status')?.textContent || ''), { timeout: 30000 });
  return page.evaluate(() => {
    const status = document.getElementById('status').textContent.trim();
    const rows = Array.from(document.querySelectorAll('#body tr'));
    const cells = rows.map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim()));
    // rows: μ, τ, predictive. Columns: param, mean, sd, CrI, Rhat, ESS
    const parse = (i) => ({ rhat: parseFloat(cells[i]?.[4]), ess: parseFloat(cells[i]?.[5]) });
    return { status, mu: parse(0), tau: parse(1) };
  });
}

test('bayesian-mcmc flags non-convergence consistently with diagnostics', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });

  const single = await run(page, 1, 2000);
  console.log('  single-chain:', single.status);
  expect(single.status, 'single chain advises >=2 chains').toMatch(/2 chains/i);

  const multi = await run(page, 2, 10000);
  console.log('  2-chain 10k:', JSON.stringify(multi));
  const bad = (Number.isFinite(multi.mu.rhat) && multi.mu.rhat > 1.01) ||
              (Number.isFinite(multi.tau.rhat) && multi.tau.rhat > 1.01) ||
              multi.mu.ess < 400 || multi.tau.ess < 400;
  // The banner must appear exactly when the displayed diagnostics are bad.
  if (bad) expect(multi.status, 'warns when Rhat>1.01 or ESS<400').toMatch(/Not converged/i);
  else expect(multi.status, 'no warning when converged').not.toMatch(/Not converged/i);

  expect(errors, 'no console/page errors').toEqual([]);
});
