/**
 * R-parity for the cumulative-subgroup exported R script (subgroup view) vs metafor::rma (separate PM
 * tau² per subgroup, then metafor::rma(mu_g, vi = se_g², method = "FE") for the between-subgroup Q).
 *
 * The page pools every subgroup with its OWN Paule–Mandel tau² and tests the subgroup means with
 * a fixed-effect Cochran Q (the meta::metagen Q.b.random construction, see
 * cumulative-subgroup-qb.spec.mjs). The exported script must reproduce THAT number when run in R.
 *
 * Fault 1 (codex16 RESULTS.md finding 1; root cause cumulative-subgroup/index.html rScript(),
 * `mods = ~ factor(grp)`): the export fitted the common-tau moderator model
 * rma(yi, sei, mods = ~ factor(grp), method = "PM") and printed its QM — a different estimand.
 * On dat.bcg (log RR, grouped by `alloc`) it reported QM = 1.8471906170847154 while the page and
 * metafor's separate-subgroup construction give Q_bw = 1.9172889684123304.
 *
 * Fault 2 (finding 2; root cause parseStudies `raw.split(/\s*[,\t]\s*\/)` and the hand-rolled R
 * string escaping): quoted CSV fields were split at embedded commas, quote characters leaked into
 * group names, and labels containing a backslash produced an R script that does not parse.
 *
 * References frozen from hub/shared/tests/_cumsub_parity_gen.R (R 4.6.0, metafor 5.2-1). The
 * exported script is executed for real with Rscript (SKIP if R / metafor / jsonlite are absent,
 * as hub/shared/tests/_r_parity.py does). Run with R_LIBS_USER pointing at the metafor library.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { runR } from './_cumsub_rscript.mjs';

const APP = '/cumulative-subgroup/index.html';

// dat.bcg, escalc(measure = "RR"), sei = sqrt(vi), grp = alloc  (17 significant digits)
const BCG = {
  yi: [-0.88931133392020545, -1.5853886572014306, -1.3480731482996933, -1.4415511900213054,
    -0.21754732221129558, -0.78611558581886398, -1.6208982235983918, 0.011952333523840508,
    -0.4694176487381494, -1.3713448034727844, -0.33935882833839059, 0.44591340057137874,
    -0.017313948216879815],
  se: [0.57060035489295069, 0.44111350171825825, 0.64449046957109102, 0.14145681992130169,
    0.2262966463950159, 0.083100050877895126, 0.47224701965424321, 0.062941077984236413,
    0.23755885684025541, 0.27023100046632126, 0.11141011610962319, 0.72972998102048181,
    0.26721650339001574],
  grp: ['random', 'random', 'random', 'random', 'alternate', 'alternate', 'random', 'random',
    'random', 'systematic', 'systematic', 'systematic', 'systematic'],
};
const REF_Q_BW = 1.9172889684123304;      // metafor separate-subgroup PM + FE between-Q
const REF_P_BW = 0.38341225525650496;
const COMMON_TAU_QM = 1.8471906170847154; // what the pre-fix export printed (wrong estimand)

async function ready(page) {
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__almLoad === 'function' && typeof window._almLastCumSub === 'function', undefined, { timeout: 10_000 });
}

async function exportedR(page) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), page.click('#btn-rscript')]);
  return readFileSync(await dl.path(), 'utf8');
}

/** The between-subgroup Q the exported script reports: a printed `Q_bw` entry, else metafor's QM line. */
function reportedQ(stdout) {
  const lines = stdout.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const names = lines[i].trim().split(/\s+/);
    const at = names.indexOf('Q_bw');
    if (at >= 0) return { source: 'Q_bw', Q: Number(lines[i + 1].trim().split(/\s+/)[at]), p: Number(lines[i + 1].trim().split(/\s+/)[names.indexOf('p')]) };
  }
  const qm = stdout.match(/QM\(df = \d+\) = ([0-9.eE+-]+)/);
  return qm ? { source: 'QM', Q: Number(qm[1]) } : { source: 'none', Q: NaN };
}

test('fault 1: exported subgroup R script reproduces the page Q_bw (dat.bcg by alloc)', async ({ page }, testInfo) => {
  await ready(page);
  await page.evaluate((d) => window.__almLoad(d.yi.map((yi, i) => ({ label: 'S' + (i + 1), est: yi, se: d.se[i], group: d.grp[i] }))), BCG);
  await page.selectOption('#f-view', 'subgroup');
  await page.waitForFunction(() => window._almLastCumSub() && window._almLastCumSub().view === 'subgroup');
  const app = await page.evaluate(() => window._almLastCumSub());
  // The page itself already matches metafor (guards that the reference applies to this input).
  expect(app.k).toBe(13);
  expect(app.groups).toBe(3);
  expect(app.Q_bw).toBeCloseTo(REF_Q_BW, 9);
  expect(app.df_bw).toBe(2);

  const script = await exportedR(page);
  const r = runR(script, testInfo.outputPath('cumsub-validate.R'));
  test.skip(!!r.skip, r.skip);
  expect(r.status, 'exported script must run in R:\n' + r.stderr).toBe(0);
  const got = reportedQ(r.stdout);
  expect(got.source, 'exported script must report the between-subgroup Q_bw, not the common-tau moderator QM (' + COMMON_TAU_QM + ')').toBe('Q_bw');
  expect(got.Q, 'R-export Q_bw vs page Q_bw').toBeCloseTo(app.Q_bw, 8);
  expect(got.Q, 'R-export Q_bw vs metafor reference').toBeCloseTo(REF_Q_BW, 8);
  expect(got.p).toBeCloseTo(REF_P_BW, 8);
});

test('fault 2: quoted CSV fields parse intact and survive the R export literally', async ({ page }, testInfo) => {
  await ready(page);
  const text = [
    '"Smith, J",-0.30,0.14,2010,"Low, risk"',
    '"C:\\data\\x1",-0.45,0.12,2012,"Low, risk"',
    '"He said ""hi""",-0.20,0.10,2014,High',
    'Doe,-0.55,0.16,2017,High',
  ].join('\n');
  await page.fill('#f-data', text);
  await page.selectOption('#f-view', 'subgroup');
  await page.waitForFunction(() => window._almLastCumSub() && window._almLastCumSub().view === 'subgroup');
  const app = await page.evaluate(() => window._almLastCumSub());
  expect(app.k, 'four studies parsed').toBe(4);
  expect(app.groups, 'two groups: "Low, risk" and "High"').toBe(2);
  const labels = await page.locator('#svg-host svg text').allTextContents();
  expect(labels).toContain('Low, risk (k=2)');
  expect(labels).toContain('High (k=2)');
  expect(labels.filter(t => t.includes('"')), 'no quote characters leak into group names').toEqual([]);

  const script = await exportedR(page);
  const r = runR(script, testInfo.outputPath('cumsub-validate.R'),
    'cat("\\n", jsonlite::toJSON(list(labels = labels, grp = grp)), "\\n", sep = "")');
  test.skip(!!r.skip, r.skip);
  expect(r.status, 'exported script must parse and run in R:\n' + r.stderr).toBe(0);
  const out = JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
  expect(out.labels).toEqual(['Smith, J', 'C:\\data\\x1', 'He said "hi"', 'Doe']);
  expect(out.grp).toEqual(['Low, risk', 'Low, risk', 'High', 'High']);
});
