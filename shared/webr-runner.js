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

  // ---- Bootstrap caching state ------------------------------------------

  var _bootPromise = null;
  var _webR = null;
  var _packagesInstalled = new Set();

  function _resolveBaseUrl() {
    // Mirror the lookup logic in webr-studio: prefer the same-origin
    // self-hosted bundle, then the public webr CDN as a fallback. Apps
    // calling us from /forest-plot/ need the URL to be absolute to the
    // hub root, so we use location.origin + a discovery path.
    var bases = [];
    var origin = (typeof location !== "undefined") ? location.origin : "";
    if (origin) bases.push(origin + "/r-shiny/shinylive/webr/");
    bases.push("https://webr.r-wasm.org/latest/");
    return bases;
  }

  function _ensureWebR(onStatus) {
    if (_webR) return Promise.resolve(_webR);
    if (_bootPromise) return _bootPromise;
    if (typeof onStatus === "function") onStatus("Booting WebR (one-time, ~30 MB)…");

    _bootPromise = new Promise(function (resolve, reject) {
      var bases = _resolveBaseUrl();
      function tryNext(i) {
        if (i >= bases.length) {
          return reject(new Error("WebR module not reachable at any candidate URL"));
        }
        var url = bases[i] + "webr.mjs";
        import(/* @vite-ignore */ url).then(function (mod) {
          var WebR = mod.WebR;
          if (!WebR) { tryNext(i + 1); return; }
          var w = new WebR({ interactive: false, baseUrl: bases[i] });
          w.init().then(function () { _webR = w; resolve(w); }, function (err) {
            console.warn("[allmeta-webr] init failed at " + bases[i] + ":", err);
            tryNext(i + 1);
          });
        }, function (err) {
          console.warn("[allmeta-webr] import failed at " + bases[i] + ":", err);
          tryNext(i + 1);
        });
      }
      tryNext(0);
    });
    return _bootPromise;
  }

  function _ensurePackages(packages, onStatus) {
    return _ensureWebR(onStatus).then(function (webR) {
      var todo = packages.filter(function (p) { return !_packagesInstalled.has(p); });
      if (!todo.length) return webR;
      if (typeof onStatus === "function") onStatus("Installing R packages: " + todo.join(", ") + "…");
      return webR.installPackages(todo, { quiet: true }).then(function () {
        todo.forEach(function (p) { _packagesInstalled.add(p); });
        return webR;
      });
    });
  }

  // ---- The metafor runner -----------------------------------------------

  function _buildRScript(studies, method, test) {
    var yi = studies.map(function (s) { return s.est; }).join(", ");
    var sei = studies.map(function (s) { return s.se; }).join(", ");
    var labels = studies.map(function (s) {
      return '"' + String(s.label || "Study").replace(/"/g, '\\"') + '"';
    }).join(", ");
    return [
      "library(metafor)",
      "yi  <- c(" + yi + ")",
      "sei <- c(" + sei + ")",
      "labs <- c(" + labels + ")",
      "fit <- rma(yi = yi, sei = sei, method = '" + method + "', test = '" + test + "', slab = labs)",
      "out <- list(",
      "  mu = unname(fit$beta[1, 1]),",
      "  se = unname(fit$se),",
      "  ci_lb = unname(fit$ci.lb),",
      "  ci_ub = unname(fit$ci.ub),",
      "  tau2 = unname(fit$tau2),",
      "  QE = unname(fit$QE),",
      "  I2 = unname(fit$I2),",
      "  k = fit$k",
      ")",
      "jsonlite::toJSON(out, auto_unbox = TRUE, digits = 12)",
    ].join("\n");
  }

  function runMetafor(opts) {
    opts = opts || {};
    var studies = opts.studies || [];
    var method = opts.method || "REML";
    var test = opts.test || "z";
    var onStatus = opts.onStatus || function () {};
    if (!Array.isArray(studies) || studies.length < 2) {
      return Promise.resolve({ ok: false, error: "Need ≥ 2 studies" });
    }

    return _ensurePackages(["metafor", "jsonlite"], onStatus).then(function (webR) {
      onStatus("Running rma(method='" + method + "', test='" + test + "')…");
      var rScript = _buildRScript(studies, method, test);
      var shelter = null;
      return new webR.Shelter().then(function (s) {
        shelter = s;
        return shelter.captureR(rScript, { captureStreams: true, withAutoprint: false });
      }).then(function (cap) {
        // cap.result is an R character with the JSON; cap.output is stream
        // chunks. Extract the JSON.
        return cap.result.toString().then(function (jsonStr) {
          // The result of jsonlite::toJSON inside captureR comes back as
          // a length-1 R character. Sometimes it's wrapped in [".."].
          if (typeof jsonStr === "string") {
            var parsed;
            try { parsed = JSON.parse(jsonStr); }
            catch (_) {
              // Try wrapped form: ["{...}"]
              try { parsed = JSON.parse(JSON.parse(jsonStr)); }
              catch (e2) { throw new Error("Could not parse R JSON: " + jsonStr.slice(0, 80)); }
            }
            var outputText = (cap.output || []).map(function (c) { return c.data || ""; }).join("");
            return { ok: true, result: parsed, rOutput: outputText, rScript: rScript };
          }
          throw new Error("Unexpected R result type");
        });
      }).catch(function (e) {
        return { ok: false, error: e.message || String(e), rScript: rScript };
      }).then(function (final) {
        if (shelter) shelter.purge().catch(function () {});
        onStatus("Done.");
        return final;
      });
    }).catch(function (e) {
      return { ok: false, error: e.message || String(e) };
    });
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
          var rows = "";
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
    runMetafor: runMetafor,
    runMetaforFromBus: runMetaforFromBus,
    attachLiveButton: attachLiveButton,
    showModal: showModal,
    _resolveBaseUrl: _resolveBaseUrl,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmWebR = api;
})(typeof window !== "undefined" ? window : globalThis);
