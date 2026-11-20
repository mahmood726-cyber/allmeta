/* evalue/r-check.js -- "Verify in R" and "Download R script" for the E-value page.
 *
 * Both buttons use ONE script, generated from the inputs now on the page (every field
 * re-runs the page's computation on input/change, so the fields are the analysed
 * inputs) and the full-precision numbers behind the table it displays
 * (window.__almLastEValue). The script recomputes every displayed number with the R
 * package EValue (4.1.4 in the P22 validation), prints each next to the page's value
 * and the absolute difference, and ends with MATCH n/n or MISMATCH.
 *
 * "Verify in R" runs the same script in the browser with WebR through the unchanged
 * ../shared/webr-runner.js. EValue is not in WebR's pinned package repository; when it
 * is missing the button says so plainly and does not run: the downloaded script is the
 * check. Nothing is substituted for EValue.
 */
(function () {
  "use strict";

  var FILE = "evalue-check.R";
  var REQUIRED_PACKAGES = ["EValue"];  // the check is meaningless without it

  function rnum(x) { return (typeof x === "number" && isFinite(x)) ? String(x) : "NA"; }
  function rstr(s) {
    return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[^\x20-\x7e]/g, function (c) {
      return "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4);
    }) + '"';
  }

  var R_HELPERS = [
    "## ---- comparison helpers ----",
    ".n <- 0L; .ok <- 0L; .skipped <- character(0); .err <- NULL",
    "fmtv <- function(x) if (length(x) != 1 || is.na(x)) \"NA\" else sprintf(\"%.10g\", x)",
    "check <- function(label, r, page) {",
    "  # |R - page| <= min(5e-5, 1e-9 * max(1, |page|)): never looser than half a unit of the 4 decimals shown",
    "  # (a relative 1e-9 alone is looser than that once |value| > 5e4: an E-value of 2e7 would pass an error of 0.001)",
    "  if (length(r) != 1) r <- NA_real_",
    "  both_na <- is.na(r) && is.na(page)",
    "  d <- if (both_na) 0 else abs(r - page)",
    "  ok <- both_na || (!is.na(d) && d <= min(5e-5, 1e-9 * max(1, abs(page))))",
    "  .n <<- .n + 1L; if (ok) .ok <<- .ok + 1L",
    "  cat(sprintf(\"%-46s R %-16s page %-16s |diff| %-8s %s\\n\", label, fmtv(r), fmtv(page),",
    "              if (both_na) \"-\" else sprintf(\"%.1e\", d), if (ok) \"ok\" else \"DIFFERS\"))",
    "}",
    "not_checked <- function(label, why) {",
    "  .skipped <<- c(.skipped, label)",
    "  cat(sprintf(\"%-46s NOT CHECKED (%s)\\n\", label, why))",
    "}",
    "finish <- function() {",
    "  extra <- if (length(.skipped)) sprintf(\" (%d more NOT CHECKED: see above)\", length(.skipped)) else \"\"",
    "  # LIM-P22 F20: an R error must still end the output with a verdict line, never a bare stop.",
    "  if (!is.null(.err)) cat(sprintf(\"MISMATCH (R stopped with an error after %d of %d checks agreed: %s)%s\\n\", .ok, .n, .err, extra))",
    "  else if (.n == 0L) cat(sprintf(\"MISMATCH (nothing could be checked)%s\\n\", extra))",
    "  else if (.ok == .n) cat(sprintf(\"MATCH %d/%d%s\\n\", .ok, .n, extra))",
    "  else cat(sprintf(\"MISMATCH (%d of %d quantities agree)%s\\n\", .ok, .n, extra))",
    "}",
  ].join("\n");

  function num(id) {
    var input = document.getElementById(id);
    if (input.validity && input.validity.badInput) return NaN;
    var raw = String(input.value).trim();
    return raw === "" ? null : Number(raw);
  }

  // The quantities the page displays for its current result, in display order.
  function pageQuantities(measure, tv, r) {
    var q = [];
    function add(key, label, v) { q.push({ key: key, label: label, value: v == null ? null : v }); }
    add("e_point", "E-value (point estimate)", r.point);
    add("e_ci", "E-value (CI limit nearest " + (tv === null ? "null" : "true value") + ")", r.ci);
    if (measure === "RD") {
      add("rd", "Risk difference", r.rd); add("rd_lo", "Risk difference, CI lower", r.rdLo);
      add("rd_hi", "Risk difference, CI upper", r.rdHi); add("bf", "Bias factor to reach the true value", r.biasFactor);
      return q;
    }
    if (measure === "OLS") { add("d", "Standardised difference d", r.d); if (r.seD != null) add("se_d", "SE of d", r.seD); }
    add("rr", "Approx. risk ratio used", r.rr.point);
    if (r.rr.lo != null) { add("rr_lo", "Approx. risk ratio, CI lower", r.rr.lo); add("rr_hi", "Approx. risk ratio, CI upper", r.rr.hi); }
    if (tv !== null) add("rr_true", "True value on the risk-ratio scale", r.rr["true"]);
    return q;
  }

  function buildScript() {
    var r = typeof window.__almLastEValue === "function" ? window.__almLastEValue() : null;
    if (!r) throw new Error("The page shows no E-value for these inputs (it refused them), so there is nothing to check in R.");
    var measure = document.getElementById("measure").value;
    var tv = num("truev");
    var inp = {
      measure: measure, point: measure === "RD" ? null : num("point"),
      lo: (measure === "RD" || measure === "OLS") ? null : num("lo"), hi: (measure === "RD" || measure === "OLS") ? null : num("hi"),
      se: (measure === "SMD" || measure === "OLS") ? num("se") : null,
      sd: measure === "OLS" ? num("sd") : null, delta: measure === "OLS" ? num("delta") : null,
      rare: document.getElementById("rare").checked, "true": tv,
      n11: measure === "RD" ? num("n11") : null, n10: measure === "RD" ? num("n10") : null,
      n01: measure === "RD" ? num("n01") : null, n00: measure === "RD" ? num("n00") : null,
    };
    if (measure === "OLS" && inp.delta === null) inp.delta = 1;  // the page's default for a blank contrast
    var q = pageQuantities(measure, tv, r);
    var build = window.AlmBuildInfo ? (window.AlmBuildInfo.version + " " + (window.AlmBuildInfo.shortSha || "")) : "unknown";
    var L = [];
    L.push("## E-value: R check of the numbers this page displays.");
    L.push("## Generated by the allmeta E-value page (build " + build.trim() + ") from the inputs on the page.");
    L.push("## Reference, as in the P22 validation: the R package EValue (4.1.4) -- evalues.RR/OR/HR/MD/OLS/RD.");
    L.push("## For a d with a confidence interval the page maps the estimate and each limit through");
    L.push("## exp(0.91 d) pointwise; the script does the same with evalues.MD, as the P22 validation did.");
    L.push("## Run with:  Rscript " + FILE + "   (needs EValue: install.packages(\"EValue\"))");
    L.push("");
    L.push(R_HELPERS);
    L.push("");
    L.push("## ---- inputs the page analysed (blank fields are NA) ----");
    L.push("inp <- list(measure = " + rstr(inp.measure) + ", point = " + rnum(inp.point) + ", lo = " + rnum(inp.lo) + ", hi = " + rnum(inp.hi) +
      ", se = " + rnum(inp.se) + ",\n            sd = " + rnum(inp.sd) + ", delta = " + rnum(inp.delta) + ", rare = " + (inp.rare ? "TRUE" : "FALSE") +
      ", true = " + rnum(inp["true"]) + ",\n            n11 = " + rnum(inp.n11) + ", n10 = " + rnum(inp.n10) + ", n01 = " + rnum(inp.n01) + ", n00 = " + rnum(inp.n00) + ")");
    L.push("## ---- the page's results (full precision behind the displayed 4 decimals; NA = shown as a dash) ----");
    L.push("page <- list(" + q.map(function (x) { return "\n  " + x.key + " = " + rnum(x.value); }).join(",") + ")");
    L.push("labels <- c(" + q.map(function (x) { return "\n  " + x.key + " = " + rstr(x.label); }).join(",") + ")");
    L.push("");
    L.push("if (!requireNamespace(\"EValue\", quietly = TRUE)) {");
    L.push("  for (k in names(page)) not_checked(labels[[k]], \"package EValue is not installed\")");
    L.push("  cat(\"Install EValue (version 4.1.4 was used by the P22 validation) and run this script again.\\n\")");
    L.push("} else invisible(tryCatch(with(inp, {");
    L.push("  q <- function(e) suppressMessages(suppressWarnings(e))");
    L.push("  cat(sprintf(\"R %s; EValue %s; measure %s\\n\", getRversion(), packageVersion(\"EValue\"), measure))");
    L.push("  first <- function(x) { x <- x[!is.na(x)]; if (length(x)) x[[1]] else NA_real_ }");
    L.push("  hasci <- !is.na(lo) && !is.na(hi)");
    L.push("  tv <- if (is.na(true)) (if (measure %in% c(\"RR\", \"OR\", \"HR\")) 1 else 0) else true");
    L.push("  R <- list()");
    L.push("  if (measure %in% c(\"RR\", \"OR\", \"HR\")) {");
    L.push("    f <- getExportedValue(\"EValue\", paste0(\"evalues.\", measure))");
    L.push("    a <- list(est = point, true = tv); if (hasci) { a$lo <- lo; a$hi <- hi }");
    L.push("    if (measure != \"RR\") a$rare <- rare");
    L.push("    m <- q(do.call(f, a))");
    L.push("    R <- list(e_point = m[2, 1], e_ci = if (hasci) first(m[2, 2:3]) else NA, rr = m[1, 1],");
    L.push("              rr_lo = if (hasci) m[1, 2] else NA, rr_hi = if (hasci) m[1, 3] else NA)");
    L.push("    if (!is.na(true)) { b <- list(est = true); if (measure != \"RR\") b$rare <- rare; R$rr_true <- q(do.call(f, b))[1, 1] }");
    L.push("  } else if (measure == \"SMD\" && !is.na(se)) {");
    L.push("    m <- q(EValue::evalues.MD(est = point, se = se, true = tv))     # EValue's SE-based limits exp(0.91 d -/+ 1.78 se)");
    L.push("    R <- list(e_point = m[2, 1], e_ci = first(m[2, 2:3]), rr = m[1, 1], rr_lo = m[1, 2], rr_hi = m[1, 3],");
    L.push("              rr_true = q(EValue::evalues.MD(est = tv))[1, 1])");
    L.push("  } else if (measure == \"SMD\") {");
    L.push("    md <- function(v) q(EValue::evalues.MD(est = v))               # pointwise: RR = exp(0.91 d)");
    L.push("    m <- md(point); R <- list(e_point = m[2, 1], e_ci = NA, rr = m[1, 1], rr_true = md(tv)[1, 1])");
    L.push("    if (hasci) {");
    L.push("      R$rr_lo <- md(lo)[1, 1]; R$rr_hi <- md(hi)[1, 1]");
    L.push("      if (is.na(true)) {                                            # the limit nearest the null; 1 if the CI includes 0");
    L.push("        R$e_ci <- if (lo <= 0 && hi >= 0) 1 else if (point >= 0) md(lo)[2, 1] else md(hi)[2, 1]");
    L.push("      } else {");
    L.push("        mm <- q(EValue::evalues.RR(est = R$rr, lo = R$rr_lo, hi = R$rr_hi, true = R$rr_true))");
    L.push("        R$e_point <- mm[2, 1]; R$e_ci <- first(mm[2, 2:3])");
    L.push("      }");
    L.push("    } else if (!is.na(true)) R$e_point <- q(EValue::evalues.MD(est = point, true = tv))[2, 1]");
    L.push("  } else if (measure == \"OLS\") {");
    L.push("    m <- q(EValue::evalues.OLS(est = point, se = se, sd = sd, delta = delta, true = tv))");
    L.push("    R <- list(e_point = m[2, 1], e_ci = first(m[2, 2:3]), rr = m[1, 1], rr_lo = m[1, 2], rr_hi = m[1, 3],");
    L.push("              d = point * abs(delta) / sd, se_d = se * abs(delta) / sd,   # evalues.OLS's d (it recodes delta to |delta|)");
    L.push("              rr_true = q(EValue::evalues.MD(est = tv))[1, 1])");
    L.push("  } else if (measure == \"RD\") {");
    L.push("    o <- q(EValue::evalues.RD(n11 = n11, n10 = n10, n01 = n01, n00 = n00, true = tv))");
    L.push("    # The risk difference, its Wald 95% CI and the bias factor are the quantities inside EValue's");
    L.push("    # evalues.RD (Ding & VanderWeele 2016), written out in base R because EValue does not return them.");
    L.push("    N1 <- n11 + n10; N0 <- n01 + n00; N <- N1 + N0; f <- N1 / N; p1 <- n11 / N1; p0 <- n01 / N0");
    L.push("    half <- qnorm(0.975) * sqrt(p1 * (1 - p1) / N1 + p0 * (1 - p0) / N0)");
    L.push("    dd <- p0 * (1 - f) - p1 * f");
    L.push("    R <- list(e_point = unname(o$est.Evalue), e_ci = unname(o$lower.Evalue), rd = p1 - p0, rd_lo = p1 - p0 - half,");
    L.push("              rd_hi = p1 - p0 + half, bf = (sqrt((tv + dd)^2 + 4 * p1 * p0 * f * (1 - f)) - (tv + dd)) / (2 * p0 * f))");
    L.push("  }");
    L.push("  for (k in names(page)) check(labels[[k]], if (is.null(R[[k]])) NA_real_ else as.numeric(R[[k]]), page[[k]])");
    L.push("}), error = function(e) { .err <<- conditionMessage(e); cat(\"R error: \", .err, \"\\n\", sep = \"\") }))");
    L.push("finish()");
    return L.join("\n") + "\n";
  }
  window.__almEValueRScript = buildScript;

  // ---- UI -----------------------------------------------------------------
  function el(id) { return document.getElementById(id); }
  function setStatus(s) { var e = el("rcheck-status"); if (e) e.textContent = s; }
  function verdictOf(text) {
    var lines = String(text).split(/\r?\n/).filter(function (l) { return /^(MATCH|MISMATCH)\b/.test(l); });
    return lines.length ? lines[lines.length - 1] : null;
  }
  function showVerdict(v) {
    var e = el("rcheck-verdict"); if (!e) return;
    e.textContent = v || "";
    e.className = "note rcheck-verdict" + (v && /^MATCH\b/.test(v) ? " ok" : "");
    e.hidden = !v;
  }
  function download() {
    var txt;
    try { txt = buildScript(); } catch (e) { setStatus(e.message); return; }
    var blob = new Blob([txt], { type: "text/x-r;charset=utf-8" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = FILE;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    setStatus("Downloaded " + FILE + ": run it with Rscript in R with EValue installed; its last line is MATCH n/n or MISMATCH.");
  }
  function loadRunner() {
    if (window.AlmWebR && typeof window.AlmWebR.runR === "function") return Promise.resolve(window.AlmWebR);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "../shared/webr-runner.js";
      s.onload = function () { window.AlmWebR ? resolve(window.AlmWebR) : reject(new Error("../shared/webr-runner.js loaded but AlmWebR is missing")); };
      s.onerror = function () { reject(new Error("Could not load ../shared/webr-runner.js")); };
      document.head.appendChild(s);
    });
  }
  function webrPackages() {
    return fetch(new URL("../r-shiny/shinylive/webr/repo/manifest.json", location.href).href, { redirect: "error" })
      .then(function (r) { if (!r.ok) throw new Error("WebR package list unavailable (HTTP " + r.status + ")"); return r.json(); })
      .then(function (m) { return (m.packages || []).map(function (p) { return p.package; }); });
  }
  // LIM-P22 F21: a verdict belongs to the result it was computed for. run() replaces
  // window.__almLastEValue's result object on every recomputation, so its identity
  // tells whether the page still shows the analysed result.
  function current() { return typeof window.__almLastEValue === "function" ? window.__almLastEValue() : null; }
  var STALE = "R result discarded: the inputs on the page changed while R was running, so the verdict R returned (for the earlier inputs) is not shown. Press Verify in R again.";
  var CHANGED = "The inputs changed after the last R check, so its verdict was cleared. Press Verify in R again.";
  var verdictFor;  // the result object the shown verdict checked (undefined = nothing shown)
  function invalidateIfChanged() {
    if (verdictFor === undefined || current() === verdictFor) return;
    verdictFor = undefined;
    var out = el("rcheck-out"); if (out) { out.hidden = true; out.textContent = ""; }
    showVerdict(null); setStatus(CHANGED);
  }
  ["input", "change", "click"].forEach(function (ev) { document.addEventListener(ev, invalidateIfChanged); });
  var busy = false;
  function verify() {
    if (busy) return;
    var script, snap = current();
    verdictFor = undefined;
    try { script = buildScript(); } catch (e) { setStatus(e.message); return; }
    busy = true; el("btn-verify-r").disabled = true;
    var out = el("rcheck-out"); out.hidden = true; out.textContent = ""; showVerdict(null);
    setStatus("Checking which R packages WebR can load...");
    webrPackages().then(function (have) {
      var missing = REQUIRED_PACKAGES.filter(function (p) { return have.indexOf(p) < 0; });
      if (missing.length) {
        setStatus("Verify in R cannot run in this browser: the R package " + missing.join(", ") +
          ", which this check uses (as the P22 validation did), is not in this site's pinned WebR package repository, so nothing was run in the browser." +
          " Use \"Download R script\" and run it in R with " + missing.join(", ") + " installed; its last line is MATCH n/n or MISMATCH.");
        return;
      }
      setStatus("Loading WebR (first run downloads R; this can take a few minutes)...");
      return loadRunner().then(function (W) {
        return W.runR({ script: script, packages: REQUIRED_PACKAGES, onStatus: setStatus });
      }).then(function (res) {
        if (!res.ok) throw new Error(res.error || "WebR failed");
        if (current() !== snap) { out.textContent = ""; showVerdict(null); setStatus(STALE); return; }
        out.hidden = false; out.textContent = res.stdout;
        showVerdict(verdictOf(res.stdout) || "MISMATCH (R printed no verdict line)");
        verdictFor = snap;
        setStatus((res.versions && res.versions.R || "R") + " in WebR " + (res.versions && res.versions.webR || "") + " ran the same script as the download.");
      });
    }).catch(function (e) {
      setStatus("Verify in R could not run: " + (e && e.message || e) + ". The downloaded R script remains the check.");
      showVerdict(null);
    }).then(function () { busy = false; el("btn-verify-r").disabled = false; });
  }
  var v = el("btn-verify-r"), d = el("btn-download-r");
  if (v) v.addEventListener("click", verify);
  if (d) d.addEventListener("click", download);
})();
