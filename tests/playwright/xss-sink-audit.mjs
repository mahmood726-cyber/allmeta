// Audit allmeta HTML files for XSS sinks: innerHTML/outerHTML/document.write
// assignments where the right-hand side contains a variable name (not a
// pure string literal). This is heuristic — ranks by raw count of risky
// assignments per file.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALLMETA_ROOT = resolve(__dirname, "../..");
const OUT_DIR = resolve(__dirname, "artifacts");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const SKIP_DIRS = new Set([
  "node_modules", ".git", "tests", "test-results", "artifacts", "hub",
  "Submission", "e156-submission", "backup_2026_01_13", "coverage", "_archive",
]);

const HTML_FILES = [];
function walk(dir, depth = 0) {
  if (depth > 3) return;
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (e.startsWith(".")) continue;
    if (SKIP_DIRS.has(e)) continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, depth + 1);
    else if (e.toLowerCase().endsWith(".html") && !e.includes(".bak"))
      HTML_FILES.push(full);
  }
}
walk(ALLMETA_ROOT);

// Match: `.innerHTML = X` where X is not just a string literal.
// We count `.innerHTML = '...'` (literal) as benign, anything else as risky.
const SINK_RE = /\.(innerHTML|outerHTML)\s*=\s*([^;\n]{1,200})/g;
const PURE_STRING_RE = /^\s*(['"`])([\s\S]*?)\1\s*$/;
const DOC_WRITE_RE = /document\.write(?:ln)?\s*\(\s*([^)]{1,200})\s*\)/g;

const results = [];

for (const file of HTML_FILES) {
  let txt;
  try { txt = readFileSync(file, "utf8"); } catch { continue; }
  if (txt.length < 1024) continue;

  const samples = [];
  let m;
  let risky = 0;
  while ((m = SINK_RE.exec(txt)) !== null) {
    const rhs = m[2].trim();
    if (PURE_STRING_RE.test(rhs)) continue;
    risky++;
    if (samples.length < 3) {
      // grab a 60-char window for context
      samples.push(`.${m[1]} = ${rhs.slice(0, 60)}`);
    }
  }
  while ((m = DOC_WRITE_RE.exec(txt)) !== null) {
    const arg = m[1].trim();
    if (PURE_STRING_RE.test(arg)) continue;
    risky++;
    if (samples.length < 3) samples.push(`document.write(${arg.slice(0, 60)})`);
  }

  if (risky > 0) {
    results.push({
      file: file.replace(ALLMETA_ROOT + "\\", "").replace(/\\/g, "/"),
      risky_assignments: risky,
      samples,
    });
  }
}

results.sort((a, b) => b.risky_assignments - a.risky_assignments);
const summary = {
  scanned: HTML_FILES.length,
  files_with_risky_sinks: results.length,
  total_risky_sinks: results.reduce((s, r) => s + r.risky_assignments, 0),
  results,
};
writeFileSync(resolve(OUT_DIR, "xss-sinks.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  scanned: summary.scanned,
  files_with_risky_sinks: summary.files_with_risky_sinks,
  total_risky_sinks: summary.total_risky_sinks,
  top_10: results.slice(0, 10).map(r => ({ file: r.file, count: r.risky_assignments, samples: r.samples })),
}, null, 2));
