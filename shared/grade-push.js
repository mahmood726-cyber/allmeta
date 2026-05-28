/* shared/grade-push.js — reusable "→ GRADE" producer control for ma-pooled-v1.
 *
 * Injects an outcome-name field + an export-scale selector (linear/ratio) + a
 * "→ GRADE" button into a mount element, and wires the button to push the app's
 * pooled estimate onto the multi-outcome pooled bus (MaPooled.add). The app only
 * supplies getPooled(): a function returning the pooled effect on the ANALYSIS
 * scale — { mu, lo?, hi?, se?, k, model? }. If lo/hi are omitted they are derived
 * from se via the normal 95% interval. The selector controls back-transform:
 * "ratio" exponentiates (OR/RR/HR); "linear" passes through (MD/SMD/log).
 *
 * Requires shared/ma-pooled-v1.js (window.MaPooled) and, ideally, shared/toast.js.
 *
 * Usage:
 *   <div id="alm-grade-push"></div>
 *   GradePush.attach({ mount: "alm-grade-push", defaultScale: "ratio",
 *                      getPooled: () => { const r = window._almLastX(); return r && {mu:r.mu, lo:r.lo, hi:r.hi, k:r.k, model:"random"}; } });
 */
(function (global) {
  "use strict";
  var Z975 = 1.959963984540054;

  function attach(opts) {
    opts = opts || {};
    var mount = typeof opts.mount === "string" ? document.getElementById(opts.mount) : opts.mount;
    if (!mount || typeof opts.getPooled !== "function") return false;
    var toast = opts.toast || function (m) { if (global.Toast && global.Toast.show) global.Toast.show(m, "warn"); };

    var wrap = document.createElement("div");
    wrap.className = "grade-push-group";
    wrap.style.cssText = "display:inline-flex; gap:0.5rem; align-items:end; flex-wrap:wrap;";
    wrap.innerHTML =
      '<label style="font-size:0.8rem;"><span class="lbl">Outcome name (for GRADE)</span>' +
      '<input type="text" class="gp-outcome" placeholder="e.g. All-cause mortality" aria-label="Outcome name (for GRADE)"></label>' +
      '<label style="font-size:0.8rem;"><span class="lbl">Effect scale (GRADE export)</span>' +
      '<select class="gp-scale" aria-label="Effect scale (GRADE export)">' +
      '<option value="linear">linear (MD / SMD / log)</option>' +
      '<option value="ratio">ratio &mdash; exponentiate (OR / RR / HR)</option></select></label>' +
      '<button type="button" class="gp-btn" title="Push the pooled estimate (point + 95% CI, as displayed) to the GRADE SoF builder via the ma-pooled-v1 bus. Pick \'ratio\' to exponentiate log effects so GRADE gets the natural-scale value.">&rarr; GRADE</button>';
    mount.appendChild(wrap);

    var scaleSel = wrap.querySelector(".gp-scale");
    if (opts.defaultScale === "ratio") scaleSel.value = "ratio";

    wrap.querySelector(".gp-btn").addEventListener("click", function () {
      if (!global.MaPooled) { toast("Pooled-bus helper not loaded."); return; }
      var p;
      try { p = opts.getPooled(); } catch (_) { p = null; }
      if (!p || typeof p.mu !== "number" || !isFinite(p.mu)) { toast("Pool at least 2 studies first."); return; }
      var ratio = scaleSel.value === "ratio";
      var tx = function (v) { return ratio ? Math.exp(v) : v; };
      var lo = isFinite(p.lo) ? p.lo : p.mu - Z975 * p.se;
      var hi = isFinite(p.hi) ? p.hi : p.mu + Z975 * p.se;
      var result = {
        pointEstimate: tx(p.mu), ciLo: tx(lo), ciHi: tx(hi),
        scale: ratio ? "ratio" : "linear",
        k: p.k, model: p.model || "random",
      };
      var name = (wrap.querySelector(".gp-outcome").value || "").trim();
      if (name) result.label = name;
      var n = global.MaPooled.add(result);
      if (n) toast(n + " outcome" + (n === 1 ? "" : "s") + " queued for GRADE. Open GRADE SoF → “Load pooled”.");
      else toast("Could not push pooled result (no valid pooled estimate yet).");
    });
    return true;
  }

  var api = { attach: attach };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.GradePush = api;
})(typeof window !== "undefined" ? window : globalThis);
