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
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
    title: firstSentence(doc) || f.replace(/-parity\.spec\.mjs$/, '').replace(/\.spec\.mjs$/, ''),
    module: moduleM ? moduleM[1] : null,
    oracles: oraclesIn(doc),
    stata: stataFor(f),
    tests, asserts, tightestDecimals: tightest,
  });
}

const ledger = {
  generated: new Date().toISOString().slice(0, 10),
  specCount: rows.length,
  assertionCount: totalAsserts,
  oracleCount: new Set(rows.flatMap(r => r.oracles)).size,
  stataCount: rows.filter(r => r.stata).length,
  rows,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'parity-ledger.js'),
  '/* AUTO-GENERATED by scripts/build-parity-ledger.mjs — do not edit by hand. */\n' +
  'window.ALM_PARITY_LEDGER = ' + JSON.stringify(ledger, null, 2) + ';\n');
console.log(`Wrote parity/parity-ledger.js: ${rows.length} specs, ${totalAsserts} numeric assertions, ${ledger.oracleCount} distinct R oracles.`);
const noOracle = rows.filter(r => !r.oracles.length);
if (noOracle.length) console.log('NOTE: specs with no detected R oracle:', noOracle.map(r => r.spec).join(', '));
