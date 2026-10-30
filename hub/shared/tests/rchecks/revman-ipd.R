# Independent check of the RevMan IPD (O-E and variance) import.
# Reads the SAME synthetic fixture with meta::read.rm5 and compares it with the values the app's parser
# (shared/alm-revman.js) exported via unit/alm-revman-ipd.test.mjs to rchecks-out/revman-ipd/.
# O-E and V must be identical doubles; est = (O-E)/V and se = 1/sqrt(V) must agree to 1e-9.
# R_CHECK_PASS is printed only if every comparison passes AND a planted wrong row is detected.
script_arg <- grep("^--file=", commandArgs(), value = TRUE)
if (length(script_arg) != 1L) stop("Run this file with Rscript")
here <- dirname(normalizePath(sub("^--file=", "", script_arg), mustWork = TRUE))
fixture <- file.path(here, "..", "fixtures", "revman-ipd", "ipd.rm5")
out <- file.path(here, "..", "rchecks-out", "revman-ipd")
if (!requireNamespace("meta", quietly = TRUE)) stop("meta is required")
assert <- function(ok, message) if (length(ok) != 1L || is.na(ok) || !ok) stop(message, call. = FALSE)
for (f in c("app-ipd.csv", "fixture.md5")) assert(file.exists(file.path(out, f)), paste("Missing app witness", f, "- run unit/alm-revman-ipd.test.mjs first"))
assert(identical(readLines(file.path(out, "fixture.md5"), warn = FALSE), unname(tools::md5sum(fixture))), "App witness was made from different fixture bytes")

rm5 <- meta::read.rm5(fixture)
cat("meta", as.character(packageVersion("meta")), "rows", nrow(rm5), "\n")
assert(sum(rm5$type == "D") == 3L, "meta did not read the 3 dichotomous rows")
ref <- rm5[rm5$type == "I" & !is.na(rm5$O.E), , drop = FALSE]
assert(nrow(ref) == 4L, "meta did not read 4 IPD rows")
# read.rm5 merges study metadata by id, so restore a defined order (fixture ids ascend within each subgroup).
ref <- ref[order(ref$group.no, ref$id), , drop = FALSE]
ref <- data.frame(subgroup = sub("^[0-9.]+ ", "", ref$grplab), studyId = ref$id, study = ref$studlab, year = ref$year,
                  o_e = ref$O.E, var = ref$V, est = ref$O.E / ref$V, se = 1 / sqrt(ref$V), stringsAsFactors = FALSE)

app <- read.csv(file.path(out, "app-ipd.csv"), colClasses = "character", check.names = FALSE, encoding = "UTF-8")
for (n in c("o_e", "var", "est", "se")) app[[n]] <- as.numeric(app[[n]])

compare <- function(a, r) {
  assert(nrow(a) == nrow(r), "Mismatch: row count")
  for (k in c("subgroup", "studyId", "study", "year")) assert(identical(a[[k]], r[[k]]), paste("Mismatch:", k))
  for (k in c("o_e", "var")) assert(identical(a[[k]], r[[k]]), paste("Mismatch (exact):", k))
  d <- c(est = max(abs(a$est - r$est)), se = max(abs(a$se - r$se)))
  assert(all(is.finite(d)) && all(d <= 1e-9), paste("Mismatch (1e-9): est", d[["est"]], "se", d[["se"]]))
  d
}
d <- compare(app, ref)
for (i in seq_len(nrow(ref))) cat("PASS", ref$studyId[i], "O-E", format(ref$o_e[i], digits = 17), "V", format(ref$var[i], digits = 17),
                                 "est", format(app$est[i], digits = 17), "se", format(app$se[i], digits = 17), "\n")
cat("MAX_ABS_DIFF est", d[["est"]], "se", d[["se"]], "\n")

planted <- app; planted[2, c("o_e", "var", "est", "se")] <- planted[3, c("o_e", "var", "est", "se")]
plant_detected <- tryCatch({ compare(planted, ref); FALSE }, error = function(e) grepl("^Mismatch", conditionMessage(e)))
assert(plant_detected, "Planted wrong row was not detected")
cat("PLANT_DETECTED\n")
cat("R_CHECK_PASS\n")
