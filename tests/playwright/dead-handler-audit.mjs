// Audit allmeta single-file HTML apps for dead onclick handlers:
// onclick="someFn(...)" where `someFn` is never defined inside the file
// (and isn't a global standard like `window.print`, `alert`, `console.*`,
// or a built-in DOM method).
//
// Run from repo root:  node tests/playwright/dead-handler-audit.mjs > artifacts/dead-handlers.json

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALLMETA_ROOT = resolve(__dirname, "../..");
const OUT_DIR = resolve(__dirname, "artifacts");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Walk one level into ALLMETA_ROOT, skipping noise dirs.
const SKIP_DIRS = new Set([
  "node_modules", ".git", "tests", "test-results", "artifacts", "hub",
  "Submission", "e156-submission", "backup_2026_01_13", "coverage",
]);

// Allowlist of globals that are valid even though they're not defined in the file.
const GLOBALS_OK = new Set([
  "alert", "confirm", "prompt", "print", "open", "close", "history",
  "window", "document", "location", "console", "navigator", "scroll",
  "scrollTo", "scrollBy", "focus", "blur", "moveTo", "resizeTo",
  "Plotly", "jsPDF", "html2canvas", "XLSX", "Chart", "MathJax",
  "this", "event", "true", "false", "null", "undefined",
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
    if (st.isDirectory()) {
      walk(full, depth + 1);
    } else if (e.toLowerCase().endsWith(".html") && !e.toLowerCase().includes(".bak")) {
      HTML_FILES.push(full);
    }
  }
}

walk(ALLMETA_ROOT);

const results = [];

const ONCLICK_RE = /onclick\s*=\s*["']\s*([a-zA-Z_$][\w$]*)\s*\(/g;
const FUNC_DEF_RE = /(?:function\s+|\b(?:const|let|var)\s+)([a-zA-Z_$][\w$]*)\s*[=(]/g;
const WINDOW_FN_RE = /window\.([a-zA-Z_$][\w$]*)\s*=/g;

for (const file of HTML_FILES) {
  let txt;
  try { txt = readFileSync(file, "utf8"); } catch { continue; }
  if (txt.length < 1024) continue;  // skip stub/empty
  if (!txt.includes("onclick")) continue;

  const handlers = new Set();
  let m;
  while ((m = ONCLICK_RE.exec(txt)) !== null) handlers.add(m[1]);
  if (handlers.size === 0) continue;

  const defined = new Set();
  while ((m = FUNC_DEF_RE.exec(txt)) !== null) defined.add(m[1]);
  while ((m = WINDOW_FN_RE.exec(txt)) !== null) defined.add(m[1]);

  const missing = [];
  for (const h of handlers) {
    if (defined.has(h)) continue;
    if (GLOBALS_OK.has(h)) continue;
    missing.push(h);
  }

  if (missing.length > 0) {
    results.push({
      file: file.replace(ALLMETA_ROOT + "\\", "").replace(/\\/g, "/"),
      handler_count: handlers.size,
      defined_count: defined.size,
      missing,
      missing_count: missing.length,
    });
  }
}

results.sort((a, b) => b.missing_count - a.missing_count);
const summary = {
  scanned: HTML_FILES.length,
  files_with_dead_handlers: results.length,
  total_dead_handlers: results.reduce((s, r) => s + r.missing_count, 0),
  results,
};

writeFileSync(resolve(OUT_DIR, "dead-handlers.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  scanned: summary.scanned,
  files_with_dead_handlers: summary.files_with_dead_handlers,
  total_dead_handlers: summary.total_dead_handlers,
  top_5: results.slice(0, 5).map(r => ({ file: r.file, missing_count: r.missing_count, missing: r.missing.slice(0, 8) })),
}, null, 2));
