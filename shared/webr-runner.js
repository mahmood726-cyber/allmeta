/* shared/webr-runner.js — boot WebR in-page, run R from bus state.
 *
 * One shared helper any allmeta numerical app can use to verify its own
 * computation against live R / metafor without leaving the page.
 *
 *   AlmWebR.runMetafor({
 *     studies: [{ label, est, se, … }],
 *     method: "PM" | "REML" | "DL",
 *     test:   "knha" | "z",
 *     onStatus: (text) => {…},
 *   })
 *     → Promise<{
 *         ok: true,
 *         result: { mu, se, ci_lb, ci_ub, tau2, QE, I2, k },
 *         rOutput: "<verbatim console output>",
 *       }>
 *     or { ok: false, error: "…" }
 *
 * Boot is lazy (~30 MB R + metafor) and cached across invocations. After
 * the first run, subsequent fits cost ~150 ms.
 *
 * Uses the same self-hosted r-shiny/shinylive/webr/ bundle that
 * webr-studio uses, so it works offline once the SW has cached it.
 */
(function (global) {
  "use strict";

  // Same-origin only; resolve relative to this script (also works below /allmeta/).
  var _scriptURL = typeof document !== "undefined" && document.currentScript ? document.currentScript.src : null;
  var _bootPromise = null, _webR = null, _manifest = null;
  var _packagesInstalled = new Set();
  var _queue = Promise.resolve();
  function _resolveBaseUrl() {
    if (!_scriptURL) return [];
    return [new URL('../r-shiny/shinylive/webr/', _scriptURL).href];
  }
  async function _get(url) {
    if (new URL(url).origin !== location.origin) throw new Error('Off-origin R resource refused');
    var r = await fetch(url, { redirect: 'error' });
    if (!r.ok) throw new Error('R resource unavailable: ' + url + ' (HTTP ' + r.status + ')');
    return r;
  }
  async function _ensureWebR(onStatus) {
    if (_webR) return _webR;
    if (!_bootPromise) _bootPromise = (async function () {
      var base = _resolveBaseUrl()[0];
      if (!base) throw new Error('A browser with a same-origin webR bundle is required');
      onStatus('Booting local webR 0.5.5...');
      var mod = await import(/* @vite-ignore */ base + 'webr.mjs');
      var w = new mod.WebR({ interactive: false, baseUrl: base, repoUrl: base + 'repo/', channelType: mod.ChannelType.PostMessage });
      await w.init();
      if (w.version !== '0.5.5') throw new Error('Unexpected webR version: ' + w.version);
      _webR = w;
      return w;
    })().catch(function (e) { _bootPromise = null; throw e; });
    return _bootPromise;
  }
  async function _ensurePackages(packages, onStatus) {
    var base = _resolveBaseUrl()[0];
    if (!base) throw new Error('Local webR bundle unavailable');
    if (!_manifest) _manifest = await (await _get(base + 'repo/manifest.json')).json();
    var records = new Map(_manifest.packages.map(function (p) { return [p.package, p]; }));
    var required = new Map();
    function visit(name) {
      if (_packagesInstalled.has(name) || required.has(name)) return;
      var p = records.get(name);
      if (!p) throw new Error('Package not in pinned repository: ' + name);
      required.set(name, p);
      (p.dependencies || []).forEach(function (dep) { if (records.has(dep)) visit(dep); });
    }
    packages.forEach(visit);
    // Verify bytes BEFORE exposing any archive to R. Never verify then refetch:
    // the exact verified bytes are staged in the VFS, avoiding a TOCTOU gap.
    var archives = [];
    for (var p of required.values()) {
      if (!/^[A-Za-z][A-Za-z0-9.]*$/.test(p.package) || !/^[A-Za-z0-9_.+-]+\.tgz$/.test(p.file)) throw new Error('Invalid package manifest entry');
      onStatus('Verifying SHA-256: ' + p.file);
      var archivePath = p.path || ('repo/' + _manifest.layout + p.file);
      if (p.path && p.path !== 'packages/' + p.package + '/' + p.file) throw new Error('Invalid package archive path');
      var bytes = new Uint8Array(await (await _get(new URL(archivePath, base).href)).arrayBuffer());
      if (!global.crypto || !crypto.subtle) throw new Error('SHA-256 requires HTTPS or localhost');
      var hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      if (hash !== p.sha256 || bytes.length !== p.bytes) throw new Error('SHA-256/size mismatch; package refused: ' + p.file);
      archives.push({ record: p, bytes: bytes });
    }
    var webR = await _ensureWebR(onStatus);
    await webR.evalRVoid('dir.create("/tmp/alm-library", showWarnings=FALSE); .libPaths(c("/tmp/alm-library", .libPaths()))');
    // These are built binary tarballs: extract, do not compile or invoke a remote
    // dependency resolver. All dependency archives above are pinned and verified.
    for (var archive of archives) {
      var path = '/tmp/' + archive.record.file;
      await webR.FS.writeFile(path, archive.bytes);
      await webR.evalRVoid('utils::untar(' + JSON.stringify(path) + ', exdir="/tmp/alm-library", tar="internal"); unlink(' + JSON.stringify(path) + ')');
      var version = await webR.evalRString('as.character(packageVersion(' + JSON.stringify(archive.record.package) + '))');
      if (version.replace(/-/g, '.') !== archive.record.version.replace(/-/g, '.')) throw new Error('Installed version mismatch: ' + archive.record.package);
      _packagesInstalled.add(archive.record.package);
    }
    return webR;
  }
  function runR(opts) {
    opts = opts || {};
    var task = async function () {
      var shelter;
      try {
        var packages = opts.packages || [], status = opts.onStatus || function () {};
        if (typeof opts.script !== 'string' || !opts.script.trim()) throw new Error('R script is required');
        if (!packages.every(function (p) { return /^[A-Za-z][A-Za-z0-9.]*$/.test(p); })) throw new Error('Invalid R package name');
        var w = await _ensurePackages(packages, status);
        status('Running R...');
        shelter = await new w.Shelter();
        var cap = await shelter.captureR(opts.script, { captureStreams: true, captureConditions: false, captureGraphics: false, withAutoprint: false });
        var stdout = cap.output.filter(function (o) { return o.type === 'stdout'; }).map(function (o) { return o.data; }).join('\n');
        var versions = { R: await w.evalRString('R.version.string'), webR: w.version };
        for (var p of packages) versions[p] = await w.evalRString('as.character(packageVersion(' + JSON.stringify(p) + '))');
        // R normalizes 4.8-0 to 4.8.0; report the verified DESCRIPTION spelling.
        for (var p of packages) {
          var record = _manifest.packages.find(function (x) { return x.package === p; });
          if (record.version.replace(/-/g, '.') !== versions[p].replace(/-/g, '.')) throw new Error('Session package version differs: ' + p);
          versions[p] = record.version;
        }
        status('R finished.');
        return { ok: true, stdout: stdout, versions: versions };
      } catch (e) { return { ok: false, error: e.message || String(e) }; }
      finally { if (shelter) await shelter.purge(); }
    };
    var result = _queue.then(task, task); _queue = result.catch(function () {}); return result;
  }

  // ---- The metafor runner -----------------------------------------------

  // Clean, runnable, commented reproducible script (for download / copy), distinct from
  // the JSON-capture script used to drive the in-browser check.
  function buildReproScript(studies, method, test) {
    method = method || "REML"; test = test || "z";
    var yi = studies.map(function (s) { return s.est; }).join(", ");
    var sei = studies.map(function (s) { return s.se; }).join(", ");
    var labs = studies.map(function (s) { return '"' + String(s.label || "Study").replace(/"/g, '\\"') + '"'; }).join(", ");
    return [
      "# Reproducible meta-analysis — generated by allmeta (offline; matches the in-app result).",
      "# Effects are on the analysis scale (logRR/logOR/logHR/SMD/Fisher-z); back-transform as needed.",
      "library(metafor)",
      "",
      "dat <- data.frame(",
      "  study = c(" + labs + "),",
      "  yi    = c(" + yi + "),",
      "  sei   = c(" + sei + ")",
      ")",
      "",
      "res <- rma(yi = yi, sei = sei, method = \"" + method + "\", test = \"" + test + "\", slab = study, data = dat)",
      "summary(res)              # pooled estimate, tau^2, Q, I^2",
      "predict(res)              # pooled estimate + 95% prediction interval",
      "confint(res)              # profile-likelihood CIs for tau^2 / I^2",
      "forest(res)               # forest plot",
      "funnel(res); regtest(res) # funnel plot + Egger's regression test",
    ].join("\n");
  }
  // Trigger a .R file download of the reproducible script.
  function downloadRScript(studies, opts) {
    opts = opts || {};
    var txt = buildReproScript(studies, opts.method, opts.test);
    if (typeof document === "undefined") return txt;
    var blob = new Blob([txt], { type: "text/x-r;charset=utf-8" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = opts.filename || "meta-analysis.R";
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    return txt;
  }

  function buildMetaforScript(studies, method, test, extended) {
    method = method || 'REML'; test = test || 'z';
    if (!['PM','REML','ML','EB','SJ','HE','HS','DL'].includes(method)) throw new Error('Unsupported tau2 estimator');
    if (!['z','knha','adhoc','t'].includes(test)) throw new Error('Unsupported inference test');
    if (!Array.isArray(studies) || studies.length < 2 || studies.some(function (s) { return !Number.isFinite(s.est) || !Number.isFinite(s.se) || s.se <= 0; })) throw new Error('Need >= 2 studies with finite effects and positive SEs');
    var lines = [
      'suppressPackageStartupMessages(library(metafor))',
      'yi <- c(' + studies.map(function (s) { return s.est; }).join(',') + ')',
      'vi <- c(' + studies.map(function (s) { return s.se; }).join(',') + ')^2',
      'fit <- function(m, test="z") {',
      ' f <- rma(yi, vi, method=m, test=test, control=list(tol=1e-15, threshold=1e-12, maxiter=10000))',
      ' if (m %in% c("REML","ML","EB") && f$tau2 < 1e-3) f <- rma(yi, vi, method=m, test=test, control=list(tol=1e-15, threshold=max(1e-24,1e-12*f$tau2),maxiter=100000))',
      ' f',
      '}',
      'f <- fit("' + method + '", "' + test + '")',
      'out <- list(mu=as.numeric(f$beta[1]), se=f$se, ci_lb=f$ci.lb, ci_ub=f$ci.ub, tau2=f$tau2, QE=f$QE, I2=f$I2, k=f$k)'
    ];
    if (extended) lines.push(
      'hk <- fit("' + method + '", "adhoc"); pr <- predict(fit("' + method + '", "t"))',
      'dl <- fit("DL"); qp <- confint(fit("PM"), control=list(tol=1e-15,maxiter=100000,tau2.max=1e9))$random',
      'out$I2 <- dl$I2; out$pQ <- f$QEp; out$df <- f$k-1',
      'out$hk_lo <- hk$ci.lb; out$hk_hi <- hk$ci.ub; out$pi_lo <- pr$pi.lb; out$pi_hi <- pr$pi.ub',
      'out$tau2_lo <- qp["tau^2","ci.lb"]; out$tau2_hi <- qp["tau^2","ci.ub"]; out$I2_lo <- qp["I^2(%)","ci.lb"]; out$I2_hi <- qp["I^2(%)","ci.ub"]'
    );
    lines.push(
      'num <- function(x) if (length(x)!=1 || is.na(x) || !is.finite(x)) "null" else sprintf("%.17g",x)',
      `cat('ALMJSON:{', paste(sprintf('"%s":%s', names(out), vapply(out,num,"")),collapse=","), '}\\n', sep="")`
    );
    return lines.join('\n');
  }
  async function runMetafor(opts) {
    opts = opts || {};
    try {
      var script = buildMetaforScript(opts.studies || [], opts.method, opts.test, opts.extended);
      var r = await runR({ script: script, packages: ['metafor'], onStatus: opts.onStatus });
      if (!r.ok) return r;
      var line = r.stdout.split(/\r?\n/).find(function (l) { return l.startsWith('ALMJSON:'); });
      if (!line) throw new Error('R result record missing');
      return { ok: true, result: JSON.parse(line.slice(8)), rOutput: r.stdout, rScript: script, versions: r.versions };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // ---- Bus interop convenience ------------------------------------------

  /**
   * Read studies from ma-studies-v1 bus and run metafor on them.
   */
  function runMetaforFromBus(opts) {
    opts = opts || {};
    if (typeof global.MaStudies === "undefined" || typeof global.MaStudies.read !== "function") {
      return Promise.resolve({ ok: false, error: "ma-studies-v1 helper not loaded" });
    }
    var studies = global.MaStudies.read();
    if (!studies.length) {
      return Promise.resolve({ ok: false, error: "No studies on the shared bus" });
    }
    var merged = Object.assign({}, opts, { studies: studies });
    return runMetafor(merged);
  }

  // ---- Dual-engine concordance ------------------------------------------

  var _lastConcordance = null;

  /**
   * Field-by-field comparison of a JS engine result against a live-R (metafor)
   * result. Pure + deterministic — unit-testable without WebR. Produces a block
   * suitable for folding into a signed TruthCert receipt (opts.extra), so a
   * reviewer can confirm the in-app numbers matched an independent R run.
   */
  function concordance(jsRes, rRes, opts) {
    opts = opts || {};
    var tol = (typeof opts.tol === "number") ? opts.tol : 1e-4;
    var keys = opts.keys || ["mu", "se", "ci_lb", "ci_ub", "tau2", "I2"];
    var fields = {}, maxAbs = 0, n = 0;
    keys.forEach(function (k) {
      var r = rRes ? rRes[k] : undefined, j = jsRes ? jsRes[k] : undefined;
      if (typeof r === "number" && typeof j === "number" && isFinite(r) && isFinite(j)) {
        var d = Math.abs(r - j); if (d > maxAbs) maxAbs = d;
        fields[k] = { r: r, js: j, absDelta: d };
        n++;
      }
    });
    return {
      engine: "metafor",
      method: opts.method || null,
      fields: fields,
      maxAbsDelta: maxAbs,
      tol: tol,
      withinTol: n > 0 && maxAbs <= tol,
    };
  }

  function lastConcordance() { return _lastConcordance; }

  // ---- Inline modal renderer (drop-in for any app) ----------------------

  function _modalHTML() {
    return [
      '<div id="alm-webr-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;">',
      '  <div role="dialog" aria-modal="true" aria-labelledby="alm-webr-title" style="background:var(--panel,#fff);color:var(--ink,#15181d);border:1px solid var(--border,#ccc);border-radius:10px;padding:1.2rem 1.4rem;max-width:640px;width:92vw;max-height:84vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,0.3);">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem">',
      '      <h2 id="alm-webr-title" style="margin:0;font-size:1.05rem">Live R verification</h2>',
      '      <button type="button" id="alm-webr-close" aria-label="Close" style="background:transparent;border:none;font-size:1.4rem;cursor:pointer;color:inherit;line-height:1">×</button>',
      '    </div>',
      '    <div id="alm-webr-status" style="font-size:0.85rem;color:var(--muted,#666);margin-bottom:0.5rem">Booting WebR…</div>',
      '    <pre id="alm-webr-output" style="background:var(--input-bg,#f6f4ef);color:inherit;padding:0.6rem 0.8rem;border-radius:6px;font-size:0.8rem;max-height:50vh;overflow:auto;white-space:pre-wrap;word-break:break-word">(no output yet)</pre>',
      '  </div>',
      '</div>',
    ].join("");
  }

  function showModal() {
    if (document.getElementById("alm-webr-overlay")) return;
    document.body.insertAdjacentHTML("beforeend", _modalHTML());
    var overlay = document.getElementById("alm-webr-overlay");
    var close = document.getElementById("alm-webr-close");
    close.addEventListener("click", function () { overlay.remove(); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape") {
        var ov = document.getElementById("alm-webr-overlay");
        if (ov) ov.remove();
        document.removeEventListener("keydown", escHandler);
      }
    });
  }

  function _setStatus(s) {
    var el = document.getElementById("alm-webr-status");
    if (el) el.textContent = s;
  }
  function _setOutput(html) {
    var el = document.getElementById("alm-webr-output");
    if (el) el.innerHTML = html;
  }

  /**
   * Quick wiring: clicking the supplied button opens the modal, boots WebR,
   * pulls studies from the bus, runs metafor, displays both R's result and
   * the supplied JS result side-by-side.
   *
   *   AlmWebR.attachLiveButton({
   *     btn: "#btn-verify-live",
   *     getJsResult: () => ({ mu, se, ci_lb, ci_ub, tau2, I2, k }),
   *     method: "PM", test: "knha",
   *   });
   */
  function attachLiveButton(opts) {
    if (typeof document === "undefined") return false;
    var el = typeof opts.btn === "string" ? document.querySelector(opts.btn) : opts.btn;
    if (!el) return false;
    el.addEventListener("click", function () {
      showModal();
      var status = function (s) { _setStatus(s); };
      runMetaforFromBus({ method: opts.method || "REML", test: opts.test || "z", onStatus: status })
        .then(function (res) {
          var jsRes = typeof opts.getJsResult === "function" ? opts.getJsResult() : null;
          if (!res.ok) {
            _setStatus("Error.");
            _setOutput('<strong style="color:#a00">' + (res.error || "Unknown error") + '</strong>');
            return;
          }
          // Compute + store the concordance so the app's TruthCert receipt can
          // fold in a signed "cross-verified vs live metafor" block.
          var conc = concordance(jsRes, res.result, { method: opts.method || "REML", tol: opts.tol });
          try { conc.checkedAt = new Date().toISOString(); } catch (_) {}
          _lastConcordance = conc;
          var rows = "";
          rows += '<div style="margin:0 0 0.6rem;padding:0.45rem 0.7rem;border-radius:6px;font-weight:600;' +
            (conc.withinTol ? "background:#e7f6ec;color:#1f7a44" : "background:#fdeaea;color:#a02929") + '">' +
            (conc.withinTol ? "✓ Concordant with metafor" : "✗ Divergence vs metafor") +
            ' — max|Δ| = ' + conc.maxAbsDelta.toExponential(1) + ' (tol ' + conc.tol.toExponential(0) + ')</div>';
          var keys = ["mu", "se", "ci_lb", "ci_ub", "tau2", "I2", "k"];
          rows += "<table style=\"width:100%;border-collapse:collapse;font-size:0.85rem\">";
          rows += "<tr><th style=\"text-align:left;padding:0.25rem 0.4rem\">Field</th>" +
                  "<th style=\"text-align:right;padding:0.25rem 0.4rem\">R (metafor)</th>" +
                  "<th style=\"text-align:right;padding:0.25rem 0.4rem\">JS (in-page)</th>" +
                  "<th style=\"text-align:right;padding:0.25rem 0.4rem\">|Δ|</th></tr>";
          keys.forEach(function (k) {
            var rv = res.result[k];
            var jv = jsRes && jsRes[k];
            var diff = (typeof rv === "number" && typeof jv === "number") ? Math.abs(rv - jv) : "—";
            rows += "<tr><td style=\"padding:0.25rem 0.4rem;font-family:monospace\">" + k + "</td>" +
                    "<td style=\"text-align:right;padding:0.25rem 0.4rem;font-family:monospace\">" +
                    (typeof rv === "number" ? rv.toPrecision(6) : "—") + "</td>" +
                    "<td style=\"text-align:right;padding:0.25rem 0.4rem;font-family:monospace\">" +
                    (typeof jv === "number" ? jv.toPrecision(6) : "—") + "</td>" +
                    "<td style=\"text-align:right;padding:0.25rem 0.4rem;font-family:monospace\">" +
                    (typeof diff === "number" ? diff.toExponential(1) : diff) + "</td></tr>";
          });
          rows += "</table>";
          // Offer the clean reproducible script as a downloadable .R artifact.
          try {
            var st = (global.MaStudies && global.MaStudies.read) ? global.MaStudies.read() : [];
            if (st.length) {
              var repro = buildReproScript(st, opts.method || "REML", opts.test || "z");
              rows += "<p style=\"margin-top:0.7rem\"><a download=\"meta-analysis.R\" href=\"data:text/x-r;charset=utf-8," +
                encodeURIComponent(repro) + "\">⬇ Download reproducible R script (.R)</a></p>";
            }
          } catch (e) {}
          _setStatus("R ran successfully.");
          _setOutput(rows);
        }, function (err) {
          _setStatus("Error.");
          _setOutput('<strong style="color:#a00">' + (err.message || String(err)) + '</strong>');
        });
    });
    return true;
  }

  var api = {
    runR: runR,
    buildMetaforScript: buildMetaforScript,
    runMetafor: runMetafor,
    runMetaforFromBus: runMetaforFromBus,
    attachLiveButton: attachLiveButton,
    concordance: concordance,
    lastConcordance: lastConcordance,
    showModal: showModal,
    buildReproScript: buildReproScript,
    downloadRScript: downloadRScript,
    _resolveBaseUrl: _resolveBaseUrl,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmWebR = api;
})(typeof window !== "undefined" ? window : globalThis);
