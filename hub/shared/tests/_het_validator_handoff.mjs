// User-path check: every control on heterogeneity/ that opens the WebR validator must
// hand it the studies and the tau^2 estimator the page is CURRENTLY showing.
//
// Found 2026-11-12 on the live site (real Chrome): with BCG pasted and REML selected,
//  - "Verify in R" opened nothing for a new user (alert "No studies on the shared bus
//    yet") and, for a returning user, opened the validator on whatever an earlier
//    session had left on the shared bus;
//  - "Validate (R)" and "Continue with -> Verify in R (WebR)" opened it on the right
//    studies but always fitted Paule-Mandel, so R showed tau^2 0.3181 / CI -1.070 to
//    -0.360 next to the page's REML 0.3132 / -1.067 to -0.362, while the validator said
//    "Match" (its own browser fit against R, both PM).
// No WebR is run here: the check is what the validator is GIVEN, which is what decided
// whether its R numbers could equal the page's.
// Shared by heterogeneity-validator-handoff.spec.mjs (CI, @playwright/test) and
// tools/userpath/het-handoff.cjs (playwright-core, real Chrome, any base URL).

// BCG vaccine trials (metafor dat.bcg, escalc RR): label, log RR, SE.
export const BCG = `study, yi, sei
Aronson 1948, -0.8893113339, 0.5706003549
Ferguson & Simes 1949, -1.5853886572, 0.4411135017
Rosenthal et al 1960, -1.3480731483, 0.6444904696
Hart & Sutherland 1977, -1.4415511900, 0.1414568199
Frimodt-Moller et al 1973, -0.2175473222, 0.2262966464
Stein & Aronson 1953, -0.7861155858, 0.0831000509
Vandiviere et al 1973, -1.6208982236, 0.4722470197
TPT Madras 1980, 0.0119523335, 0.0629410780
Coetzee & Berjak 1968, -0.4694176487, 0.2375588568
Rosenthal et al 1961, -1.3713448035, 0.2702310005
Comstock et al 1974, -0.3393588283, 0.1114101161
Comstock & Webster 1969, 0.4459134006, 0.7297299810
Comstock et al 1976, -0.0173139482, 0.2672165034`;

export const CONTROLS = [
  { name: 'Verify in R', selector: '#btn-verify-in-r' },
  { name: 'Validate (R)', selector: '#btn-validate-webr' },
  { name: 'Continue with -> Verify in R (WebR)', selector: '[data-alm-flow="webr-validator"]' },
];

const LETTER = { pm: 'PM', reml: 'REML', ml: 'ML', eb: 'EB', sj: 'SJ', he: 'HE', hs: 'HS', dl: 'DL' };

// Returns one record per control: what the validator received and whether it is what
// the page shows. `stale` pre-seeds the shared bus with other studies first (a
// returning user who used another app earlier).
export async function checkHandoff(context, baseURL, { tau2 = 'reml', stale = true } = {}) {
  const page = await context.newPage();
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.goto(new URL('heterogeneity/', baseURL).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.MaStudies && window.__almHetCompute && document.querySelector('[data-alm-flow="webr-validator"]'), null, { timeout: 30000 });
  if (stale) await page.evaluate(() => window.MaStudies.write([{ label: 'Earlier A', est: 0.5, se: 0.2 }, { label: 'Earlier B', est: 0.1, se: 0.3 }, { label: 'Earlier C', est: 0.3, se: 0.25 }]));
  await page.fill('#f-data', BCG);
  await page.selectOption('#f-tau2', tau2);
  await page.click('#btn-run');
  await page.waitForTimeout(500);
  const app = await page.evaluate(() => {
    const r = window.__almHetCompute(document.getElementById('f-data').value, document.getElementById('f-tau2').value);
    return { estimator: r.estimator, tau2: r.tau2, mu: r.sum.mu, studies: window._almLastStudies().map((s) => [s.est, Math.sqrt(s.v)]) };
  });
  const out = [];
  for (const c of CONTROLS) {
    const rec = { control: c.name, appEstimator: LETTER[app.estimator], dialogs: [] };
    const n0 = dialogs.length;
    const popupP = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
    await page.locator(c.selector).first().click();
    const popup = await popupP;
    rec.dialogs = dialogs.slice(n0);
    if (!popup) { rec.opened = false; out.push(rec); continue; }
    rec.opened = true;
    await popup.waitForLoadState('load');
    await popup.waitForFunction(() => window.__almValidatorFit && document.getElementById('f-data'), null, { timeout: 30000 });
    await popup.waitForTimeout(500);
    const v = await popup.evaluate(() => {
      const rows = document.getElementById('f-data').value.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
        .map((l) => { const p = l.split(/\s*[,\t]\s*/); return [Number(p[p.length - 2]), Number(p[p.length - 1])]; });
      const method = document.getElementById('f-method').value, test = document.getElementById('f-test').value;
      const fit = window.__almValidatorFit(rows.map(([est, se]) => ({ est, se, v: se * se })), method, test);
      const banner = document.getElementById('source-banner');
      return { url: location.href, method, test, rows, tau2: fit && fit.tau2, mu: fit && fit.estimate, banner: banner && !banner.hidden ? banner.textContent : null };
    });
    Object.assign(rec, v);
    rec.sameStudies = v.rows.length === app.studies.length && v.rows.every(([e, s], i) => Math.abs(e - app.studies[i][0]) < 1e-12 && Math.abs(s - app.studies[i][1]) < 1e-12);
    rec.sameModel = v.method === LETTER[app.estimator] && v.test === 'z';
    rec.sameTau2 = Number.isFinite(v.tau2) && Math.abs(v.tau2 - app.tau2) <= 1e-9 * Math.max(1, app.tau2);
    rec.appTau2 = app.tau2; rec.appMu = app.mu;
    await popup.close();
    out.push(rec);
  }
  await page.close();
  return out;
}
