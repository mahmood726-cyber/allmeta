/* hub/shared/r-export.js - "Download R script" for an app's current analysis (lane A6, wave A).
 *
 * The script is built from the app's existing live-R contract (adapter.live): the code that
 * runs is exactly live.buildScript(live.currentState()) - the script the in-browser
 * "Validate this analysis in R" check already runs - wrapped in local() so it cannot touch the
 * user's workspace. The page's own values (live.appValues) and tolerances (live.compare) are
 * embedded; R re-computes, parses the ALMJSON line with base R only and prints a PASS/FAIL
 * table using the same rule as shared/alm-validate.js compare() (REL = |page-R|/max(1,|R|),
 * ABS = |page-R|, null only matches null). An optional readable part (rExport.readable(state))
 * is idiomatic R for reading along; it is not compared.
 *
 * Package versions are checked with a warning, never stop(). The header records the allmeta
 * build, the app, the UTC time, the package versions the paper was validated with and those of
 * the in-browser webR bundle. bodyOf(script) is the part below the header; its SHA-256 is what
 * the receipts in hub/shared/tests/fixtures/r-export/ pin.
 */
(function (global) {
  'use strict';
  var selfScript = typeof document !== 'undefined' ? document.currentScript : null;
  var manifestUrl = selfScript && selfScript.src ? new URL('../../r-shiny/shinylive/webr/repo/manifest.json', selfScript.src).href : null;
  var HEADER_END = '# ---- end of header ----';

  function rString(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"'; }
  function rNumber(v) {
    if (v === null) return 'NA_real_';
    if (typeof v !== 'number' || !isFinite(v)) throw new Error('Page value is not a finite number or null');
    return String(v);
  }
  function rPackages(pkgs) { return 'c(' + pkgs.map(rString).join(', ') + ')'; }

  async function webRVersions(packages) {
    if (!manifestUrl || typeof fetch !== 'function') return null;
    try {
      var r = await fetch(manifestUrl, { redirect: 'error' });
      if (!r.ok) return null;
      var m = await r.json(), out = {};
      packages.forEach(function (p) { var rec = (m.packages || []).find(function (x) { return x.package === p; }); if (rec) out[p] = rec.version; });
      // The bundle manifest records webR as a plain version string.
      return { webR: typeof m.webR === 'string' ? m.webR : null, packages: out };
    } catch (e) { return null; }
  }

  // Pure: everything except network. Used by build() and by the receipt harness/tests.
  function compose(o) {
    var live = o.live, state = o.state;
    var values = live.appValues(state), compare = live.compare || {};
    if (!Array.isArray(values) || !values.length) throw new Error('The app supplied no values to reproduce');
    var tolerance = compare.tolerance || {}, kinds = compare.kind || {};
    var rows = values.map(function (v) {
      if (typeof v.key !== 'string' || !v.key) throw new Error('Value without a key');
      var tol = tolerance[v.key] !== undefined ? tolerance[v.key] : tolerance.default;
      if (!(typeof tol === 'number' && tol >= 0)) throw new Error('No tolerance for ' + v.key);
      return { key: v.key, value: v.value, tol: tol, kind: kinds[v.key] || 'abs' };
    });
    var script = live.buildScript(state);
    if (typeof script !== 'string' || script.indexOf('ALMJSON:') < 0) throw new Error('The live script does not emit an ALMJSON record');
    var packages = (live.packages || []).slice();
    var paper = live.paperVersions || {};
    var build = o.build || {};
    var h = [
      '# allmeta R reproduction script',
      '# App: ' + o.app,
      '# allmeta: ' + (build.version || 'unknown version') + ' (' + (build.sha || 'unknown commit') + ')',
      '# Generated (UTC): ' + (o.now || new Date()).toISOString(),
      '# Validated in the paper with: ' + (Object.keys(paper).length ? Object.keys(paper).map(function (p) { return p + ' ' + paper[p]; }).join(', ') : 'not stated'),
      '# In-browser webR check uses: ' + (o.webR ? 'webR ' + (o.webR.webR || '?') + '; ' + Object.keys(o.webR.packages).map(function (p) { return p + ' ' + o.webR.packages[p]; }).join(', ') : 'not available here'),
      '# Run in R (for example Rscript this-file.R). Other package versions can differ beyond tolerance;',
      '# the check below then reports FAIL rather than hiding the difference.',
      HEADER_END
    ];
    var b = [];
    b.push('alm_packages <- ' + rPackages(packages));
    b.push('alm_paper <- c(' + Object.keys(paper).map(function (p) { return rString(p) + ' = ' + rString(paper[p]); }).join(', ') + ')');
    b.push('for (alm_p in alm_packages) {');
    b.push('  if (!requireNamespace(alm_p, quietly = TRUE)) warning("Package ", alm_p, " is not installed: install.packages(\\"", alm_p, "\\")", call. = FALSE)');
    b.push('  else if (!is.na(alm_paper[alm_p]) && as.character(packageVersion(alm_p)) != gsub("-", ".", alm_paper[alm_p], fixed = TRUE))');
    b.push('    warning("Package ", alm_p, " ", as.character(packageVersion(alm_p)), " differs from the validated ", alm_paper[alm_p], call. = FALSE)');
    b.push('}');
    if (typeof o.readable === 'string' && o.readable.trim()) {
      b.push('');
      b.push('## ---- Part 1: readable analysis (for reading along; not compared) ----');
      b.push('local({');
      b.push(o.readable.replace(/\s+$/, ''));
      b.push('})');
    }
    b.push('');
    b.push('## ---- ' + (o.readable ? 'Part 2: ' : '') + 'Reproduction check: the validated script, then the page\'s values ----');
    b.push('alm_out <- capture.output(local({');
    b.push(script.replace(/\s+$/, ''));
    b.push('}))');
    b.push('alm_line <- grep("^ALMJSON:", alm_out, value = TRUE)');
    b.push('if (length(alm_line) != 1) stop("The validated script must print exactly one ALMJSON line")');
    // Base-R parser for the flat {"key":number|null,...} record the live scripts emit.
    b.push('alm_parse <- function(s) {');
    b.push('  s <- sub("^ALMJSON:\\\\{", "", s); s <- sub("\\\\}\\\\s*$", "", s)');
    b.push('  m <- regmatches(s, gregexpr("\\"[^\\"]+\\":(null|-?[0-9.eE+-]+)", s))[[1]]');
    b.push('  keys <- sub("^\\"([^\\"]+)\\":.*$", "\\\\1", m); vals <- sub("^\\"[^\\"]+\\":", "", m)');
    b.push('  v <- suppressWarnings(as.numeric(ifelse(vals == "null", NA, vals))); names(v) <- keys; v');
    b.push('}');
    b.push('alm_r <- alm_parse(alm_line)');
    b.push('alm_page <- data.frame(');
    b.push('  key = c(' + rows.map(function (r) { return rString(r.key); }).join(', ') + '),');
    b.push('  page = c(' + rows.map(function (r) { return rNumber(r.value); }).join(', ') + '),');
    b.push('  tol = c(' + rows.map(function (r) { return String(r.tol); }).join(', ') + '),');
    b.push('  kind = c(' + rows.map(function (r) { return rString(r.kind); }).join(', ') + '),');
    b.push('  stringsAsFactors = FALSE)');
    b.push('alm_page$R <- unname(alm_r[alm_page$key])');
    b.push('alm_page$diff <- ifelse(is.na(alm_page$page) & is.na(alm_page$R) & alm_page$key %in% names(alm_r), 0,');
    b.push('  abs(alm_page$page - alm_page$R) / ifelse(alm_page$kind == "rel", pmax(1, abs(alm_page$R)), 1))');
    b.push('alm_page$pass <- !is.na(alm_page$diff) & alm_page$diff <= alm_page$tol');
    b.push('print(alm_page[, c("key", "page", "R", "diff", "tol", "pass")], row.names = FALSE, digits = 10)');
    b.push('cat(sprintf("ALLMETA REPRODUCTION: %s (%d/%d quantities within tolerance)\\n",');
    b.push('  if (all(alm_page$pass)) "PASS" else "FAIL", sum(alm_page$pass), nrow(alm_page)))');
    return h.join('\n') + '\n' + b.join('\n') + '\n';
  }
  function bodyOf(script) {
    var i = script.indexOf(HEADER_END + '\n');
    if (i < 0) throw new Error('Not an allmeta R export');
    return script.slice(i + HEADER_END.length + 1);
  }

  function attach(o) {
    if (!o || !/^[a-z][a-z0-9-]*$/.test(o.app || '')) throw new TypeError('rExport.attach needs an app slug');
    var live = o.live;
    if (!live || typeof live.currentState !== 'function' || typeof live.buildScript !== 'function' || typeof live.appValues !== 'function') throw new TypeError('rExport.attach needs the adapter live contract');
    async function build(now) {
      var state = structuredClone(live.currentState());
      var readable = typeof o.readable === 'function' ? o.readable(state) : null;
      var webR = await webRVersions(live.packages || []);
      return compose({ app: o.app, live: live, state: state, readable: readable, webR: webR, now: now, build: global.AlmBuildInfo || null });
    }
    async function download() {
      var text = await build();
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = 'allmeta-' + o.app + '-reproduce.R';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      return text;
    }
    return { build: build, download: download };
  }

  var api = { attach: attach, compose: compose, bodyOf: bodyOf, HEADER_END: HEADER_END };
  global.alm = global.alm || {};
  global.alm.rExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
