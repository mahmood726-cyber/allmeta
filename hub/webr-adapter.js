/*!
 * hub/webr-adapter.js — shared WebR loader + R-script templates + browser↔R diff.
 *
 * Loaded on demand by validatable apps. NOT a page-load script tag — apps
 * append it only after an explicit user click. See html-apps.md "no external
 * CDN at runtime" rule: this adapter is local; WebR itself is loaded by
 * dynamic import() from a user-configurable URL.
 *
 * Usage from a host app:
 *
 *   const adapter = await loadAdapter();   // helper in host app
 *   const result = await adapter.runPairwise(
 *     studies, { method: "PM", test: "z", url: ".../webr.mjs" }
 *   );
 *   // result = { r: {estimate, se, ...}, log: [...] }
 *
 * The adapter deliberately exposes a window global (not an ES module) so
 * it can be injected with a plain <script> tag — making per-app deferred
 * loading trivial.
 */
(function (global) {
  "use strict";
  if (global.WebRAdapter) return;  // idempotent

  let webRInstance = null;
  const listeners = [];
  const state = { status: "idle", message: "" };

  function log(msg) { for (const fn of listeners) { try { fn(msg); } catch (e) {} } }
  function setStatus(s, m) { state.status = s; state.message = m || ""; log("[" + s + "] " + state.message); }

  function onLog(fn) { if (typeof fn === "function") listeners.push(fn); return () => {
    const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1);
  }; }

  async function ensure(url) {
    if (webRInstance) return webRInstance;
    setStatus("loading", "import " + url);
    const mod = await import(url);
    const WebRCtor = mod.WebR;
    if (!WebRCtor) throw new Error("module has no WebR export");
    const wr = new WebRCtor();
    await wr.init();
    setStatus("loading", "installing metafor");
    await wr.installPackages(["metafor"], { quiet: false });
    setStatus("ready", "WebR + metafor ready");
    webRInstance = wr;
    return wr;
  }

  // ---- R-script templates per method ----
  function scriptPairwise(studies, method, test) {
    const yi = studies.map(s => s.est).join(", ");
    const sei = studies.map(s => s.se).join(", ");
    const labs = studies.map(s => '"' + String(s.label).replace(/"/g, '\\"') + '"').join(", ");
    return [
      "library(metafor)",
      "yi  <- c(" + yi + ")",
      "sei <- c(" + sei + ")",
      "slab <- c(" + labs + ")",
      'res <- rma(yi, sei = sei, method = "' + method + '", test = "' + test + '", slab = slab)',
      "cat(sprintf(\"estimate=%.10f\\nse=%.10f\\nci.lb=%.10f\\nci.ub=%.10f\\ntau^2=%.10f\\nI^2=%.10f\\nQE=%.10f\\n\",",
      "  as.numeric(res$b), as.numeric(res$se), as.numeric(res$ci.lb), as.numeric(res$ci.ub),",
      "  as.numeric(res$tau2), as.numeric(res$I2), as.numeric(res$QE)))"
    ].join("\n");
  }

  function scriptMetaReg(studies, method, test) {
    const yi = studies.map(s => s.est).join(", ");
    const sei = studies.map(s => s.se).join(", ");
    const x = studies.map(s => s.x).join(", ");
    return [
      "library(metafor)",
      "yi  <- c(" + yi + ")",
      "sei <- c(" + sei + ")",
      "x   <- c(" + x + ")",
      'res <- rma(yi, sei = sei, mods = ~ x, method = "' + method + '", test = "' + test + '")',
      "cat(sprintf(\"b0=%.10f\\nb1=%.10f\\nse0=%.10f\\nse1=%.10f\\ntau^2=%.10f\\nQE=%.10f\\n\",",
      "  as.numeric(res$b[1]), as.numeric(res$b[2]), as.numeric(res$se[1]), as.numeric(res$se[2]),",
      "  as.numeric(res$tau2), as.numeric(res$QE)))"
    ].join("\n");
  }

  function scriptCumul(studies, method) {
    const yi = studies.map(s => s.est).join(", ");
    const sei = studies.map(s => s.se).join(", ");
    return [
      "library(metafor)",
      "yi  <- c(" + yi + ")",
      "sei <- c(" + sei + ")",
      'res <- rma(yi, sei = sei, method = "' + method + '")',
      "cm  <- cumul(res)",
      "# Last (all-studies-included) row must match the full-data pooled estimate",
      "cat(sprintf(\"estimate=%.10f\\nse=%.10f\\nci.lb=%.10f\\nci.ub=%.10f\\ntau^2=%.10f\\nQE=%.10f\\n\",",
      "  as.numeric(res$b), as.numeric(res$se), as.numeric(res$ci.lb), as.numeric(res$ci.ub),",
      "  as.numeric(res$tau2), as.numeric(res$QE)))"
    ].join("\n");
  }

  // ---- R output parser (shared) ----
  function parseKV(text) {
    const patterns = {
      estimate: /estimate\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
      se:       /\bse\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
      ci_lb:    /ci\.lb\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
      ci_ub:    /ci\.ub\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
      tau2:     /tau\^?2\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/i,
      I2:       /I\^?2\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/i,
      QE:       /\bQE?\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
      b0:       /\bb0\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
      b1:       /\bb1\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
      se0:      /\bse0\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/,
      se1:      /\bse1\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/
    };
    const out = {};
    for (const [k, rx] of Object.entries(patterns)) {
      const m = String(text).match(rx);
      if (m) out[k] = parseFloat(m[1]);
    }
    return out;
  }

  async function runScript(url, script) {
    const wr = await ensure(url);
    const capture = await wr.captureR(script, { captureStreams: true });
    const raw = (capture.output || []).map(s => s.data || "").join("\n");
    log(raw);
    return { raw: raw, parsed: parseKV(raw) };
  }

  async function runPairwise(studies, opts) {
    opts = opts || {};
    const method = opts.method || "PM";
    const test = opts.test || "z";
    const url = opts.url || "https://webr.r-wasm.org/latest/webr.mjs";
    return await runScript(url, scriptPairwise(studies, method, test));
  }

  async function runMetaReg(studies, opts) {
    opts = opts || {};
    const method = opts.method || "PM";
    const test = opts.test || "knha";
    const url = opts.url || "https://webr.r-wasm.org/latest/webr.mjs";
    return await runScript(url, scriptMetaReg(studies, method, test));
  }

  async function runCumul(studies, opts) {
    opts = opts || {};
    const method = opts.method || "PM";
    const url = opts.url || "https://webr.r-wasm.org/latest/webr.mjs";
    return await runScript(url, scriptCumul(studies, method));
  }

  // ---- Shared diff helper ----
  function diff(browser, r, tol) {
    if (!tol) tol = 1e-4;
    const rows = [];
    const keys = Object.keys(browser);
    let allMatch = true;
    for (const k of keys) {
      const b = browser[k], rv = r[k];
      let status;
      if (rv == null || !isFinite(rv)) { status = "n/a"; allMatch = false; }
      else if (!isFinite(b)) { status = "n/a"; allMatch = false; }
      else {
        const d = Math.abs(b - rv);
        const rel = Math.abs(b) > 1e-6 ? d/Math.abs(b) : d;
        if (d < tol || rel < tol) status = "OK";
        else { status = "DIFF " + d.toExponential(2); allMatch = false; }
      }
      rows.push({ key: k, browser: b, r: rv, status: status });
    }
    return { rows: rows, allMatch: allMatch };
  }

  global.WebRAdapter = {
    state: state,
    onLog: onLog,
    ensure: ensure,
    runPairwise: runPairwise,
    runMetaReg: runMetaReg,
    runCumul: runCumul,
    scriptPairwise: scriptPairwise,
    scriptMetaReg: scriptMetaReg,
    scriptCumul: scriptCumul,
    diff: diff,
    parseKV: parseKV
  };
})(typeof window !== "undefined" ? window : globalThis);
