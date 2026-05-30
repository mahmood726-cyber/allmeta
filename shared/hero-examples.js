/* shared/hero-examples.js — "Try with: <famous-dataset> ▾" widget.
 *
 * Every numerical app should expose a selector that loads a canonical
 * published dataset into its primary textarea / state, replacing the
 * abstract default. Three reasons:
 *
 *   1. Onboarding — newcomers see a recognised dataset, not Trial 1/2/3.
 *   2. Teaching — links the app's method to the paper it was built for.
 *   3. Reproducibility — `loadHero("bcg")` always produces the same input,
 *      so anyone can sanity-check the app against published reanalyses.
 *
 * Datasets live in shared/canonical-datasets.js; this module renders the
 * dropdown + handles the click-to-fill wiring per app.
 *
 *   AlmHero.attachHero({
 *     container: "#alm-hero-mount",
 *     textarea: "#src",              // the target textarea
 *     adapter: "forest",              // "forest" | "glmm" | "cross-design" |
 *                                     // "cross-network" | "sequential" |
 *                                     // "personalised"
 *     onAfterLoad: () => …,           // optional callback (re-render plot)
 *     extras: { "f-rho": "0.5" },     // optional field setters after load
 *   });
 */
(function (global) {
  "use strict";

  // ---- Per-adapter manifest (dataset key + label per app type) ----------

  var MANIFESTS = {
    forest: [
      { key: "bcg", label: "BCG vaccine (Berkey 1995, log-RR)" },
    ],
    glmm: [
      { key: "eltrombopag", label: "Eltrombopag (Stijnen 2010, rare-events)" },
    ],
    "cross-design": [
      { key: "bcg", label: "BCG vaccine (Berkey 1995, RCT + obs)" },
    ],
    "cross-network": [
      { key: "bcg", label: "BCG vaccine (single contrast, RCT + obs)" },
    ],
    sequential: [
      { key: "sequential_demo", label: "Accumulating mortality MA (Wetterslev 2008)" },
    ],
    personalised: [
      { key: "subgroup_demo", label: "Subgroup HTE (PATH-style)" },
    ],
    bma: [
      { key: "bcg", label: "BCG vaccine (Berkey 1995, log-RR)" },
    ],
  };

  function _adapterFn(adapter) {
    if (!global.AlmDatasets) return null;
    var D = global.AlmDatasets;
    switch (adapter) {
      case "forest":
      case "bma":          return D.toForestPlotText;
      case "glmm":         return D.toGlmmTextarea;
      case "cross-design": return D.toCrossDesignText;
      case "cross-network":return D.toCrossNetworkText;
      case "sequential":   return D.toSequentialMaText;
      case "personalised": return D.toPersonalisedTeText;
      default:             return null;
    }
  }

  function _renderHero(container, adapter, extras) {
    var manifest = MANIFESTS[adapter] || [];
    if (!manifest.length) { container.innerHTML = ""; return; }
    var html = '<div class="alm-hero-bar" style="display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center;margin-top:0.5rem;font-size:0.85rem">' +
      '<span style="color:var(--muted,#5c6470);font-weight:600">Try with:</span>' +
      '<select data-alm-hero aria-label="Load a benchmark dataset" style="padding:0.3rem 0.5rem;border:1px solid var(--border,#d9d5cc);background:var(--input-bg,#fbfaf6);color:var(--ink,#15181d);border-radius:4px;font-size:0.83rem">';
    html += '<option value="">— pick a dataset —</option>';
    manifest.forEach(function (m) {
      html += '<option value="' + m.key + '">' + m.label + '</option>';
    });
    html += '</select></div>';
    container.innerHTML = html;
  }

  function attachHero(opts) {
    if (typeof document === "undefined") return false;
    var el = typeof opts.container === "string"
      ? document.querySelector(opts.container)
      : opts.container;
    if (!el) return false;
    var taSel = opts.textarea;
    var adapter = opts.adapter;
    var adapterFn = _adapterFn(adapter);
    if (!adapterFn) return false;
    _renderHero(el, adapter, opts.extras);
    el.addEventListener("change", function (e) {
      var sel = e.target.closest("[data-alm-hero]");
      if (!sel) return;
      var key = sel.value;
      if (!key) return;
      var ds = global.AlmDatasets && global.AlmDatasets.get(key);
      if (!ds) return;
      var ta = typeof taSel === "string" ? document.querySelector(taSel) : taSel;
      if (!ta) return;
      var text = adapterFn(ds);
      if (text) {
        ta.value = text;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }
      // Optional companion fields (e.g. reference treatment, ρ).
      if (opts.extras && typeof opts.extras === "object") {
        for (var k in opts.extras) {
          var fld = document.getElementById(k);
          if (fld) {
            fld.value = opts.extras[k];
            fld.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      }
      if (typeof opts.onAfterLoad === "function") {
        try { opts.onAfterLoad(ds); } catch (_) { /* ignore */ }
      }
    });
    return true;
  }

  var api = {
    MANIFESTS: MANIFESTS,
    attachHero: attachHero,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmHero = api;
})(typeof window !== "undefined" ? window : globalThis);
