/* Allmeta validation widget. Network hosts: current origin only. Tier 2 reads
 * same-origin corpus files once, then replays from verified memory offline.
 * file:// users select the manifest-listed corpus files (browser fetch restrictions).
 * External github.com / codespaces.new / doi.org links require a user click.
 * Tier 1 lazily loads the local, pinned shared/webr-runner.js and webR 0.5.5.
 */
(function (global) {
  'use strict';
  const scriptURL = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;
  function localURL(path) {
    const url = new URL(path, document.baseURI);
    if (url.origin !== location.origin || !['http:', 'https:', 'file:'].includes(url.protocol)) throw new Error('Off-origin validation resource refused: ' + path);
    return url;
  }
  async function digest(bytes) {
    if (!global.crypto || !crypto.subtle) throw new Error('SHA-256 requires a secure context (HTTPS or localhost).');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function verify(bytes, expected, path, raw = false) {
    if (!/^[a-f0-9]{64}$/i.test(expected || '')) throw new Error('Missing or invalid SHA-256: ' + path);
    const actual = await digest(bytes);
    if (actual !== expected.toLowerCase()) throw new Error('SHA-256 mismatch; refused: ' + path);
    return raw ? bytes : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  // rawFiles preserves original bytes for adapters that independently recheck pins.
  async function loadFiles(specs, selected, raw) {
    const files = {};
    for (const spec of specs) {
      const url = localURL(spec.path);
      let bytes;
      if (selected) {
        const file = selected.find(f => f.name === spec.path.split('/').pop());
        if (!file) throw new Error('Select the corpus file: ' + spec.path);
        bytes = await file.arrayBuffer();
      } else {
        const response = await fetch(url, { redirect: 'error' });
        if (!response.ok) throw new Error('Cannot read ' + spec.path + ' (HTTP ' + response.status + ')');
        bytes = await response.arrayBuffer();
      }
      files[spec.path] = await verify(bytes, spec.sha256, spec.path, raw);
    }
    return files;
  }
  // Known comparison kinds; anything else fails closed with an explicit reason
  // rather than silently falling through to an absolute-difference test.
  const KINDS = ['abs', 'rel', 'exact'];
  function compare(app, ref, kind, tol) {
    if (!KINDS.includes(kind)) return { diff: Infinity, pass: false, reason: 'Unknown comparison kind: ' + String(kind) };
    if (kind === 'exact') {
      const pass = typeof app === typeof ref && ['string', 'boolean', 'number'].includes(typeof app) && app === ref && (typeof app !== 'number' || Number.isFinite(app));
      return { diff: pass ? 0 : Infinity, pass };
    }
    // null is a declared unavailable quantity; undefined/NaN never passes.
    const diff = app === null && ref === null ? 0 :
      typeof app === 'number' && typeof ref === 'number' && Number.isFinite(app) && Number.isFinite(ref) ?
        Math.abs(app - ref) / (kind === 'rel' ? Math.max(1, Math.abs(ref)) : 1) : Infinity;
    if (typeof tol !== 'number' || !Number.isFinite(tol) || tol < 0) return { diff, pass: false, reason: 'Invalid tolerance: ' + String(tol) };
    return { diff, pass: Number.isFinite(diff) && diff <= tol };
  }
  function node(tag, text, parent) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (parent) parent.append(el);
    return el;
  }
  let runnerPromise;
  function runner() {
    if (global.AlmWebR) return Promise.resolve(global.AlmWebR);
    if (!runnerPromise) runnerPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('webr-runner.js', scriptURL).href;
      s.onload = () => resolve(global.AlmWebR);
      s.onerror = () => { runnerPromise = null; reject(new Error('Local R runner unavailable')); };
      document.head.append(s);
    });
    return runnerPromise;
  }
  // ---- Self-checking R script export -------------------------------------------------
  // The live adapter's own R script (same data, options and package call as the in-browser
  // check) is wrapped so that native R re-runs it and compares every quantity with the value
  // this page computed, using the adapter's tolerances and the same rules as compare() above.
  function rNumber(v) {
    if (v === null || v === undefined) return 'NA_real_';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v !== 'number') throw new Error('Unsupported app quantity type: ' + typeof v);
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf';
    return v.toPrecision(17);
  }
  function rList(entries) {
    return 'list(' + entries.map(([k, v]) => JSON.stringify(String(k)) + '=' + v).join(',\n  ') + ')';
  }
  const R_CHECKER = String.raw`
.alm_lines <- .alm_out[startsWith(.alm_out, "ALMJSON:")]
if (length(.alm_lines) != 1) stop("The R script must emit exactly one ALMJSON record")
cat(.alm_out[!startsWith(.alm_out, "ALMJSON:")], sep = "\n")
.alm_body <- trimws(.alm_lines)
.alm_body <- substr(.alm_body, nchar("ALMJSON:{") + 1, nchar(.alm_body) - 1)
.alm_ref <- list()
for (.p in strsplit(.alm_body, ',"', fixed = TRUE)[[1]]) {
  .pos <- regexpr('":', .p, fixed = TRUE)
  .key <- gsub('"', "", substr(.p, 1, .pos - 1), fixed = TRUE)
  .val <- substr(.p, .pos + 2, nchar(.p))
  .alm_ref[.key] <- list(if (.val == "null") NULL else if (.val %in% c("true", "false")) .val == "true" else
    if (startsWith(.val, '"')) substr(.val, 2, nchar(.val) - 1) else suppressWarnings(as.numeric(.val)))
}
.alm_cmp <- function(a, r, kind, tol) {
  if (!kind %in% c("abs", "rel", "exact")) return(c(Inf, 0))
  if (kind == "exact") return(c(if (identical(a, r)) 0 else Inf, 1))
  if (!is.numeric(tol) || length(tol) != 1 || !is.finite(tol) || tol < 0) return(c(Inf, 0))
  if (is.null(r) && length(a) == 1 && is.na(a)) return(c(0, 1))
  if (is.null(r) || !is.numeric(r) || !is.numeric(a) || !is.finite(a) || !is.finite(r)) return(c(Inf, 0))
  d <- abs(a - r) / (if (kind == "rel") max(1, abs(r)) else 1)
  c(d, as.numeric(d <= tol))
}
.alm_rows <- do.call(rbind, lapply(names(.alm_app), function(k) {
  r <- .alm_ref[[k]]
  res <- if (k %in% names(.alm_ref)) .alm_cmp(.alm_app[[k]], r, .alm_kind[[k]], .alm_tol[[k]]) else c(Inf, 0)
  data.frame(quantity = .alm_label[[k]], app = format(.alm_app[[k]], digits = 12),
             R = if (is.null(r)) "missing" else format(r, digits = 12), difference = signif(res[1], 3),
             tolerance = .alm_tol[[k]], result = if (res[2] == 1 && res[1] <= .alm_tol[[k]]) "PASS" else "FAIL",
             stringsAsFactors = FALSE)
}))
cat("\nBrowser app versus native R:\n")
print(.alm_rows, row.names = FALSE)
.alm_n <- nrow(.alm_rows); .alm_pass <- sum(.alm_rows$result == "PASS")
cat(sprintf("\n%d/%d quantities agree within the stated tolerances.\n", .alm_pass, .alm_n))
cat("R ", R.version.string, "\n", sep = "")
for (.pkg in .alm_packages) cat(.pkg, " ", as.character(utils::packageVersion(.pkg)), "\n", sep = "")
if (.alm_pass != .alm_n) { cat("RESULT: FAIL\n"); if (!interactive()) quit(status = 1) } else cat("RESULT: PASS\n")
`;
  function selfCheckingScript(adapter, app, comparison, script) {
    const a = adapter.live;
    const keys = app.map(v => v.key);
    if (new Set(keys).size !== keys.length) throw new Error('Duplicate app quantity keys');
    const tolOf = k => comparison.tolerance[k] ?? comparison.tolerance.default;
    const kindOf = k => (comparison.kind || {})[k] || 'abs';
    for (const k of keys) {
      const t = tolOf(k);
      if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) throw new Error('Invalid tolerance for ' + k);
      if (!KINDS.includes(kindOf(k))) throw new Error('Unknown comparison kind for ' + k);
    }
    const versions = a.paperVersions || a.validatedVersions || adapter.paper.packageVersions || {};
    const header = [
      '# Self-checking R script exported by allmeta (' + (adapter.app || 'app') + ').',
      '# It re-runs the current analysis in native R with the same data, options and package call that the',
      '# page\'s "Validate this analysis in R" check uses, then compares every quantity with the value the',
      '# browser computed, using the same tolerances. Run: Rscript <this file>  (exit status 1 on any FAIL).',
      '# Exported: ' + new Date().toISOString() + '; allmeta build ' + (global.AlmBuildInfo ? global.AlmBuildInfo.sha : 'unavailable') + '.',
      '# Packages: ' + a.packages.join(', ') + (Object.keys(versions).length ? ' (validated versions: ' + Object.entries(versions).map(([p, v]) => p + ' ' + v).join(', ') + ')' : '') + '.',
      '# Install if needed: install.packages(c(' + a.packages.map(p => JSON.stringify(p)).join(', ') + '))',
      adapter.paper && adapter.paper.repoUrl ? '# Published validation of this app: ' + adapter.paper.repoUrl : null,
      a.scope ? '# Scope: ' + a.scope : null
    ].filter(Boolean).join('\n');
    return header + '\n\n' +
      '.alm_packages <- c(' + a.packages.map(p => JSON.stringify(p)).join(', ') + ')\n' +
      '# Values computed by the browser app (full precision):\n' +
      '.alm_app <- ' + rList(app.map(v => [v.key, rNumber(v.value)])) + '\n' +
      '.alm_label <- ' + rList(app.map(v => [v.key, JSON.stringify(String(v.label || v.key))])) + '\n' +
      '.alm_tol <- ' + rList(keys.map(k => [k, rNumber(tolOf(k))])) + '\n' +
      '.alm_kind <- ' + rList(keys.map(k => [k, JSON.stringify(kindOf(k))])) + '\n\n' +
      '# ---- The analysis in R (identical to the in-browser live check) ----\n' +
      '.alm_out <- capture.output({\n' + script + '\n})\n' +
      '# ---- Comparison with the browser ----' + R_CHECKER;
  }
  function saveText(text, filename) {
    const blob = new Blob([text], { type: 'text/x-r;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click();
    setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 0);
  }

  const mounts = new WeakMap();
  function mount(el, adapter) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) throw new Error('Validation mount missing');
    if (mounts.has(el)) mounts.get(el)();
    el.replaceChildren();
    el.style.cssText = 'margin:1rem 0;padding:1rem;border:1px solid var(--border,#bbb);border-radius:8px;background:var(--panel,#fff);color:var(--ink,#15181d)';
    node('h2', 'Validation checks', el);
    node('p', 'Current-analysis comparison runs reference software on your data. Corpus replay runs the shipped JavaScript on published benchmark inputs against stored reference values; it does not run R or Python or validate your current data.', el);
    const controls = node('div', undefined, el);
    const runtime = adapter.paper.referenceRuntime || 'R';
    let live, rscript;
    if (adapter.live) {
      live = node('button', 'Validate this analysis in R', controls); live.type = 'button';
      if (adapter.live.scriptExport) {   // opt-in per adapter: the exported script is validated per app
        rscript = node('button', 'Download R script (re-run and check in R)', controls); rscript.type = 'button';
        rscript.title = 'A self-contained R script with your data and options; it re-runs the analysis in R and checks every number against this page';
      }
      if (adapter.live.scope) node('p', 'Live R scope: ' + adapter.live.scope, controls);
    } else {
      node('p', 'Live ' + (adapter.paper.referenceRuntime || 'reference-software') + ' comparison is unavailable in this browser.', controls);
      live = node('a', runtime + ' reference and re-execution', controls);
      live.href = adapter.paper.repoUrl; live.style.opacity = '0.75';
    }
    const corpusButton = node('button', 'Replay published corpus (stored references)', controls); corpusButton.type = 'button';
    const status = node('p', 'Ready. Corpus replay uses stored references; no reference software is executed.', el);
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const details = node('div', undefined, el);
    const results = node('div', undefined, el); results.style.overflowX = 'auto';
    const links = node('p', undefined, el);
    for (const [label, url] of [[adapter.paper.runLabel || runtime + ' re-execution instructions / runs (GitHub Actions)', adapter.paper.runUrl], ['Open Codespaces', adapter.paper.codespacesUrl], ['Reproducible repository', adapter.paper.repoUrl], ['Paper DOI', adapter.paper.doi && 'https://doi.org/' + adapter.paper.doi]]) {
      if (!url) continue;
      const a = node('a', label, links); a.href = url; links.append(' · ');
    }
    let selected, cached;
    if (location.protocol === 'file:') {
      const label = node('label', 'Select the corpus files for offline validation: ', el);
      const input = node('input', undefined, label); input.type = 'file'; input.multiple = true; input.accept = adapter.corpus.fileAccept || '.json';
      input.onchange = () => { selected = [...input.files]; cached = null; };
    }
    function table(rows, referenceLabel = 'Live R') {
      results.replaceChildren();
      const t = node('table', undefined, results); t.style.cssText = 'width:100%;text-align:left;border-collapse:collapse';
      const head = node('tr', undefined, node('thead', undefined, t));
      for (const h of ['Quantity', 'App', referenceLabel, 'Difference', 'Tolerance', 'PASS/FAIL']) { const th = node('th', h, head); th.scope = 'col'; }
      const body = node('tbody', undefined, t);
      for (const r of rows) {
        const tr = node('tr', undefined, body);
        const label = r.label || [r.id, r.quantity].filter(Boolean).join(': ');
        for (const v of [label, r.app, r.ref, r.diff, r.tol, r.pass ? 'PASS' : 'FAIL' + (r.reason ? ' (' + r.reason + ')' : '')]) node('td', v && typeof v === 'object' ? JSON.stringify(v) : String(v), tr);
      }
    }
    // currentState may refit/render (and write URL state), so never poll it.
    // The immutable R payload below is paired with a revision of its input controls.
    // Non-DOM adapters may supply a side-effect-free live.revision() value too.
    let revision = 0, activeLive = null, completedLive = false, running = false;
    function fingerprint() {
      return JSON.stringify([
        [...document.querySelectorAll('input,select,textarea')].filter(n => !el.contains(n))
          .map(n => [n.id, n.value, n.checked, n.type === 'file' ? [...n.files].map(f => [f.name, f.size, f.lastModified]) : null]),
        adapter.live && adapter.live.revision ? adapter.live.revision() : null
      ]);
    }
    let lastInputs = fingerprint();
    function stale() {
      details.replaceChildren(); results.replaceChildren();
      status.textContent = activeLive
        ? 'Inputs changed while R was running \u2014 run the check again. Result out of date.'
        : 'Live R result out of date \u2014 run the check again.';
    }
    function changed(force = false) {
      const inputs = fingerprint();
      if (force || inputs !== lastInputs) {
        lastInputs = inputs; revision++;
        if (activeLive || completedLive) {
          if (activeLive) activeLive.stale = true;
          stale(); completedLive = false;
        }
      }
    }
    function onEdit(event) {
      if (!el.contains(event.target)) changed(true);
    }
    function onAction(event) {
      if (!el.contains(event.target) && event.target.closest('button,input[type=submit]')) changed(true);
    }
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    document.addEventListener('click', onAction, true);
    // File/project loaders may assign .value asynchronously without dispatching an event.
    const observer = new MutationObserver(() => changed());
    observer.observe(document.body, {childList:true, subtree:true});
    const timer = setInterval(() => changed(), 100);
    mounts.set(el, () => {
      if (activeLive) activeLive.stale = true;
      observer.disconnect(); clearInterval(timer);
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
      document.removeEventListener('click', onAction, true);
    });
    async function busy(fn) {
      if (running) throw new Error('Validation already running');
      running = true; completedLive = false;
      corpusButton.disabled = true; if (adapter.live) live.disabled = true;
      details.replaceChildren(); results.replaceChildren();
      try { return await fn(); } catch (e) { status.textContent = 'Validation refused: ' + e.message; throw e; }
      finally { running = false; corpusButton.disabled = false; if (adapter.live) live.disabled = false; }
    }
    async function prepare() {
      if (!cached) {
        if (location.protocol === 'file:' && adapter.corpus.loadFiles && !selected) {
          const files = await adapter.corpus.loadFiles();
          for (const f of adapter.corpus.files) await verify(new TextEncoder().encode(files[f.path]), f.sha256, f.path);
          cached = files;
        } else cached = await loadFiles(adapter.corpus.files, selected, adapter.corpus.rawFiles);
      }
      return cached;
    }
    async function runCorpus() {
      return busy(async () => {
        const start = performance.now(); status.textContent = 'Verifying corpus SHA-256 hashes…';
        const files = await prepare();
        const result = await adapter.corpus.run(files, (progress, total) => { status.textContent = typeof progress === 'object' ? progress.message : total ? progress + '/' + total : progress; });
        if (!result || !Array.isArray(result.failed)) throw new Error('Invalid corpus result from adapter');
        // One failed check may carry several diagnostic rows. Render them before
        // validating the accounting, so invalid accounting never hides evidence.
        table(result.failed.map(f => ({ ...f, pass: false })), 'Stored reference');
        const failedChecks = result.failedChecks ?? result.failed.length;
        if (!Number.isInteger(result.checks) || result.checks < 0 || !Number.isInteger(result.passed) || result.passed < 0 ||
          !Number.isInteger(failedChecks) || failedChecks < 0 || result.passed + failedChecks !== result.checks ||
          failedChecks > result.failed.length || (failedChecks === 0 && result.failed.length > 0)) throw new Error('Invalid check accounting from adapter');
        const coverageFails = result.coverageFails || [];
        if (!Array.isArray(coverageFails)) throw new Error('Invalid coverage accounting from adapter');
        const expected = adapter.corpus.mode === 'quick' ? adapter.corpus.quickChecks : adapter.paper.checks;
        const countOK = result.checks === expected;
        status.textContent = result.passed + '/' + result.checks + ' passed; ' + failedChecks + ' failed checks. Paper: ' + adapter.paper.checks + ' checks.' + (adapter.corpus.mode === 'quick' ? ' Quick subset: ' + expected + ' checks; not full paper reproduction.' : '') + (countOK ? '' : ' FAIL: check count differs from selected scope.') + (coverageFails.length ? ' FAIL: corpus coverage differs from the published contract.' : '') + (result.displayFails && result.displayFails.length ? ' FAIL: rendered-number audit has failures.' : '') + ' JavaScript replay against stored references; ' + runtime + ' not executed.';
        node('p', 'Allmeta build stamp ' + (global.AlmBuildInfo ? global.AlmBuildInfo.sha : 'unavailable') + ' (generated metadata); elapsed ' + ((performance.now() - start) / 1000).toFixed(2) + ' s', details);
        if (adapter.paper.referenceLabel) node('p', 'Stored reference: ' + adapter.paper.referenceLabel, details);
        for (const f of adapter.corpus.files) node('p', 'SHA-256 verified: ' + f.path + ' ' + f.sha256, details);
        for (const line of result.summaryLines || []) node('p', line, details);
        node('pre', 'Maxima: ' + JSON.stringify(result.maxima) + '\nRefusals: ' + JSON.stringify(result.refusals), details);
        const rows = [...result.failed, ...coverageFails].map(f => ({ ...f, pass: false }));
        if (!countOK) rows.push({ label: 'Selected corpus scope: check count', app: result.checks, ref: expected, diff: Math.abs(result.checks - expected), tol: 0, pass: false });
        if (result.displayFails && result.displayFails.length) rows.push(...result.displayFails.map(f => ({ label: 'Rendered-number audit', app: f, ref: 'Within display rounding tolerance', diff: null, tol: null, pass: false })));
        table(rows.length ? rows : [{ label: 'Published corpus checks', app: result.passed, ref: expected, diff: 0, tol: 0, pass: true }], 'Stored reference');
        return result;
      });
    }
    async function runLive() {
      return busy(async () => {
        const a = adapter.live;
        if (!a) throw new Error('Live R validation unavailable for this adapter');
        const state = structuredClone(a.currentState());
        const app = a.appValues(state), comparison = structuredClone(a.compare);
        changed();
        const check = activeLive = {revision, stale:false};
        status.textContent = 'Preparing current-analysis R check...';
        try {
          await runner();
          const script = a.buildScript(state);
          if (!app.length) throw new Error('Adapter supplied no current-analysis quantities');
          const r = await (await runner()).runR({ script, packages: a.packages, onStatus: s => { changed(); if (!check.stale) status.textContent = s; } });
          changed();
          if (check.stale || revision !== check.revision) { stale(); return {stale:true, rows:[]}; }
          if (!r.ok) throw new Error(r.error);
          const lines = r.stdout.split(/\r?\n/).filter(s => s.startsWith('ALMJSON:'));
          if (lines.length !== 1) throw new Error('R must emit exactly one ALMJSON record');
          const ref = JSON.parse(lines[0].slice(8));
          const rows = app.map(v => {
            const tol = comparison.tolerance[v.key] ?? comparison.tolerance.default;
            const kind = (comparison.kind || {})[v.key] || 'abs';
            return { label: v.label, app: v.value, ref: ref[v.key], tol, ...compare(v.value, ref[v.key], kind, tol) };
          });
          for (const [pkg, version] of Object.entries(r.versions)) node('p', pkg + ' ' + version, details);
          for (const [pkg, version] of Object.entries(a.paperVersions || a.validatedVersions || adapter.paper.packageVersions || {})) if (r.versions[pkg] !== version) node('p', 'Validated version in the paper: ' + pkg + ' ' + version + '. Any differences beyond tolerance are reported as FAIL.', details);
          if (state.note) node('p', state.note, details);
          table(rows); status.textContent = rows.filter(r => r.pass).length + '/' + rows.length + ' live R quantities passed.' + (rows.some(r => !r.pass) ? ' FAIL: discrepancies exceed tolerance or quantities are unavailable.' : '');
          completedLive = true;
          return { rows, versions: r.versions };
        } catch (error) {
          changed();
          if (check.stale) { stale(); return {stale:true, rows:[]}; }
          throw error;
        } finally { activeLive = null; }
      });
    }
    async function exportScript() {
      const a = adapter.live;
      if (!a) throw new Error('R script export unavailable for this adapter');
      try {
        await runner();   // some adapters build their script with AlmWebR helpers (webR itself is not started)
        const state = structuredClone(a.currentState());
        const app = a.appValues(state);
        if (!app.length) throw new Error('Adapter supplied no current-analysis quantities');
        const comparison = structuredClone(a.compare);   // after currentState(): some adapters set tolerances there
        const text = selfCheckingScript(adapter, app, comparison, a.buildScript(state));
        const filename = (adapter.app || 'allmeta') + '-check.R';
        saveText(text, filename);
        status.textContent = 'Downloaded ' + filename + ': it re-runs this analysis in R and checks ' + app.length + ' quantities against this page.';
        return text;
      } catch (e) { status.textContent = 'R script export refused: ' + e.message; throw e; }
    }
    corpusButton.onclick = () => runCorpus().catch(() => {});
    if (adapter.live) live.onclick = () => runLive().catch(() => {});
    if (rscript) rscript.onclick = () => exportScript().catch(() => {});
    return { prepare, runCorpus, runLive, exportScript };
  }
  global.AlmValidate = { mount, digest, verify, loadFiles, compare, selfCheckingScript };
})(typeof window !== 'undefined' ? window : globalThis);
