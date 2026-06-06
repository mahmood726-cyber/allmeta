/* scripts/build-parity-ledger.mjs — generate the parity ledger from the actual spec files.
 *
 * Scans hub/shared/tests/<*>parity<*>.spec.mjs and extracts, per spec: the method title,
 * the shared module under test, the R oracle named in the docstring, the number of
 * test() blocks, the number of toBeCloseTo() numeric assertions, and the tightest
 * tolerance asserted (max decimal-places arg). Emits parity/parity-ledger.js as
 *   window.ALM_PARITY_LEDGER = {...}
 * so the dashboard renders only methods that have a committed, R-referenced parity spec —
 * the ledger cannot drift ahead of the evidence. Run: node scripts/build-parity-ledger.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = join(root, 'hub', 'shared', 'tests');
const outDir = join(root, 'parity');

const ORACLE_PATTERNS = [
  /metafor::\w+(?:\.\w+)*/g, /mada::\w+/g, /dosresmeta(?:\([^)]*\))?/g, /robumeta/g,
  /fragility::\w+/g, /metasens::\w+/g, /\bEValue\b/g, /\bRoBMA\b/g, /R\s+integrate\(\)/g,
  /meta::\w+/g, /netmeta::\w+/g, /\bsurvRM2\b/g,
];
// Coarser fallbacks when no pkg::fn is named (bare package, R-evaluated closed form, etc.).
const FALLBACK_PATTERNS = [
  [/\bnetmeta\b/i, 'netmeta'], [/plot\.reitsma|\bmada\b/i, 'mada'], [/\bmetafor\b/i, 'metafor'],
  [/\bgemtc\b/i, 'gemtc'], [/\bdmetar\b/i, 'dmetar'],
  [/R's\s+(?:EXACT\s+)?(qnorm|qt|qchisq|pnorm|integrate)/i, 'R (base stats)'],
  [/closed-form|published .*estimators/i, 'closed-form (R-evaluated)'],
  [/conjugate|deterministic .*posterior/i, 'analytic/conjugate (R-checked)'],
  [/contourLines|Guyot|reconstruct/i, 'R (formula-checked)'],
];

function firstSentence(doc) {
  // grab the descriptive lead, strip the "R-parity for" boilerplate
  const m = doc.match(/R-parity for ([^.]+?)(?:\s+vs\s|\.|\n)/i);
  if (m) return m[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
  const line = doc.split('\n').map(s => s.replace(/^\s*\*\s?/, '').trim()).find(s => s.length > 12);
  return line ? line.replace(/\s*\([^)]*\)\s*$/, '').slice(0, 80) : null;
}

function oraclesIn(doc) {
  const found = new Set();
  for (const re of ORACLE_PATTERNS) { const m = doc.match(re); if (m) m.forEach(s => found.add(s.trim())); }
  if (!found.size) { for (const [re, label] of FALLBACK_PATTERNS) { if (re.test(doc)) { found.add(label); break; } } }
  return [...found];
}

// Stata equivalence: the estimator each method shares with Stata's `meta` suite (or a
// well-known Stata package). Keyed by spec-name regex so one R oracle (e.g. metafor::rma)
// can map to the right Stata command per method. Empty ⇒ no standard Stata equivalent
// (shown as "—"). These document estimator identity, NOT a separately-run Stata check.
const STATA_BY_SPEC = [
  [/ma-core|workbench|correlation-ma/, 'meta summarize / meta esize'],
  [/heterogeneity/, 'meta summarize (I²/τ², Q)'],
  [/trimfill/, 'meta trimfill'],
  [/meta-regression|permtest|^meta-regression-pi/, 'meta regress'],
  [/location-scale/, 'meta regress (no scale submodel in Stata)'],
  [/pubbias|copas|pet-peese|p-curve|selmodel/, 'meta bias / estat'],
  [/diagnostic-plots/, 'meta galbraith / meta labbe'],
  [/cumulative|influence/, 'meta summarize, cumulative / meta'],
  [/dta-bivariate|dta-region|dta-sroc|hsroc/, 'metandi / midas (DTA)'],
  [/dose-response/, 'drmeta (package)'],
  [/\brve\b|robust/, 'robumeta (package)'],
  [/multivariate-ma/, 'mvmeta (package)'],
  [/rmst/, 'meta summarize (RMST diffs)'],
  [/rare-events-glmm/, 'meta esize, exact / metan'],
  [/evalue/, 'evalue (package)'],
  [/tsa/, 'metacumbounds (package)'],
  [/^nma|component-nma|inconsistency|bucher/, 'network / mvmeta (NMA)'],
];
function stataFor(spec) {
  for (const [re, cmd] of STATA_BY_SPEC) if (re.test(spec)) return cmd;
  return null;
}

const files = readdirSync(testsDir).filter(f => /parity/i.test(f) && f.endsWith('.spec.mjs') && f !== 'parity-ledger.spec.mjs').sort();
const rows = [];
let totalAsserts = 0;
for (const f of files) {
  const src = readFileSync(join(testsDir, f), 'utf8');
  const docMatch = src.match(/\/\*\*([\s\S]*?)\*\//);
  const doc = (docMatch ? docMatch[1] : '').replace(/\n\s*\*\s?/g, ' '); // flatten comment prefixes
  const tests = (src.match(/\btest\(/g) || []).length;
  const closeTo = [...src.matchAll(/toBeCloseTo\([^,]+,\s*(\d+)\s*\)/g)].map(m => +m[1]);
  const asserts = closeTo.length;
  const tightest = closeTo.length ? Math.max(...closeTo) : null;
  const moduleM = doc.match(/shared\/([\w-]+\.js)/) || src.match(/shared\/([\w-]+\.js)/);
  totalAsserts += asserts;
  rows.push({
    spec: f,
    kind: 'spec',
    title: firstSentence(doc) || f.replace(/-parity\.spec\.mjs$/, '').replace(/\.spec\.mjs$/, ''),
    module: moduleM ? moduleM[1] : null,
    oracles: oraclesIn(doc),
    stata: stataFor(f),
    tests, asserts, tightestDecimals: tightest,
  });
}

// ----- Per-app Python R-parity tests (<app>/tests/test_against_<pkg>.py) -----
// These run live Rscript against a committed R fixture (helper _r_parity.py),
// skipping if R is absent. They cover methods whose engine is inline in the app
// HTML rather than a shared module, so they don't show up in the Playwright
// ledger above — count them here so the provability dashboard is complete.
const PKG_LABEL = { metafor: 'metafor', netmeta: 'netmeta', mada: 'mada',
  metasens: 'metasens', dosresmeta: 'dosresmeta', robumeta: 'robumeta', r: 'R (base stats)' };
const pyRows = [];
let pyAsserts = 0;
for (const d of readdirSync(root, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name === 'node_modules' || d.name.startsWith('.')) continue;
  const tdir = join(root, d.name, 'tests');
  let entries;
  try { entries = readdirSync(tdir); } catch (_) { continue; }
  for (const fn of entries.sort()) {
    const m = fn.match(/^test_against_([a-z0-9]+)\.py$/i);
    if (!m) continue;
    const src = readFileSync(join(tdir, fn), 'utf8');
    const docM = src.match(/"""([\s\S]*?)"""/);
    const doc = (docM ? docM[1] : '').replace(/\s+/g, ' ').trim();
    const tests = (src.match(/\bdef test_/g) || []).length;
    const asserts = (src.match(/math\.isclose\(|assert_r_parity\(|pytest\.approx\(|assert\s+abs\(/g) || []).length;
    const decs = [...src.matchAll(/1e-(\d+)/g)].map(x => +x[1]);
    const tightest = decs.length ? Math.max(...decs) : null;
    const moduleM = src.match(/shared\/([\w-]+\.js)/);
    const pkg = m[1].toLowerCase();
    const oracles = new Set([PKG_LABEL[pkg] || pkg]);
    oraclesIn(doc).forEach(o => oracles.add(o));  // add pkg::fn detail from the docstring
    const relSpec = d.name + '/tests/' + fn;
    // First sentence of the docstring, minus the "R-parity test:" lead-in.
    const sent = doc.replace(/^R-parity test:?\s*/i, '').split(/\.\s/)[0].trim();
    pyAsserts += asserts;
    pyRows.push({
      spec: relSpec,
      kind: 'py',
      title: (sent && sent.length > 8) ? sent.slice(0, 90) : (d.name + ' vs ' + (PKG_LABEL[pkg] || pkg)),
      module: moduleM ? moduleM[1] : null,
      oracles: [...oracles],
      stata: stataFor(relSpec),
      tests, asserts, tightestDecimals: tightest,
    });
  }
}
const allRows = rows.concat(pyRows);

// ----- Honest coverage: numerical apps NOT (yet) R-parity verified -----
// The ledger lists every VERIFIED method; staying silent about the rest would
// imply 100% coverage. Disclose the numerical apps with no committed R-parity
// test and WHY — overwhelmingly because the method is novel/bespoke and has no
// standard R package to check against (that is the truth, not negligence). This
// list is curated; the drift guard below auto-drops any app that has since
// gained a spec or per-app Python R-parity test.
const UNCOVERED_NUMERICAL = [
  { app: 'everything-model', reason: 'Bespoke variational-EM Bayesian hierarchical model (outcome x time x RoB) — no standard R package equivalent to check against.' },
  { app: 'cross-network', reason: 'Unified NMA + IPD + observational bias-adjustment model — bespoke; no packaged R oracle.' },
  { app: 'cross-design', reason: 'RCT + observational power-prior / Welton design-bias synthesis — closed-form, no packaged R oracle (formula-checked only).' },
  { app: 'sequential-ma', reason: 'Adaptive alpha-spending sequential MA — boundaries verified analytically; the tsa app IS R-parity tested for the shared TSA core.' },
  { app: 'bma-tau-priors', reason: 'Bayesian model-averaging over tau-squared priors (Laplace + Simpson) — core Bayes factors checked vs R integrate(); the full BMA has no packaged oracle.' },
  { app: 'nma-dose-response-app', reason: '40+ research-grade dose-response NMA methods — no established R oracle for the novel estimators.' },
];
const coverageBlob = (
  rows.map(r => `${r.spec} ${r.module || ''}`).join(' ') + ' ' +
  pyRows.map(r => r.spec).join(' ')
).toLowerCase();
const uncovered = UNCOVERED_NUMERICAL.filter(u => {
  const nowCovered = coverageBlob.includes(u.app.toLowerCase());
  if (nowCovered) console.log(`NOTE: '${u.app}' now has parity coverage — dropping from uncovered list.`);
  return !nowCovered;
});

// Repo-root parity tests that verify a method by CROSS-LANGUAGE / structural
// agreement (not the <app>/tests R-oracle mechanism the rows above scan), so the
// dashboard discloses them rather than under-counting what is actually tested.
const CROSS_LANG = [
  { test: 'tests/test_spec_collapse.py', verifies: 'spec-collapse aggregators vs the Spec-Collapse Atlas Python engine (validated vs metafor), to 1e-6' },
  { test: 'tests/test_egger.py', verifies: "reporting-bias Egger regression vs R lm(SND ~ precision), to 1e-3" },
  { test: 'tests/test_review_bundle.py', verifies: 'review-project signed bundle: HMAC sign/verify + tamper-location' },
  { test: 'tests/test_truthcert_export.py', verifies: 'TruthCert export receipts: sign/verify/tamper + stamp idempotency' },
].filter(c => existsSync(join(root, c.test)));

const ledger = {
  generated: new Date().toISOString().slice(0, 10),
  specCount: rows.length,          // Playwright *parity*.spec.mjs
  pyCount: pyRows.length,          // per-app test_against_<pkg>.py
  parityTestCount: allRows.length, // total committed R-parity tests
  assertionCount: totalAsserts,    // Playwright toBeCloseTo assertions
  pyAssertionCount: pyAsserts,     // Python numeric/parity assertions
  oracleCount: new Set(allRows.flatMap(r => r.oracles)).size,
  stataCount: allRows.filter(r => r.stata).length,
  // Honest coverage denominator: methods verified vs numerical methods that are
  // not (with the reason — usually "no standard R oracle for this novel method").
  uncovered: uncovered,
  // Methods verified by cross-language / structural parity at the repo root
  // (not the <app> R-oracle mechanism) — disclosed so coverage isn't under-counted.
  crossLang: CROSS_LANG,
  rows: allRows,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'parity-ledger.js'),
  '/* AUTO-GENERATED by scripts/build-parity-ledger.mjs — do not edit by hand. */\n' +
  'window.ALM_PARITY_LEDGER = ' + JSON.stringify(ledger, null, 2) + ';\n');
console.log(`Wrote parity/parity-ledger.js: ${rows.length} Playwright specs + ${pyRows.length} Python R-parity tests = ${allRows.length} total, ${totalAsserts}+${pyAsserts} assertions, ${ledger.oracleCount} distinct R oracles.`);
const noOracle = allRows.filter(r => !r.oracles.length);
if (noOracle.length) console.log('NOTE: tests with no detected R oracle:', noOracle.map(r => r.spec).join(', '));
