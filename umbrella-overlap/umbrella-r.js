/* umbrella-overlap/umbrella-r.js — the page's R check (app-local).
 *
 * buildScript(text, result) returns a self-contained base-R script that
 *   1. re-parses the page's CURRENT input text with the page's documented rules,
 *   2. recomputes every number the page displays (CCA, groove, counts, the
 *      pairwise shared-study matrix, the most-shared studies and their counts),
 *   3. prints each quantity next to the page's value with |difference|, and
 *   4. ends with "MATCH n/n" only if every comparison holds, else "MISMATCH k/n".
 *
 * The P34 pack validates CCA against the closed-form Pieper (2014) formula, so the
 * script is base R only (no package). The same script runs in the browser through
 * shared/webr-runner.js (AlmWebR.runR) and in desktop Rscript.
 * Dual-mode: browser global window.AlmUmbrellaR; Node require().
 */
(function (global) {
  "use strict";

  // R string literal: escape \ and " and control characters; non-ASCII as \u{....}/\U{........}.
  function rStr(s) {
    var out = '"';
    for (var ch of String(s)) {
      var cp = ch.codePointAt(0);
      if (ch === "\\") out += "\\\\";
      else if (ch === '"') out += '\\"';
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (cp < 0x20 || cp === 0x7f) out += "\\u{" + cp.toString(16) + "}";
      else if (cp > 0xffff) out += "\\U{" + cp.toString(16) + "}";
      else if (cp > 0x7e) out += "\\u{" + cp.toString(16) + "}";
      else out += ch;
    }
    return out + '"';
  }
  function rVecStr(a) { return "c(" + a.map(rStr).join(", ") + ")"; }
  function rVecInt(a) { return "c(" + a.map(function (v) { return String(v | 0) + "L"; }).join(", ") + ")"; }

  function buildScript(text, r) {
    if (!r || !r.ok) throw new Error("Compute CCA first (need >= 2 reviews).");
    var c = r.nReviews;
    var mat = [];
    for (var i = 0; i < c; i++) for (var j = 0; j < c; j++) mat.push(r.matrix[i][j]);
    var shownIds = r.mostShared.slice();
    var shownFreq = shownIds.map(function (id) { return r.frequency[id]; });
    var L = [];
    L.push("# Umbrella overlap (allmeta umbrella-overlap) — independent check in R.");
    L.push("# Generated " + new Date().toISOString() + " from the page's CURRENT input.");
    L.push("# Method: Corrected Covered Area, Pieper et al. J Clin Epidemiol 2014:");
    L.push("#   CCA = (N - r) / (r*c - r), N = citations, r = unique primary studies, c = reviews.");
    L.push("# The P34 pack validates CCA against this closed-form formula, written here in base R");
    L.push("# (no package needed). Run with: Rscript --vanilla umbrella-cca-check.R");
    L.push("");
    L.push("input_text <- " + rStr(text));
    L.push("");
    L.push("# ---- values the page displayed (full precision where the page holds it) ----");
    L.push("page <- list(");
    L.push("  cca = " + r.cca.toPrecision(17) + ",");
    L.push("  cca_pct_shown = " + rStr((r.cca * 100).toFixed(1)) + ",");
    L.push("  groove = " + rStr(r.groove) + ",");
    L.push("  n_reviews = " + r.nReviews + "L, n_unique = " + r.nUnique + "L, n_citations = " + r.nTotal + "L, n_shared = " + r.sharedCount + "L,");
    L.push("  labels = " + rVecStr(r.labels) + ",");
    L.push("  matrix = matrix(" + rVecInt(mat) + ", nrow = " + c + "L, byrow = TRUE),");
    L.push("  most_shared_ids = " + (shownIds.length ? rVecStr(shownIds) : "character(0)") + ",");
    L.push("  most_shared_freq = " + (shownFreq.length ? rVecInt(shownFreq) : "integer(0)"));
    L.push(")");
    L.push("");
    L.push("# ---- parse the input with the page's documented rules ----");
    L.push("# one review per line 'label: id, id, ...'; lines starting with # are skipped; if any line");
    L.push("# separates ids with , or ; every line is split on those only, else on whitespace.");
    // Non-ASCII members as R \u escapes so the pattern is UTF-8 and PCRE runs in UTF mode.
    L.push("ws <- \"[\\\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]\"  # JavaScript's \\\\s set");
    L.push("trim <- function(s) gsub(paste0(\"^\", ws, \"+|\", ws, \"+$\"), \"\", s, perl = TRUE)");
    L.push("lines <- trim(strsplit(input_text, \"\\r?\\n\", perl = TRUE)[[1]])");
    L.push("lines <- lines[nzchar(lines) & substr(lines, 1, 1) != \"#\"]");
    L.push("has_colon <- regexpr(\":\", lines, fixed = TRUE)");
    L.push("lab <- ifelse(has_colon > 0, trim(substr(lines, 1, has_colon - 1)), \"\")");
    L.push("rest <- ifelse(has_colon > 0, substr(lines, has_colon + 1, nchar(lines)), lines)");
    L.push("delim <- if (any(grepl(\"[,;]\", rest))) \"[,;]\" else paste0(ws, \"+\")");
    L.push("reviews <- list(); labels <- character(0)");
    L.push("for (i in seq_along(rest)) {");
    L.push("  ids <- trim(gsub(paste0(ws, \"+\"), \" \", strsplit(rest[i], delim, perl = TRUE)[[1]], perl = TRUE))");
    L.push("  ids <- unique(ids[nzchar(ids)])");
    L.push("  if (length(ids)) { reviews[[length(reviews) + 1]] <- ids; labels <- c(labels, lab[i]) }");
    L.push("}");
    L.push("n_rev <- length(reviews)");
    L.push("labels <- ifelse(nzchar(labels), labels, paste(\"Review\", seq_len(n_rev)))");
    L.push("");
    L.push("# ---- recompute ----");
    L.push("all_ids <- unique(unlist(reviews))");
    L.push("N <- sum(lengths(reviews)); r <- length(all_ids); cc <- n_rev");
    L.push("cca <- if (r * cc - r > 0) (N - r) / (r * cc - r) else 0");
    L.push("cca <- max(0, min(1, cca))");
    L.push("groove <- if (cca < 0.05) \"Slight\" else if (cca < 0.10) \"Moderate\" else if (cca < 0.15) \"High\" else \"Very High\"");
    L.push("M <- matrix(0L, cc, cc); for (i in seq_len(cc)) for (j in seq_len(cc)) M[i, j] <- length(intersect(reviews[[i]], reviews[[j]]))");
    L.push("freq <- sapply(all_ids, function(id) sum(vapply(reviews, function(s) id %in% s, logical(1))))");
    L.push("shared <- freq[freq > 1]");
    L.push("");
    L.push("# ---- compare ----");
    L.push("n_ok <- 0L; n_all <- 0L");
    L.push("chk <- function(name, pg, rv, ok, d = NA) {");
    L.push("  n_all <<- n_all + 1L; if (isTRUE(ok)) n_ok <<- n_ok + 1L");
    L.push("  cat(sprintf(\"%-34s page=%-14s R=%-14s |diff|=%-9s %s\\n\", name, pg, rv, if (is.na(d)) \"-\" else format(d, digits = 3), if (isTRUE(ok)) \"OK\" else \"DIFF\"))");
    L.push("}");
    L.push("cat(R.version.string, \"\\n\")");
    L.push("chk(\"reviews (c)\", page$n_reviews, cc, page$n_reviews == cc, abs(page$n_reviews - cc))");
    L.push("chk(\"unique studies (r)\", page$n_unique, r, page$n_unique == r, abs(page$n_unique - r))");
    L.push("chk(\"citations (N)\", page$n_citations, N, page$n_citations == N, abs(page$n_citations - N))");
    L.push("chk(\"studies cited by >1 review\", page$n_shared, length(shared), page$n_shared == length(shared), abs(page$n_shared - length(shared)))");
    L.push("chk(\"CCA (full precision)\", format(page$cca, digits = 15), format(cca, digits = 15), abs(page$cca - cca) <= 1e-12, abs(page$cca - cca))");
    L.push(R_JS_TO_FIXED);
    L.push("chk(\"CCA % as displayed (1 dp)\", page$cca_pct_shown, js_to_fixed(100 * cca, 1), page$cca_pct_shown == js_to_fixed(100 * cca, 1))");
    L.push("chk(\"groove\", page$groove, groove, page$groove == groove)");
    L.push("chk(\"review labels\", paste(page$labels, collapse = \" | \"), paste(labels, collapse = \" | \"), identical(page$labels, labels))");
    L.push("if (identical(dim(page$matrix), dim(M))) {");
    L.push("  for (i in seq_len(cc)) for (j in seq_len(cc)) if (j >= i)");
    L.push("    chk(sprintf(\"shared studies [%d,%d]\", i, j), page$matrix[i, j], M[i, j], page$matrix[i, j] == M[i, j], abs(page$matrix[i, j] - M[i, j]))");
    L.push("} else chk(\"pairwise matrix size\", paste(dim(page$matrix), collapse = \"x\"), paste(dim(M), collapse = \"x\"), FALSE)");
    L.push("# most-shared list: page shows up to 10 multiply-cited studies, most-cited first");
    L.push("chk(\"most-shared: number shown\", length(page$most_shared_ids), min(10L, length(shared)), length(page$most_shared_ids) == min(10L, length(shared)))");
    L.push("for (k in seq_along(page$most_shared_ids)) { id <- page$most_shared_ids[k]; rv <- if (id %in% names(freq)) freq[[id]] else NA");
    L.push("  chk(paste0(\"citations of study \", id), page$most_shared_freq[k], rv, isTRUE(page$most_shared_freq[k] == rv), abs(page$most_shared_freq[k] - rv)) }");
    L.push("unshown <- shared[!(names(shared) %in% page$most_shared_ids)]");
    L.push("chk(\"most-shared: no unshown study cited more\", if (length(page$most_shared_freq)) min(page$most_shared_freq) else NA, if (length(unshown)) max(unshown) else NA,");
    L.push("    !length(unshown) || (length(page$most_shared_freq) && min(page$most_shared_freq) >= max(unshown)))");
    L.push("cat(if (n_ok == n_all) sprintf(\"MATCH %d/%d\\n\", n_ok, n_all) else sprintf(\"MISMATCH %d/%d\\n\", n_ok, n_all))");
    return L.join("\n") + "\n";
  }

  // The page shows (x).toFixed(d): the exact binary value rounded, an exact tie going AWAY from zero
  // ((6.25).toFixed(1) = "6.3"). R's sprintf rounds an exact tie to even ("6.2"), so the script
  // rounds the page's way. sprintf is exact on the binary value, so only true ties need handling.
  var R_JS_TO_FIXED = String.raw`# JavaScript Number.prototype.toFixed(d), which the page uses to display the value
js_to_fixed <- function(x, d) {
  if (is.na(x)) return("NaN")
  if (is.infinite(x)) return(if (x > 0) "Infinity" else "-Infinity")
  s <- if (x < 0) "-" else ""; a <- abs(x)
  t <- sprintf(paste0("%.", d + 1, "f"), a)
  tie <- substring(t, nchar(t)) == "5" && sprintf(paste0("%.", d + 40, "f"), a) == paste0(t, strrep("0", 39))
  if (!tie) return(paste0(s, sprintf(paste0("%.", d, "f"), a)))
  ch <- strsplit(substr(t, 1, nchar(t) - 1), "")[[1]]; i <- length(ch); carry <- TRUE
  while (carry && i >= 1) {
    if (ch[i] == ".") { i <- i - 1; next }
    if (ch[i] == "9") { ch[i] <- "0"; i <- i - 1 } else { ch[i] <- as.character(as.integer(ch[i]) + 1L); carry <- FALSE }
  }
  u <- paste0(if (carry) "1" else "", paste(ch, collapse = ""))
  paste0(s, sub("\\.$", "", u))
}`;

  var api = { buildScript: buildScript, rStr: rStr, R_JS_TO_FIXED: R_JS_TO_FIXED };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmUmbrellaR = api;
})(typeof window !== "undefined" ? window : globalThis);
