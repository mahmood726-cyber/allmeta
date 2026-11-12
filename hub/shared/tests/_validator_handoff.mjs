// User-path check (lane rc5, 2026-11-12): every control on an allmeta app that opens the
// WebR validator must hand it the studies the page is CURRENTLY showing, and either the
// model the page's headline uses (apps whose headline IS an inverse-variance pool the
// validator re-fits) or the validator's "NOT <app>'s own model" banner (apps whose
// model is something else).
//
// Root cause RC5 (found on heterogeneity by lane up1, fixed there in 41511fb2):
// "Verify in R" read the saved shared bus instead of the page, so a new user got the
// alert "No studies on the shared bus yet" and a returning user got an earlier
// session's studies; "Validate (R)" / "Continue with -> Verify in R (WebR)" sent no
// estimator, so the validator always fitted PM/z.
//
// The user pastes BCG (13 studies) in the app's own format, runs the app, and presses
// each control. No WebR is needed for the hand-off verdict (what the validator is GIVEN
// decides whether its R numbers can equal the page's); `webr: true` additionally runs
// real WebR in the validator from the first control and compares R with the page.
// Shared by tools/userpath/validator-handoff.cjs (playwright-core, any base URL).

// BCG vaccine trials (metafor dat.bcg, escalc RR): label, log RR, SE.
export const BCG = [
  ['Aronson 1948', -0.8893113339, 0.5706003549],
  ['Ferguson & Simes 1949', -1.5853886572, 0.4411135017],
  ['Rosenthal et al 1960', -1.3480731483, 0.6444904696],
  ['Hart & Sutherland 1977', -1.4415511900, 0.1414568199],
  ['Frimodt-Moller et al 1973', -0.2175473222, 0.2262966464],
  ['Stein & Aronson 1953', -0.7861155858, 0.0831000509],
  ['Vandiviere et al 1973', -1.6208982236, 0.4722470197],
  ['TPT Madras 1980', 0.0119523335, 0.0629410780],
  ['Coetzee & Berjak 1968', -0.4694176487, 0.2375588568],
  ['Rosenthal et al 1961', -1.3713448035, 0.2702310005],
  ['Comstock et al 1974', -0.3393588283, 0.1114101161],
  ['Comstock & Webster 1969', 0.4459134006, 0.7297299810],
  ['Comstock et al 1976', -0.0173139482, 0.2672165034],
];
// Absolute latitude of each trial (dat.bcg ablat): a real moderator for gosh-metareg.
const ABLAT = [44, 55, 42, 52, 13, 44, 19, 13, 27, 42, 18, 33, 33];

const fmtLabelFirst = () => BCG.map(([l, y, s]) => `${l}, ${y}, ${s}`).join('\n');
const fmtEstFirst = () => BCG.map(([l, y, s]) => `${y}, ${s}, ${l}`).join('\n');

// Per app: input box and format, how the page is run, and what the validator must show.
// `model`: the estimator/test of the page's headline when it is an IV pool, plus a page
// expression returning that headline {mu, tau2}. `banner`: the page is not an IV pool.
export const APPS = {
  'forest-plot': { input: '#f-data', text: fmtLabelFirst,
    model: { method: 'PM', test: 'adhoc', headline: 'const p = window._almForestState().pool; ({ mu: p.mu, tau2: p.tau2, lo: p.ci_lb, hi: p.ci_ub })' } },
  'funnel-plot': { input: '#f-data', text: fmtLabelFirst,
    model: { method: 'FE', test: 'z', headline: 'const p = window._almLastFE(); ({ mu: p.mu, tau2: 0, lo: p.lo, hi: p.hi })' } },
  'cumulative-subgroup': { input: '#f-data', text: fmtLabelFirst,
    model: { method: 'PM', test: 'z', headline: 'const r = typeof window._almLastCumSub === "function" ? window._almLastCumSub() : window._almLastCumSub; ({ mu: r.mu_final, tau2: r.tau2_final, lo: r.lo_final, hi: r.hi_final })' } },
  'influence': { input: '#src', text: fmtEstFirst, run: '#btn-run',
    model: { method: 'REML', test: 'z', headline: 'const p = window._almLastInfluence(); ({ mu: p.mu, tau2: p.tau2, lo: p.ciLo, hi: p.ciHi })' } },
  'bayesian-ma': { input: '#f-data', text: fmtLabelFirst, banner: true },
  'bayesian-mcmc': { input: '#src', text: fmtEstFirst, run: '#btn-run', wait: 4000, banner: true },
  'copas': { input: '#src', text: fmtEstFirst, run: '#btn-run', wait: 3000, banner: true },
  'gosh': { input: '#src', text: fmtEstFirst, run: '#btn-run', wait: 3000, banner: true },
  'gosh-metareg': { input: '#src', text: () => BCG.map(([l, y, s], i) => `${y}, ${s}, ${ABLAT[i]}, ${l}`).join('\n'), run: '#btn-run', wait: 3000, banner: true },
  'pet-peese': { input: '#src', text: fmtEstFirst, run: '#btn-run', banner: true },
  'tsa': { input: '#f-data', text: fmtLabelFirst, banner: true },
};

// Input each page REFUSES to analyse (fewer studies than it needs; empty where any k is
// analysed). Every control must then refuse too, not open the validator on other studies.
const firstRows = (n, f) => () => f().split('\n').slice(0, n).join('\n');
export const REFUSE = {
  'forest-plot': firstRows(1, fmtLabelFirst), 'cumulative-subgroup': firstRows(1, fmtLabelFirst),
  'funnel-plot': () => '', 'bayesian-ma': () => '', 'tsa': () => '',
  'influence': firstRows(2, fmtEstFirst), 'bayesian-mcmc': firstRows(2, fmtEstFirst), 'copas': firstRows(2, fmtEstFirst),
  'gosh': firstRows(2, fmtEstFirst), 'pet-peese': firstRows(2, fmtEstFirst),
  'gosh-metareg': () => BCG.slice(0, 2).map(([l, y, s], i) => `${y}, ${s}, ${ABLAT[i]}, ${l}`).join('\n'),
};

export const CONTROLS = [
  { name: 'Verify in R', selector: '#btn-verify-in-r' },
  { name: 'Validate (R)', selector: '#btn-validate-webr' },
  { name: 'Continue with -> Verify in R (WebR)', selector: '[data-alm-flow="webr-validator"]' },
];

const STALE = [{ label: 'Earlier A', est: 0.5, se: 0.2 }, { label: 'Earlier B', est: 0.1, se: 0.3 }, { label: 'Earlier C', est: 0.3, se: 0.25 }];

async function readValidator(popup) {
  await popup.waitForLoadState('load');
  await popup.waitForFunction(() => window.__almValidatorFit && document.getElementById('f-data'), null, { timeout: 30000 });
  await popup.waitForTimeout(500);
  return popup.evaluate(() => {
    const rows = document.getElementById('f-data').value.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
      .map((l) => { const p = l.split(/\s*[,\t]\s*/); return [Number(p[p.length - 2]), Number(p[p.length - 1])]; });
    const method = document.getElementById('f-method').value, test = document.getElementById('f-test').value;
    const fit = window.__almValidatorFit(rows.map(([est, se]) => ({ est, se, v: se * se })), method, test);
    const banner = document.getElementById('source-banner');
    return { url: location.href, method, test, rows, fit, banner: banner && !banner.hidden ? banner.textContent : null };
  });
}

// Real WebR in the validator tab: tick the download consent, run, read R's numbers.
async function runWebR(popup) {
  await popup.check('#f-acknowledge');
  await popup.click('#btn-run-webr');
  await popup.waitForFunction(() => /Match|Mismatch|Error/i.test(document.getElementById('status').textContent) &&
    !/loading/i.test(document.getElementById('status').className), null, { timeout: 600000 });
  return popup.evaluate(() => {
    const log = document.getElementById('webr-log').textContent;
    const g = (k) => { const m = log.match(new RegExp(k.replace(/[\^]/g, '\\^') + '=(-?[0-9.eE+-]+)')); return m ? Number(m[1]) : null; };
    return { status: document.getElementById('status').textContent, estimate: g('estimate'), tau2: g('tau^2'),
      ci_lb: g('ci.lb'), ci_ub: g('ci.ub'), version: (log.match(/R: [^\n]*metafor [0-9.-]+/) || [null])[0] };
  });
}

// One record per control present on the page. `stale` pre-seeds the shared bus with
// other studies (a returning user); stale:false is a fresh profile with an empty bus.
// `refuse: true` pastes input the page refuses; every control must then open nothing.
export async function checkAppHandoff(context, baseURL, app, { stale = true, webr = false, refuse = false } = {}) {
  const cfg = APPS[app];
  if (!cfg) throw new Error('unknown app ' + app);
  const page = await context.newPage();
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.goto(new URL(app + '/', baseURL).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.MaStudies && document.querySelector('#btn-verify-in-r'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  // Before EVERY control (not once): "Verify in R" writes the bus, which would otherwise
  // let a later control pass while still reading the bus.
  const resetBus = () => (stale ? page.evaluate((s) => window.MaStudies.write(s), STALE)
    : page.evaluate(() => window.MaStudies.clear && window.MaStudies.clear()));
  await page.fill(cfg.input, refuse ? REFUSE[app]() : cfg.text());
  if (cfg.run) await page.click(cfg.run);
  await page.waitForTimeout(cfg.wait || 800);
  const expect = BCG.map(([, y, s]) => [y, s]);
  const headline = cfg.model && !refuse ? await page.evaluate(cfg.model.headline) : null;
  const out = [];
  let webrDone = false;
  for (const c of CONTROLS) {
    if (!(await page.locator(c.selector).count())) continue;
    const rec = { app, control: c.name, stale, refuse, dialogs: [] };
    await resetBus();
    const n0 = dialogs.length;
    const popupP = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
    await page.locator(c.selector).first().click();
    const popup = await popupP;
    await page.waitForTimeout(200);
    rec.dialogs = dialogs.slice(n0);
    if (refuse) {
      rec.opened = !!popup;
      if (popup) { rec.url = popup.url(); await popup.close(); }
      rec.ok = !popup; // refused input: nothing opened (the alert/toast says why)
      out.push(rec); continue;
    }
    if (!popup) { rec.opened = false; rec.ok = false; out.push(rec); continue; }
    rec.opened = true;
    const v = await readValidator(popup);
    Object.assign(rec, { url: v.url, method: v.method, test: v.test, nRows: v.rows.length, banner: v.banner });
    rec.sameStudies = v.rows.length === expect.length && v.rows.every(([e, s], i) => Math.abs(e - expect[i][0]) < 1e-12 && Math.abs(s - expect[i][1]) < 1e-12);
    if (cfg.model) {
      rec.expected = cfg.model.method + '/' + cfg.model.test;
      rec.sameModel = v.method === cfg.model.method && v.test === cfg.model.test;
      const f = v.fit || {};
      rec.validatorFit = { mu: f.estimate, tau2: f.tau2, lo: f.ci_lb, hi: f.ci_ub };
      rec.page = headline;
      const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
      rec.sameFit = near(f.estimate, headline.mu) && near(f.tau2, headline.tau2) && near(f.ci_lb, headline.lo) && near(f.ci_ub, headline.hi);
      rec.ok = !rec.dialogs.length && rec.sameStudies && rec.sameModel && rec.sameFit;
    } else {
      rec.expected = 'banner';
      rec.sameModel = !!(v.banner && v.banner.includes("NOT " + app + "'s own model"));
      rec.ok = !rec.dialogs.length && rec.sameStudies && rec.sameModel;
    }
    if (webr && !webrDone && rec.ok) {
      webrDone = true;
      rec.webr = await runWebR(popup);
      if (cfg.model) {
        const near6 = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
        rec.webr.matchesPage = near6(rec.webr.estimate, headline.mu) && near6(rec.webr.tau2, headline.tau2) &&
          near6(rec.webr.ci_lb, headline.lo) && near6(rec.webr.ci_ub, headline.hi);
      } else {
        rec.webr.matchesPage = null; // not the app's model: R equals the validator's own browser fit, not the page
      }
      rec.ok = rec.ok && /^Match$/.test(rec.webr.status.trim()) && rec.webr.matchesPage !== false;
    }
    await popup.close();
    out.push(rec);
  }
  await page.close();
  return out;
}
