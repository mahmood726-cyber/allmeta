#!/usr/bin/env node
// F4 export: turn every app's in-page live R adapter into self-contained R check scripts for the
// cross-platform matrix (.github/workflows/xplat-verify.yml).
//
// For each app (discovered by globbing */alm-features.js, plus every app whose validate/*.js mounts a
// live AlmValidate adapter), open /<app>/ in Chromium, load the built-in example exactly as the app's
// features spec does (the page's own default example; or spec.verify.example() when the app defines one),
// then in-page: state = live.currentState(); script = live.buildScript(state); values = live.appValues(state);
// tolerance/kind = live.compare (read AFTER currentState, which may retune them). Writes to --out:
//   check-<app>.R          adapter script + embedded app values; prints one row per quantity and
//                          "ALMCHECK <app> <passed>/<N>", exits 1 on any miss (same rules as AlmValidate.compare)
//   plots-<app>.R          adapter script + each verify plot saved as xplat-plots/<app>-<plot>.png
//   PLANTED-check-<app>.R  first exported app only: one embedded app value perturbed by 1e-3 relative
//   manifest.json          app, paper, N, packages, sha256 of each script; skipped apps with the reason
//
// Usage: node scripts/xplat/export-checks.mjs [--out xplat-out] [--port 8110] [--apps a,b] [--base-url URL]
// Exit status 1 if any registered (alm-features.js) or required app fails to export.
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REQUIRED = ['proportion-ma', 'correlation-ma', 'dta-sroc', 'heterogeneity', 'mh-peto'];
const PLANT_REL = 1e-3;
// Paper numbers (DESIGN.md "Apps"); a registered spec's own `paper` wins.
const PAPERS = { 'dose-response-ma': 2, 'dta-sroc': 3, nma: 4, heterogeneity: 5, 'pubbias-tests': 6, 'multilevel-ma': 7,
  'meta-regression': 8, 'proportion-ma': 9, 'mh-peto': 10, influence: 11, 'limit-ma': 12, gosh: 13, 'cumulative-subgroup': 14,
  'rve-meta': 15, 'nma-inconsistency': 16, 'correlation-ma': 17, 'multivariate-ma': 18, 'component-nma': 19 };

function args(argv) {
  const o = { out: 'xplat-out', port: Number(process.env.XPLAT_PORT || 8110), apps: null, baseUrl: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--out') { o.out = v; i++; }
    else if (k === '--port') { o.port = Number(v); i++; }
    else if (k === '--apps') { o.apps = v.split(',').filter(Boolean); i++; }
    else if (k === '--base-url') { o.baseUrl = v.replace(/\/$/, ''); i++; }
    else throw new Error('unknown argument ' + k);
  }
  return o;
}

// ---- discovery -------------------------------------------------------------------------------------
function discover() {
  const dirs = readdirSync(ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'shared' && d.name !== 'node_modules')
    .map(d => d.name).sort();
  const registered = dirs.filter(d => existsSync(join(ROOT, d, 'alm-features.js')));
  const withLive = dirs.filter(d => {
    const v = join(ROOT, d, 'validate');
    if (!existsSync(v)) return false;
    const src = readdirSync(v).filter(f => f.endsWith('.js')).map(f => readFileSync(join(v, f), 'utf8')).join('\n');
    return /AlmValidate\.mount\(|AlmLiveAdapters/.test(src) && /\blive\s*[:=]\s*(?!null\b)/.test(src);
  });
  return { registered, candidates: [...new Set([...registered, ...withLive])].sort() };
}

// ---- R literal helpers -----------------------------------------------------------------------------
const rStr = s => JSON.stringify(String(s));   // JSON string escapes are valid R string syntax
function rValue(v) {
  if (v === null) return 'NULL';
  if (v === undefined) return 'alm_missing';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return rStr(v);
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf';
    return Number.isInteger(v) && Math.abs(v) < 1e15 ? v.toFixed(1) : v.toPrecision(17);
  }
  return 'alm_missing';   // objects/arrays are not comparable quantities; they fail like undefined
}
function rTol(t) { return typeof t === 'number' && Number.isFinite(t) ? t.toPrecision(17) : (t === undefined || t === null ? 'NA_real_' : rValue(t)); }
function rComment(s) { return String(s).replace(/[\r\n]+/g, ' '); }

// Mirrors AlmValidate.compare (shared/alm-validate.js) exactly.
const R_COMPARE = String.raw`
# ---- comparison rules: identical to AlmValidate.compare() in shared/alm-validate.js ----------------
#   kind "abs":   |app - R|                 <= tol
#   kind "rel":   |app - R| / max(1, |R|)   <= tol
#   kind "exact": same type and identical value (numbers must be finite)
#   null == null passes (a declared unavailable quantity); NaN / missing / non-finite never pass;
#   an unknown kind or an invalid tolerance fails closed.
alm_missing <- structure(list(), class = "alm_missing")
alm_type <- function(x) {
  if (is.null(x) || inherits(x, "alm_missing") || length(x) != 1L) return("other")
  if (is.logical(x)) return(if (is.na(x)) "other" else "boolean")
  if (is.numeric(x)) return("number")
  if (is.character(x)) return(if (is.na(x)) "other" else "string")
  "other"
}
alm_compare <- function(app, ref, kind, tol) {
  if (!(kind %in% c("abs", "rel", "exact"))) return(list(diff = Inf, pass = FALSE, reason = paste("Unknown comparison kind:", kind)))
  ta <- alm_type(app); tr <- alm_type(ref)
  if (kind == "exact") {
    pass <- ta == tr && ta %in% c("string", "boolean", "number") && isTRUE(app == ref) && (ta != "number" || is.finite(app))
    return(list(diff = if (pass) 0 else Inf, pass = pass, reason = NULL))
  }
  diff <- if (is.null(app) && is.null(ref)) 0 else
    if (ta == "number" && tr == "number" && is.finite(app) && is.finite(ref))
      abs(app - ref) / (if (kind == "rel") max(1, abs(ref)) else 1) else Inf
  if (!is.numeric(tol) || length(tol) != 1L || !is.finite(tol) || tol < 0)
    return(list(diff = diff, pass = FALSE, reason = paste("Invalid tolerance:", format(tol))))
  list(diff = diff, pass = is.finite(diff) && diff <= tol, reason = NULL)
}
alm_fmt <- function(x) {
  if (is.null(x)) return("null")
  if (inherits(x, "alm_missing")) return("missing")
  if (is.numeric(x)) return(format(x, digits = 17))
  as.character(x)
}
`;

const R_RUN = String.raw`
# ---- run the adapter script (exactly what the browser runs in webR) and keep its console output ----
alm_error <- NULL
alm_out <- tryCatch(utils::capture.output({
__SCRIPT__
}), error = function(e) { alm_error <<- conditionMessage(e); character(0) })
writeLines(alm_out)
if (!is.null(alm_error)) cat("R ERROR in adapter script:", alm_error, "\n")
`;

function header(app, rec, what) {
  return [
    `# allmeta ${app} (paper ${rec.paper ?? 'n/a'}) -- ${what}`,
    `# Generated by scripts/xplat/export-checks.mjs from the app's in-page live R adapter on its built-in example.`,
    `# Source commit: ${rec.commit}. Run: Rscript ${what === 'cross-platform check' ? 'check' : 'plots'}-${app}.R`,
    `# Self-contained: needs only the R packages below (pinned in .github/r/renv.lock).`,
    `options(warn = 1)`,
    ...rec.packages.concat(what === 'cross-platform check' ? ['jsonlite'] : []).filter((p, i, a) => a.indexOf(p) === i)
      .map(p => `suppressPackageStartupMessages(library(${p}))`),
    '',
  ].join('\n');
}

function checkScript(app, rec, values) {
  const rows = values.map(v => `  list(key = ${rStr(v.key)}, label = ${rStr(v.label)}, app = ${rValue(v.value)}, kind = ${rStr(v.kind)}, tol = ${rTol(v.tol)})`);
  return header(app, rec, 'cross-platform check') + R_COMPARE + R_RUN.replace('__SCRIPT__', () => rec.script) + String.raw`
# ---- the app's own values for the same state (embedded at export time; ${values.length} quantities) ----
alm_app <- list(
${rows.join(',\n')}
)

# ---- parse the single ALMJSON record the adapter printed ---------------------------------------
alm_json <- grep("^ALMJSON:", alm_out, value = TRUE)
alm_ref <- if (length(alm_json) == 1L) jsonlite::fromJSON(sub("^ALMJSON:", "", alm_json), simplifyVector = FALSE) else {
  cat(sprintf("R must emit exactly one ALMJSON record (got %d)\n", length(alm_json))); list()
}

# ---- compare, one row per quantity -------------------------------------------------------------
alm_passed <- 0L
cat(sprintf("%-28s %-24s %-24s %-10s %-9s %-5s %s\n", "quantity", "app", "R", "diff", "tol", "kind", "result"))
for (q in alm_app) {
  ref <- if (q$key %in% names(alm_ref)) alm_ref[[q$key]] else alm_missing
  r <- alm_compare(q$app, ref, q$kind, q$tol)
  if (isTRUE(r$pass)) alm_passed <- alm_passed + 1L
  cat(sprintf("%-28s %-24s %-24s %-10s %-9s %-5s %s\n", q$label, alm_fmt(q$app), alm_fmt(ref), format(signif(r$diff, 3)),
    format(q$tol), q$kind, if (isTRUE(r$pass)) "PASS" else paste0("FAIL", if (!is.null(r$reason)) paste0(" (", r$reason, ")") else "")))
}
cat(sprintf("ALMCHECK %s %d/%d\n", ${rStr(app)}, alm_passed, length(alm_app)))
quit(save = "no", status = if (alm_passed == length(alm_app) && length(alm_app) > 0L) 0L else 1L)
`;
}

function plotsScript(app, rec) {
  const plots = rec.plots.map(p => String.raw`
# Plot: ${rComment(p.title || p.id)}
alm_png(file.path(alm_dir, ${rStr(app + '-' + p.id + '.png')}), ${p.width_in || 8}, ${p.height_in || 6})
tryCatch({
${p.code}
}, finally = grDevices::dev.off())
cat("PLOT", ${rStr(app + '-' + p.id + '.png')}, "\n")`);
  return header(app, rec, 'verify plots') + R_RUN.replace('__SCRIPT__', () => rec.script).replace('error = function(e) { alm_error <<- conditionMessage(e); character(0) }', 'error = function(e) stop("adapter script failed: ", conditionMessage(e))') + String.raw`
# ---- verify plots (shared/alm-verify-r.js plot code, objects documented as: ${rComment(rec.rObjects || 'n/a')}) ----
alm_dir <- Sys.getenv("XPLAT_PLOTS_DIR", "xplat-plots")
dir.create(alm_dir, showWarnings = FALSE, recursive = TRUE)
alm_png <- function(path, w, h) {
  if (requireNamespace("ragg", quietly = TRUE)) ragg::agg_png(path, width = w, height = h, units = "in", res = 150)
  else grDevices::png(path, width = w, height = h, units = "in", res = 150)
}
${plots.length ? plots.join('\n') : 'cat("No verify plots registered for this app (no verify.plots in its alm-features.js).\\n")'}
cat(sprintf("ALMPLOTS %s %d\n", ${rStr(app)}, ${plots.length}L))
`;
}

// ---- in-page extraction ----------------------------------------------------------------------------
async function extract(page, app) {
  return page.evaluate(async (app) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const spec = window.AlmFeatures && typeof AlmFeatures.get === 'function' ? AlmFeatures.get(app) : null;
    const pick = a => !a ? null : a.live && typeof a.live.currentState === 'function' ? a.live : (typeof a.currentState === 'function' ? a : null);
    let live = null, source = null, paper = spec && spec.paper != null ? spec.paper : null;
    for (let i = 0; i < 300 && !live; i++) {        // adapters register on mount; give the page up to 30 s
      if (spec && spec.verify && typeof spec.verify.adapter === 'function') { live = pick(spec.verify.adapter()); source = 'AlmFeatures.verify.adapter'; }
      if (!live && window.AlmValidate && AlmValidate.adapters) { live = pick(AlmValidate.adapters[app]); source = 'AlmValidate.adapters'; }
      if (!live && window.AlmLiveAdapters) { live = pick(window.AlmLiveAdapters[app]); source = 'AlmLiveAdapters'; }
      if (!live) await sleep(100);
    }
    if (!live) return { skip: 'no live R adapter reachable in-page (AlmValidate.adapters / AlmLiveAdapters)' };
    if (spec && spec.verify && typeof spec.verify.example === 'function') await spec.verify.example();
    // The built-in example renders on load; retry until the adapter can read a complete state.
    let state, lastErr = null;
    for (let i = 0; i < 300; i++) {
      try { state = structuredClone(live.currentState()); if (live.appValues(state).length) break; } catch (e) { lastErr = e; }
      state = undefined; await sleep(100);
    }
    if (!state) return { error: 'currentState() never succeeded on the built-in example: ' + (lastErr ? lastErr.message : 'no quantities') };
    // AlmValidate's runLive loads the (lazy-booting) runner before buildScript; some adapters use its script builders.
    if (!window.AlmWebR) await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = new URL('../shared/webr-runner.js', location.href).href;
      s.onload = res; s.onerror = () => rej(new Error('shared/webr-runner.js failed to load'));
      document.head.append(s);
    });
    const script = live.buildScript(state);
    const cmp = live.compare || {};
    const tolerance = cmp.tolerance || {}, kinds = cmp.kind || {};
    const values = live.appValues(state).map(v => ({
      key: v.key, label: v.label || v.key,
      value: v.value === undefined ? { __undefined: true } : v.value,
      tol: tolerance[v.key] ?? tolerance.default, kind: kinds[v.key] || 'abs',
    }));
    const plots = (spec && spec.verify && Array.isArray(spec.verify.plots) ? spec.verify.plots : []).map(p => ({
      id: p.id, title: p.title, width_in: p.width_in, height_in: p.height_in, code: typeof p.r === 'function' ? p.r(state) : p.r,
    }));
    return { source, registered: !!spec, paper, packages: [...(live.packages || [])], script, values, plots,
      rObjects: spec && spec.verify ? spec.verify.rObjects : null };
  }, app);
}

// ---- server ----------------------------------------------------------------------------------------
async function startServer(port) {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const proc = spawn(py, ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/`); if (r.ok || r.status === 404) return proc; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  proc.kill(); throw new Error('http.server did not start on port ' + port);
}

function gitCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return process.env.GITHUB_SHA || 'unknown'; }
}

const sha256 = s => createHash('sha256').update(s).digest('hex');

async function main() {
  const o = args(process.argv.slice(2));
  const { registered, candidates } = discover();
  const apps = o.apps || candidates;
  const out = resolve(o.out);
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) rmSync(join(out, f), { recursive: true, force: true });

  const require = createRequire(join(ROOT, 'hub', 'shared', 'tests', 'package.json'));
  const { chromium } = require('@playwright/test');
  const server = o.baseUrl ? null : await startServer(o.port);
  const base = o.baseUrl || `http://127.0.0.1:${o.port}`;
  const browser = await chromium.launch();
  const commit = gitCommit();
  const manifest = { generated: new Date().toISOString(), commit, planted: null, apps: [], skipped: [], failed: [] };
  let planted = false, hardFail = false;
  try {
    for (const app of apps) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(e.message));
      let res;
      try {
        await page.goto(`${base}/${app}/`, { waitUntil: 'load', timeout: 60_000 });
        res = await extract(page, app);
      } catch (e) {
        res = { error: e.message.split('\n')[0] };
      }
      await page.close();
      const must = registered.includes(app) || REQUIRED.includes(app) || !!o.apps;
      if (res.skip && !must) {
        console.log(`SKIP ${app}: ${res.skip}`);
        manifest.skipped.push({ app, reason: res.skip });
        continue;
      }
      if (res.skip || res.error) {
        const reason = res.skip || res.error;
        console.log(`FAIL ${app}: ${reason}${pageErrors.length ? ' [page errors: ' + pageErrors.slice(0, 3).join(' | ') + ']' : ''}`);
        manifest.failed.push({ app, reason, pageErrors: pageErrors.slice(0, 5) });
        if (must) hardFail = true;
        continue;
      }
      const values = res.values.map(v => ({ ...v, value: v.value && v.value.__undefined ? undefined : v.value }));
      const rec = { ...res, paper: res.paper ?? PAPERS[app] ?? null, commit };
      const files = {};
      const write = (name, text) => { writeFileSync(join(out, name), text); files[name] = sha256(text); };
      write(`check-${app}.R`, checkScript(app, rec, values));
      write(`plots-${app}.R`, plotsScript(app, rec));
      if (!planted) {
        // Perturb the first numeric, non-exact quantity whose 1e-3 relative change clearly exceeds its tolerance.
        const i = values.findIndex(v => typeof v.value === 'number' && Number.isFinite(v.value) && v.value !== 0 && v.kind !== 'exact' &&
          typeof v.tol === 'number' && Math.abs(v.value) * PLANT_REL / (v.kind === 'rel' ? Math.max(1, Math.abs(v.value)) : 1) > 10 * v.tol);
        if (i >= 0) {
          const bad = values.map((v, j) => j === i ? { ...v, value: v.value * (1 + PLANT_REL) } : v);
          write(`PLANTED-check-${app}.R`, '# PLANTED DEFECT: ' + values[i].key + ' perturbed by ' + PLANT_REL + ' relative; this check MUST fail.\n' + checkScript(app, rec, bad));
          manifest.planted = { app, key: values[i].key, original: values[i].value, perturbed: bad[i].value, relative: PLANT_REL, file: `PLANTED-check-${app}.R` };
          planted = true;
        }
      }
      manifest.apps.push({ app, paper: rec.paper, N: values.length, packages: res.packages, adapterSource: res.source,
        registered: res.registered, plots: res.plots.map(p => p.id), sha256: files });
      console.log(`EXPORT ${app}: N=${values.length} packages=${res.packages.join(',')} plots=${res.plots.length} via ${res.source}`);
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  if (!planted) { console.log('FAIL planted: no exported quantity could be perturbed detectably'); hardFail = true; }
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`XPLAT EXPORT ${manifest.apps.length} exported, ${manifest.skipped.length} skipped, ${manifest.failed.length} failed`);
  if (hardFail) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
