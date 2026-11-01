# Independent check of the legacy RevMan reader (shared/revman-reader.js, used by revman-importer) on
# fixtures/revman-legacy/legacy.rm5: CONT_OUTCOME, IV_OUTCOME, child-element NAME/GROUP_LABEL, YEAR, and planted
# invalid rows. Reads the SAME file with meta::read.rm5 and compares with what unit/revman-reader-legacy.test.mjs
# exported to rchecks-out/revman-legacy/ (bound to the fixture bytes by md5).
#  - Every row meta reads is either imported by the reader or listed in its skipped list, never both, never neither.
#  - Imported rows: comparison/outcome/arm labels, study name and year identical; means, SDs, Ns and events identical
#    doubles; est/se agree to 1e-9 (IV: EFFECT_SIZE/SE as stored; IPD: (O-E)/V and 1/sqrt(V)).
#  - Skipped rows: meta's treatment is documented, not imitated. read.rm5 refuses nothing and keeps each such row with
#    NA (absent attribute) or the stored non-positive value; each reason the reader gives must match that row in meta.
# R_CHECK_PASS is printed only if all of that holds AND two planted defects (a wrong value, a silently dropped row)
# are detected.
script_arg <- grep("^--file=", commandArgs(), value = TRUE)
if (length(script_arg) != 1L) stop("Run this file with Rscript")
here <- dirname(normalizePath(sub("^--file=", "", script_arg), mustWork = TRUE))
fixture <- file.path(here, "..", "fixtures", "revman-legacy", "legacy.rm5")
out <- file.path(here, "..", "rchecks-out", "revman-legacy")
if (!requireNamespace("meta", quietly = TRUE)) stop("meta is required")
assert <- function(ok, message) if (length(ok) != 1L || is.na(ok) || !ok) stop(message, call. = FALSE)
for (f in c("legacy-rows.csv", "legacy-skipped.csv", "legacy-fixture.md5"))
  assert(file.exists(file.path(out, f)), paste("Missing legacy witness", f, "- run unit/revman-reader-legacy.test.mjs first"))
assert(identical(readLines(file.path(out, "legacy-fixture.md5"), warn = FALSE), unname(tools::md5sum(fixture))),
       "Legacy witness was made from different fixture bytes")

rm5 <- as.data.frame(unclass(meta::read.rm5(fixture, numbers.in.labels = FALSE)), stringsAsFactors = FALSE)
cat("meta", as.character(packageVersion("meta")), "rows", nrow(rm5), "\n")
# The reader's outcome types, identified in meta by type and by which columns RevMan filled (IV and IPD are both "I").
rm5$rtype <- ifelse(rm5$type == "D", "binary", ifelse(rm5$type == "C", "continuous",
             ifelse(rm5$type == "I" & is.na(rm5$TE) & (!is.na(rm5$O.E) | !is.na(rm5$V)), "o_e_var", "generic_iv")))
key <- function(type, outcome, id) paste(type, outcome, id, sep = " | ")
rm5$key <- key(rm5$rtype, rm5$outclab, rm5$id)
assert(!anyDuplicated(rm5$key), "Fixture rows are not unique by type/outcome/study")

num <- c("year", "mean_e", "sd_e", "n_e", "mean_c", "sd_c", "n_c", "event_e", "event_c", "o_e", "var", "est", "se")
read_rows <- function() {
  a <- read.csv(file.path(out, "legacy-rows.csv"), colClasses = "character", check.names = FALSE, encoding = "UTF-8")
  for (n in setdiff(num, "year")) a[[n]] <- suppressWarnings(as.numeric(a[[n]]))
  a
}
rows <- read_rows()
skipped <- read.csv(file.path(out, "legacy-skipped.csv"), colClasses = "character", check.names = FALSE, encoding = "UTF-8")
# meta column for each RevMan attribute the reader names in a reason.
col <- c(MEAN_1 = "mean.e", SD_1 = "sd.e", TOTAL_1 = "n.e", MEAN_2 = "mean.c", SD_2 = "sd.c", TOTAL_2 = "n.c",
         EVENTS_1 = "event.e", EVENTS_2 = "event.c", EFFECT_SIZE = "TE", SE = "seTE", O_E = "O.E", VAR = "V")
usable <- function(r) switch(r$rtype,
  binary = all(!is.na(c(r$event.e, r$n.e, r$event.c, r$n.c))),
  continuous = all(!is.na(c(r$mean.e, r$sd.e, r$n.e, r$mean.c, r$sd.c, r$n.c))) && all(c(r$sd.e, r$sd.c, r$n.e, r$n.c) > 0),
  generic_iv = !is.na(r$TE) && !is.na(r$seTE) && r$seTE > 0,
  o_e_var = !is.na(r$O.E) && !is.na(r$V) && r$V > 0)

check <- function(a, s) {
  ka <- key(a$type, a$outcome, a$studyId); ks <- key(s$type, s$outcome, s$studyId)
  assert(!anyDuplicated(c(ka, ks)), "Mismatch: a row is both imported and skipped (or repeated)")
  assert(setequal(c(ka, ks), rm5$key) && length(c(ka, ks)) == nrow(rm5),
         paste("Mismatch: rows meta reads vs rows the reader imported or listed as skipped:",
               paste(setdiff(rm5$key, c(ka, ks)), collapse = "; ")))
  d <- c(est = 0, se = 0)
  for (i in seq_len(nrow(a))) {
    r <- rm5[match(ka[i], rm5$key), ]
    assert(usable(r), paste("Mismatch: reader imported a row meta shows as unusable:", ka[i]))
    for (k in c("comparison", "label_e", "label_c", "study", "year"))
      assert(identical(a[[k]][i], c(comparison = r$complab, label_e = r$label.e, label_c = r$label.c, study = r$studlab, year = r$year)[[k]]),
             paste("Mismatch:", k, ka[i]))
    exact <- switch(a$type[i],
      continuous = c(mean_e = "mean.e", sd_e = "sd.e", n_e = "n.e", mean_c = "mean.c", sd_c = "sd.c", n_c = "n.c"),
      binary = c(event_e = "event.e", n_e = "n.e", event_c = "event.c", n_c = "n.c"),
      o_e_var = c(o_e = "O.E", var = "V"), generic_iv = character(0))
    for (k in names(exact)) assert(identical(a[[k]][i], as.numeric(r[[exact[[k]]]])), paste("Mismatch (exact):", k, ka[i]))
    if (a$type[i] %in% c("generic_iv", "o_e_var")) {
      ref <- if (a$type[i] == "generic_iv") c(r$TE, r$seTE) else c(r$O.E / r$V, 1 / sqrt(r$V))
      dd <- abs(c(a$est[i], a$se[i]) - ref)
      assert(all(is.finite(dd)) && all(dd <= 1e-9), paste("Mismatch (1e-9): est/se", ka[i]))
      d <- pmax(d, dd)
    }
  }
  for (i in seq_len(nrow(s))) {
    r <- rm5[match(ks[i], rm5$key), ]
    assert(!usable(r), paste("Mismatch: reader skipped a row meta shows as usable:", ks[i]))
    for (part in strsplit(s$reason[i], "; ", fixed = TRUE)[[1]]) {
      f <- sub(" .*$", "", part); assert(f %in% names(col), paste("Mismatch: unknown field in reason", part))
      v <- r[[col[[f]]]]
      if (grepl(" missing$", part)) assert(is.na(v), paste("Mismatch: reader says missing, meta has a value:", ks[i], part))
      else {
        stored <- as.numeric(sub("^.*\\(is (.*)\\)$", "\\1", part))
        assert(grepl(" must be > 0 \\(is ", part) && identical(v, stored) && v <= 0, paste("Mismatch: reason vs meta value:", ks[i], part))
      }
    }
  }
  d
}
d <- check(rows, skipped)
for (i in seq_len(nrow(rows))) cat("PASS imported", rows$type[i], rows$studyId[i], rows$outcome[i], "\n")
for (i in seq_len(nrow(skipped))) cat("PASS skipped", skipped$type[i], skipped$studyId[i], "row", skipped$row[i], ":", skipped$reason[i], "\n")
cat("META_KEEPS_INVALID", sum(!vapply(seq_len(nrow(rm5)), function(i) usable(rm5[i, ]), logical(1))),
    "rows (read.rm5 refuses none; NA or stored value)\n")
cat("COUNTS meta", nrow(rm5), "imported", nrow(rows), "skipped", nrow(skipped), "\n")
cat("MAX_ABS_DIFF legacy est", d[["est"]], "se", d[["se"]], "\n")

planted <- rows; i <- which(planted$type == "continuous")[2]; planted$sd_c[i] <- planted$sd_c[i] + 0.01
p1 <- tryCatch({ check(planted, skipped); FALSE }, error = function(e) grepl("^Mismatch", conditionMessage(e)))
assert(p1, "Planted wrong value was not detected")
p2 <- tryCatch({ check(rows, skipped[-1, , drop = FALSE]); FALSE }, error = function(e) grepl("^Mismatch", conditionMessage(e)))
assert(p2, "Planted silently dropped row was not detected")
cat("PLANT_DETECTED wrong-value dropped-row\n")
cat("R_CHECK_PASS\n")
