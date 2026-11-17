/* effect-size-converter/r-check.js -- "Verify in R" and "Download R script" for this page.
 *
 * Both buttons use ONE script, generated from the inputs behind the conversion table
 * now shown (window.__escAnalysed, recorded by runConvert) and the full-precision
 * rows behind it (window.__almResultRows), plus the E-value widget's inputs and result.
 * The script recomputes every displayed number in R, prints each next to the page's
 * value and the absolute difference, and ends with MATCH n/n or MISMATCH.
 *
 * Reference, as in the P20 validation: metafor (escalc: Hedges' J and g with the LS
 * variance, the HO mean-difference variance) and the published conversion formulas in
 * base R (OR<->RR<->RD at a fixed p0 with the delta method, the logit sqrt(3)/pi
 * OR<->SMD link, Wald 95% CIs); EValue 4.1.4 for the E-value widget.
 * When the SE (or g) was derived on the page from a CI, a Wald p-value, a t/F statistic
 * or an imported means/SD row, the script re-derives it in R too.
 *
 * "Verify in R" runs the same script in the browser with WebR through the unchanged
 * ../shared/webr-runner.js (loaded on first click). EValue is not in WebR's pinned
 * repository, so in the browser the E-value lines are reported NOT CHECKED, never faked.
 */
(function () {
  "use strict";

  var FILE = "effect-size-converter-check.R";
  var REQUIRED_PACKAGES = ["metafor"];
  var OPTIONAL_PACKAGES = ["EValue"];

  function rnum(x) { return (typeof x === "number" && isFinite(x)) ? String(x) : "NA"; }
  function rstr(s) {
    return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[^\x20-\x7e]/g, function (c) {
      return "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4);
    }) + '"';
  }
  function rvec(xs, f) { return "c(" + xs.map(f).join(", ") + ")"; }
  function fin(x) { return typeof x === "number" && isFinite(x) ? x : null; }

  var R_HELPERS = [
    "## ---- comparison helpers ----",
    ".n <- 0L; .ok <- 0L; .skipped <- character(0)",
    "fmtv <- function(x) if (length(x) != 1 || is.na(x)) \"NA\" else sprintf(\"%.10g\", x)",
    "# Half a unit of what the page shows. The table's fmt(): toFixed(3), but toExponential(2) (3 significant",
    "# digits) when |x| >= 1000 or 0 < |x| < 1e-3; the E-value widget: toFixed(3).",
    "shown_half <- function(x) if (is.na(x) || x == 0 || (abs(x) < 1000 && abs(x) >= 1e-3)) 5e-4 else 0.5 * 10^(floor(log10(abs(x))) - 2)",
    "check <- function(label, r, page, half = Inf) {",
    "  # |R - page| <= min(half, 1e-9 * max(1, |page|)): never looser than half a unit of the digits shown",
    "  # (a relative 1e-9 alone is looser for a tiny RD shown as 1.00e-07, or an E-value of 2e7 shown to 3 decimals)",
    "  if (length(r) != 1) r <- NA_real_",
    "  both_na <- is.na(r) && is.na(page)",
    "  d <- if (both_na) 0 else abs(r - page)",
    "  ok <- both_na || (!is.na(d) && d <= min(half, 1e-9 * max(1, abs(page))))",
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
    "  if (.n == 0L) cat(sprintf(\"MISMATCH (nothing could be checked)%s\\n\", extra))",
    "  else if (.ok == .n) cat(sprintf(\"MATCH %d/%d%s\\n\", .ok, .n, extra))",
    "  else cat(sprintf(\"MISMATCH (%d of %d quantities agree)%s\\n\", .ok, .n, extra))",
    "}",
  ].join("\n");

  // The R twin of the page's convert() + withCI(), line for line.
  var R_CONVERT = [
    "## ---- the conversions (metafor escalc + published formulas in base R) ----",
    "z <- qnorm(0.975)                 # Wald 95% CI",
    "COX <- sqrt(3) / pi               # logit (Hasselblad-Hedges) OR <-> SMD constant",
    "hedges_J <- function(n1, n2) {    # metafor's exact small-sample correction, via escalc(SMD) on d = 1",
    "  if (!(is.finite(n1) && is.finite(n2) && n1 == round(n1) && n2 == round(n2) && n1 >= 2 && n2 >= 2)) return(NA_real_)",
    "  as.numeric(metafor::escalc(\"SMD\", m1i = 1, sd1i = 1, n1i = n1, m2i = 0, sd2i = 1, n2i = n2)$yi)",
    "}",
    "md_se_HO <- function(sd, n1, n2)  # escalc(MD, vtype = \"HO\") with both groups at the pooled SD",
    "  sqrt(as.numeric(metafor::escalc(\"MD\", m1i = 0, sd1i = sd, n1i = n1, m2i = 0, sd2i = sd, n2i = n2, vtype = \"HO\")$vi))",
    "convert <- function(type, est, se, p0, sd, kind, n1, n2) {",
    "  out <- data.frame(scale = character(0), point = numeric(0), se = numeric(0), stringsAsFactors = FALSE)",
    "  push <- function(scale, point, se) out[nrow(out) + 1, ] <<- list(scale, point, se)",
    "  okp0 <- is.finite(p0) && p0 > 0 && p0 < 1",
    "  if (type == \"OR\") {",
    "    push(\"OR\", est, se); push(\"ln(OR)\", log(est), se)",
    "    if (okp0) {",
    "      rr <- est / (1 - p0 + p0 * est)",
    "      push(\"RR\", rr, abs(1 - p0 * rr) * se)            # delta method: d lnRR / d lnOR = 1 - p0 RR",
    "      push(\"RD\", est * p0 / (1 - p0 + est * p0) - p0, NA)",
    "    }",
    "    push(\"SMD (logit method)\", log(est) * COX, se * COX)",
    "  } else if (type == \"RR\") {",
    "    push(\"RR\", est, se); push(\"ln(RR)\", log(est), se)",
    "    if (okp0) {",
    "      p1 <- est * p0",
    "      if (!(p1 > 0 && p1 < 1)) push(\"OR\", NA, NA) else {",
    "        or <- est * (1 - p0) / (1 - est * p0); den <- 1 - p0 * est",
    "        if (abs(den) < 0.001) {",
    "          push(\"OR\", or, NA); push(\"RD\", (est - 1) * p0, NA); push(\"SMD (logit method via OR)\", log(or) * COX, NA)",
    "        } else {",
    "          push(\"OR\", or, se / abs(den)); push(\"RD\", (est - 1) * p0, NA)",
    "          push(\"SMD (logit method via OR)\", log(or) * COX, se / abs(den) * COX)",
    "        }",
    "      }",
    "    }",
    "  } else if (type == \"RD\") {",
    "    push(\"RD\", est, se)",
    "    if (okp0 && is.finite(est)) {",
    "      p1 <- p0 + est",
    "      if (p1 > 0 && p1 < 1) { push(\"RR (implied)\", p1 / p0, NA); push(\"OR (implied)\", (p1 / (1 - p1)) / (p0 / (1 - p0)), NA) }",
    "    }",
    "  } else if (type == \"SMD\") {",
    "    J <- hedges_J(n1, n2); okJ <- is.finite(J) && J > 0; oksd <- is.finite(sd) && sd > 0",
    "    if (kind == \"g\") {",
    "      push(\"SMD (Hedges' g)\", est, se)",
    "      if (okJ) {",
    "        push(\"SMD (Cohen's d, recovered)\", est / J, se / J)",
    "        if (oksd) push(\"MD\", est / J * sd, md_se_HO(sd, n1, n2))",
    "      }",
    "    } else {",
    "      push(\"SMD (Cohen's d)\", est, se)",
    "      if (okJ) push(\"SMD (Hedges' g)\", est * J, se * J)",
    "      if (oksd) { if (okJ) push(\"MD\", est * sd, md_se_HO(sd, n1, n2)) else push(\"MD\", est * sd, se * sd) }",
    "    }",
    "    push(\"OR (logit approximation)\", exp(est / COX), se / COX)",
    "  } else if (type == \"MD\") {",
    "    push(\"MD\", est, se)",
    "    if (is.finite(sd) && sd > 0) push(\"SMD (Cohen's d, uncorrected)\", est / sd, se / sd)",
    "  } else if (type == \"HR\") {",
    "    push(\"HR\", est, se); push(\"ln(HR)\", log(est), se)",
    "  } else if (type == \"IRR\") {",
    "    push(\"IRR\", est, se); push(\"ln(IRR)\", log(est), se)",
    "  }",
    "  # 95% CI: ratio rows on the log scale, all others on their own scale",
    "  ratio <- grepl(\"^(OR|RR|HR|IRR)(\\\\b|\\\\s|$)\", out$scale, perl = TRUE) & !is.na(out$point) & out$point > 0",
    "  has <- !is.na(out$se) & out$se > 0 & !is.na(out$point)",
    "  out$lo <- ifelse(has, ifelse(ratio, exp(log(out$point) - z * out$se), out$point - z * out$se), NA)",
    "  out$hi <- ifelse(has, ifelse(ratio, exp(log(out$point) + z * out$se), out$point + z * out$se), NA)",
    "  out",
    "}",
  ].join("\n");

  var lastCsvRow = null;
  function wrapCsv() {
    var orig = window.__almLoadCSV;
    if (typeof orig !== "function" || orig.__rcheck) return;
    var w = function (rows) { lastCsvRow = rows && rows.length ? Object.assign({}, rows[0]) : null; return orig.apply(this, arguments); };
    w.__rcheck = true;
    window.__almLoadCSV = w;
  }

  function el(id) { return document.getElementById(id); }
  function entered(id) { var e = el(id); return !!e && String(e.value).trim() !== ""; }

  // How the analysed estimate / SE came about, when the page derived it.
  function provenance(a) {
    var E = window.AlmEffectAccuracy;
    if (!E) return null;
    if (a.type === "SMD" && a.kind === "g" && lastCsvRow) {
      try {
        var r = lastCsvRow, s = E.fromMeans(Number(r.m1), Number(r.sd1), Number(r.n1), Number(r.m2), Number(r.sd2), Number(r.n2));
        // The import is the input only while every field it set is unchanged (g, SE, pooled SD, n1, n2);
        // after a later edit the table is checked as shown, without claiming the import.
        if (s.g === a.est && s.se === a.se && s.pooledSd === a.sd && Number(r.n1) === a.n1 && Number(r.n2) === a.n2)
          return { kind: "csv", m1: Number(r.m1), sd1: Number(r.sd1), n1: Number(r.n1), m2: Number(r.m2), sd2: Number(r.sd2), n2: Number(r.n2), pooledSd: s.pooledSd };
      } catch (_) { /* not derived from this row */ }
    }
    if (!entered("der-lo") && !entered("der-hi") && (entered("der-t") || entered("der-f")) && a.type === "SMD" && a.kind === "g") {
      try {
        var n1 = Number(el("der-n1").value), n2 = Number(el("der-n2").value), isT = entered("der-t");
        var st = isT ? E.fromT(Number(el("der-t").value), n1, n2) : E.fromF(Number(el("der-f").value), n1, n2, Number(el("der-f-sign").value));
        if (st.g === a.est && st.se === a.se)
          return isT ? { kind: "t", t: Number(el("der-t").value), n1: n1, n2: n2 }
            : { kind: "F", f: Number(el("der-f").value), sign: Number(el("der-f-sign").value), n1: n1, n2: n2 };
      } catch (_) { /* not derived from these fields */ }
    }
    if ((entered("der-lo") || entered("der-hi") || entered("der-p")) && typeof window.deriveSE === "function") {
      try {
        var se = window.deriveSE({ lo: parseFloat(el("der-lo").value), hi: parseFloat(el("der-hi").value), scale: el("der-scale").value,
          p: parseFloat(el("der-p").value), type: a.type, est: a.est });
        if (se === a.se) {
          var ci = Number.isFinite(parseFloat(el("der-lo").value)) || Number.isFinite(parseFloat(el("der-hi").value));
          return ci ? { kind: "ci", lo: parseFloat(el("der-lo").value), hi: parseFloat(el("der-hi").value), ratio: ["OR", "RR", "HR", "IRR"].indexOf(a.type) >= 0 }
            : { kind: "p", p: parseFloat(el("der-p").value), ratio: ["OR", "RR", "HR", "IRR"].indexOf(a.type) >= 0 };
        }
      } catch (_) { /* not derived from these fields */ }
    }
    return null;
  }

  function evState() {
    var r = typeof window.__almLastEValue === "function" ? window.__almLastEValue() : null;
    if (!r) return null;
    var meas = el("ev-measure").value;
    var lo = String(el("ev-lo").value).trim() === "" ? null : parseFloat(el("ev-lo").value);
    var hi = String(el("ev-hi").value).trim() === "" ? null : parseFloat(el("ev-hi").value);
    var needLo = r.rr.point >= 1, noCI = needLo ? (r.rr.lo == null) : (r.rr.hi == null);
    return { meas: meas, point: parseFloat(el("ev-point").value), lo: lo, hi: hi, rare: el("ev-rare").checked,
      ePoint: r.point, eCi: noCI ? null : r.ci, rr: meas !== "RR" ? r.rr.point : null };
  }

  function buildScript() {
    var a = typeof window.__escAnalysed === "function" ? window.__escAnalysed() : null;
    var rows = (window.__almResultRows || []).slice();
    var ev = evState();
    if ((!a || !rows.length) && !ev) throw new Error("The page shows no converted value or E-value for these inputs, so there is nothing to check in R.");
    var prov = a && rows.length ? provenance(a) : null;
    var build = window.AlmBuildInfo ? (window.AlmBuildInfo.version + " " + (window.AlmBuildInfo.shortSha || "")) : "unknown";
    var L = [];
    L.push("## Effect-size converter: R check of the numbers this page displays.");
    L.push("## Generated by the allmeta effect-size-converter page (build " + build.trim() + ") from the inputs behind the table now shown.");
    L.push("## Reference, as in the P20 validation: metafor (escalc: Hedges' J and g with the LS variance, the HO mean-difference");
    L.push("## variance) and the published conversion formulas written out in base R (OR<->RR<->RD at a fixed p0 with the");
    L.push("## delta method, the logit sqrt(3)/pi OR<->SMD link, Wald 95% CIs); EValue 4.1.4 for the E-value widget.");
    L.push("## Run with:  Rscript " + FILE + "   (needs metafor; EValue adds the E-value checks)");
    L.push("");
    L.push(R_HELPERS);
    L.push("");
    L.push(R_CONVERT);
    L.push("");
    L.push("cat(sprintf(\"R %s; metafor %s\\n\", getRversion(), if (requireNamespace(\"metafor\", quietly = TRUE)) as.character(packageVersion(\"metafor\")) else \"NOT INSTALLED\"))");
    if (a && rows.length) {
      L.push("## ---- inputs behind the conversion table (blank fields are NA) ----");
      L.push("inp <- list(type = " + rstr(a.type) + ", est = " + rnum(a.est) + ", se = " + rnum(a.se) + ", p0 = " + rnum(a.p0) + ", sd = " + rnum(a.sd) +
        ",\n            kind = " + rstr(a.kind) + ", n1 = " + rnum(a.n1) + ", n2 = " + rnum(a.n2) + ")");
      L.push("## ---- the page's table (full precision behind the displayed 3 decimals; NA = shown as a dash) ----");
      L.push("page <- data.frame(scale = " + rvec(rows, function (r) { return rstr(r.scale); }) +
        ",\n  point = " + rvec(rows, function (r) { return rnum(r.point); }) +
        ",\n  se = " + rvec(rows, function (r) { return rnum(r.se); }) +
        ",\n  lo = " + rvec(rows, function (r) { return rnum(r.lo); }) +
        ",\n  hi = " + rvec(rows, function (r) { return rnum(r.hi); }) + ", stringsAsFactors = FALSE)");
      L.push("if (!requireNamespace(\"metafor\", quietly = TRUE)) {");
      L.push("  for (s in page$scale) not_checked(paste(s, \"(point, SE, CI)\"), \"package metafor is not installed\")");
      L.push("} else {");
      if (prov) {
        L.push("  ## How the page derived its input, re-derived in R:");
        if (prov.kind === "csv") {
          L.push("  csv <- list(m1 = " + rnum(prov.m1) + ", sd1 = " + rnum(prov.sd1) + ", n1 = " + rnum(prov.n1) + ", m2 = " + rnum(prov.m2) + ", sd2 = " + rnum(prov.sd2) + ", n2 = " + rnum(prov.n2) + ")");
          L.push("  e <- with(csv, metafor::escalc(\"SMD\", m1i = m1, sd1i = sd1, n1i = n1, m2i = m2, sd2i = sd2, n2i = n2, vtype = \"LS\"))");
          L.push("  check(\"imported row: Hedges' g (escalc SMD)\", as.numeric(e$yi), inp$est)");
          L.push("  check(\"imported row: SE of g (escalc vtype LS)\", sqrt(as.numeric(e$vi)), inp$se)");
          L.push("  check(\"imported row: pooled SD\", with(csv, sqrt(((n1 - 1) * sd1^2 + (n2 - 1) * sd2^2) / (n1 + n2 - 2))), inp$sd)");
          L.push("  check(\"imported row: n1, n2 carried over\", as.numeric(csv$n1 == inp$n1 && csv$n2 == inp$n2), 1)");
        } else if (prov.kind === "t" || prov.kind === "F") {
          if (prov.kind === "t") L.push("  stat <- list(t = " + rnum(prov.t) + ", n1 = " + rnum(prov.n1) + ", n2 = " + rnum(prov.n2) + ")");
          else L.push("  stat <- list(F = " + rnum(prov.f) + ", direction = " + rnum(prov.sign) + ", n1 = " + rnum(prov.n1) + ", n2 = " + rnum(prov.n2) + ")");
          if (prov.kind === "F") L.push("  stat$t <- stat$direction * sqrt(stat$F)   # numerator df 1: t = direction * sqrt(F)");
          L.push("  e <- with(stat, metafor::escalc(\"SMD\", ti = t, n1i = n1, n2i = n2, vtype = \"LS\"))");
          L.push("  check(\"" + prov.kind + " statistic: Hedges' g (escalc SMD, ti)\", as.numeric(e$yi), inp$est)");
          L.push("  check(\"" + prov.kind + " statistic: SE of g (escalc vtype LS)\", sqrt(as.numeric(e$vi)), inp$se)");
        } else if (prov.kind === "ci") {
          L.push("  ci <- c(lo = " + rnum(prov.lo) + ", hi = " + rnum(prov.hi) + ")" + (prov.ratio ? "   # on the ratio scale" : ""));
          L.push("  check(\"SE derived from the 95% CI\", " + (prov.ratio ? "(log(ci[[\"hi\"]]) - log(ci[[\"lo\"]])) / (2 * z)" : "(ci[[\"hi\"]] - ci[[\"lo\"]]) / (2 * z)") + ", inp$se)");
        } else if (prov.kind === "p") {
          L.push("  p <- " + rnum(prov.p) + "   # two-sided Wald p-value");
          L.push("  check(\"SE derived from the Wald p-value\", " + (prov.ratio ? "abs(log(inp$est))" : "abs(inp$est)") + " / qnorm(p / 2, lower.tail = FALSE), inp$se)");
        }
      }
      L.push("  r <- with(inp, convert(type, est, se, p0, sd, kind, n1, n2))");
      L.push("  check(\"rows shown (same scales, same order; 1 = yes)\", as.numeric(identical(r$scale, page$scale)), 1)");
      L.push("  for (i in seq_len(min(nrow(r), nrow(page)))) if (r$scale[i] == page$scale[i]) {");
      L.push("    check(paste(page$scale[i], \"point\"), r$point[i], page$point[i], shown_half(page$point[i])); check(paste(page$scale[i], \"SE\"), r$se[i], page$se[i], shown_half(page$se[i]))");
      L.push("    check(paste(page$scale[i], \"CI lower\"), r$lo[i], page$lo[i], shown_half(page$lo[i])); check(paste(page$scale[i], \"CI upper\"), r$hi[i], page$hi[i], shown_half(page$hi[i]))");
      L.push("  }");
      L.push("}");
    } else {
      L.push("## The conversion table is empty for the current inputs (the page refused them); only the E-value widget is checked.");
    }
    if (ev) {
      L.push("");
      L.push("## ---- E-value widget (EValue; a d is mapped pointwise through exp(0.91 d) with evalues.MD, as in the P22 validation) ----");
      L.push("ev <- list(measure = " + rstr(ev.meas) + ", point = " + rnum(fin(ev.point)) + ", lo = " + rnum(fin(ev.lo)) + ", hi = " + rnum(fin(ev.hi)) + ", rare = " + (ev.rare ? "TRUE" : "FALSE") + ")");
      L.push("ev_page <- c(e_point = " + rnum(ev.ePoint) + ", e_ci = " + rnum(ev.eCi) + (ev.rr != null ? ", rr = " + rnum(ev.rr) : "") + ")");
      L.push("ev_lab <- c(e_point = \"E-value (point)\", e_ci = \"E-value (CI bound nearest null)\", rr = \"E-value widget: approx RR\")");
      L.push("if (!requireNamespace(\"EValue\", quietly = TRUE)) {");
      L.push("  for (k in names(ev_page)) not_checked(ev_lab[[k]], \"package EValue is not installed\")");
      L.push("} else with(ev, {");
      L.push("  q <- function(e) suppressMessages(suppressWarnings(e))");
      L.push("  cat(sprintf(\"EValue %s\\n\", packageVersion(\"EValue\")))");
      L.push("  if (measure == \"SMD\") {");
      L.push("    md <- function(v) q(EValue::evalues.MD(est = v))");
      L.push("    m <- md(point); b <- if (point >= 0) lo else hi             # the bound nearest the null");
      L.push("    ci <- if (is.na(b)) NA else if ((point >= 0 && b <= 0) || (point < 0 && b >= 0)) 1 else md(b)[2, 1]");
      L.push("    R <- c(e_point = m[2, 1], e_ci = ci, rr = m[1, 1])");
      L.push("  } else {");
      L.push("    f <- getExportedValue(\"EValue\", paste0(\"evalues.\", measure))");
      L.push("    a <- list(est = point, lo = lo, hi = hi); if (measure != \"RR\") a$rare <- rare");
      L.push("    m <- q(do.call(f, a)); e <- m[2, 2:3]; e <- e[!is.na(e)]");
      L.push("    R <- c(e_point = m[2, 1], e_ci = if (length(e)) e[[1]] else NA, rr = m[1, 1])");
      L.push("  }");
      L.push("  for (k in names(ev_page)) check(ev_lab[[k]], unname(R[[k]]), unname(ev_page[[k]]), 5e-4)   # the widget shows 3 decimals");
      L.push("})");
    }
    L.push("finish()");
    return L.join("\n") + "\n";
  }
  window.__escRScript = buildScript;

  // ---- UI -----------------------------------------------------------------
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
    setStatus("Downloaded " + FILE + ": run it with Rscript (metafor; EValue for the E-value lines); its last line is MATCH n/n or MISMATCH.");
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
  // Identity of what the script was built from: run/render replace these objects on every new analysis.
  function snapshot() {
    return [typeof window.__escAnalysed === "function" ? window.__escAnalysed() : null, window.__almResultRows,
      typeof window.__almLastEValue === "function" ? window.__almLastEValue() : null];
  }
  function sameSnapshot(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }
  var STALE = "R result discarded: the analysis on the page changed while R was running, so the verdict R returned (for the earlier analysis) is not shown. Press Verify in R again.";
  var busy = false;
  function verify() {
    if (busy) return;
    var script, snap = snapshot();
    try { script = buildScript(); } catch (e) { setStatus(e.message); return; }
    busy = true; el("btn-verify-r").disabled = true;
    var out = el("rcheck-out"); out.hidden = true; out.textContent = ""; showVerdict(null);
    setStatus("Checking which R packages WebR can load...");
    webrPackages().then(function (have) {
      var missingReq = REQUIRED_PACKAGES.filter(function (p) { return have.indexOf(p) < 0; });
      if (missingReq.length) {
        setStatus("Verify in R cannot run in this browser: the R package " + missingReq.join(", ") + " is not available in WebR. Nothing was run. Use \"Download R script\" and run it in R.");
        return;
      }
      var missing = OPTIONAL_PACKAGES.filter(function (p) { return have.indexOf(p) < 0; });
      var use = REQUIRED_PACKAGES.concat(OPTIONAL_PACKAGES.filter(function (p) { return have.indexOf(p) >= 0; }));
      setStatus("Loading WebR and metafor (first run downloads R; this can take a few minutes)...");
      return loadRunner().then(function (W) {
        return W.runR({ script: script, packages: use, onStatus: setStatus });
      }).then(function (res) {
        if (!res.ok) throw new Error(res.error || "WebR failed");
        // R answered for the analysis it was given; if the page has moved on, never show that answer beside the new one.
        if (!sameSnapshot(snap, snapshot())) { out.textContent = ""; showVerdict(null); setStatus(STALE); return; }
        out.hidden = false; out.textContent = res.stdout;
        showVerdict(verdictOf(res.stdout) || "MISMATCH (R printed no verdict line)");
        setStatus((res.versions && res.versions.R || "R") + " in WebR " + (res.versions && res.versions.webR || "") +
          (res.versions && res.versions.metafor ? ", metafor " + res.versions.metafor : "") + ", ran the same script as the download." +
          (missing.length ? " Not available in WebR: " + missing.join(", ") + " (the E-value lines show NOT CHECKED; run the downloaded script in R with " + missing.join(", ") + " installed to check them)." : ""));
      });
    }).catch(function (e) {
      setStatus("Verify in R could not run: " + (e && e.message || e) + ". The downloaded R script remains the check.");
      showVerdict(null);
    }).then(function () { busy = false; el("btn-verify-r").disabled = false; });
  }
  wrapCsv();
  var v = el("btn-verify-r"), d = el("btn-download-r");
  if (v) v.addEventListener("click", verify);
  if (d) d.addEventListener("click", download);
})();
