# extract_pairwise70.R — Export study-level (yi, vi) log-OR data from the
# Pairwise70 Cochrane corpus to a tidy CSV for the truth-recovery estimator.
#
# Derivation mirrors the canonical Pairwise70/SYNTHESIS benchmark EXACTLY:
#   * per review, take the FIRST analysis (Analysis.number[1]) — the primary
#     outcome the review reports first;
#   * binary outcomes only (require Experimental.cases/N, Control.cases/N);
#   * log-OR effect size with the standard add=1/2, to="only0" continuity
#     correction (0.5 added ONLY to studies with a zero cell), computed directly
#     from the 2x2 cells (identical to metafor::escalc(measure="OR")):
#       yi = log( (a*d) / (b*c) ),  vi = 1/a + 1/b + 1/c + 1/d
#     with a=Exp.cases, b=Exp.N-Exp.cases, c=Ctrl.cases, d=Ctrl.N-Ctrl.cases.
#   * keep reviews with >= 3 usable studies.
#
# No known truth here — this is a descriptive real-data comparison. The log-OR
# scale matches the simulation DGP's "effect on a continuous scale" assumption.
# (metafor is not required; the closed-form escalc OR is used and unit-checked
#  against published values in the Python loader.)
#
# Usage:
#   Rscript extract_pairwise70.R <pairwise70_data_dir> <out_csv>

# Closed-form escalc(measure="OR", add=1/2, to="only0").
escalc_or <- function(ai, n1i, ci, n2i) {
  bi <- n1i - ai
  di <- n2i - ci
  a <- ai; b <- bi; c <- ci; d <- di
  zero <- (a == 0) | (b == 0) | (c == 0) | (d == 0)
  a[zero] <- a[zero] + 0.5; b[zero] <- b[zero] + 0.5
  c[zero] <- c[zero] + 0.5; d[zero] <- d[zero] + 0.5
  yi <- log(a) + log(d) - log(b) - log(c)
  vi <- 1/a + 1/b + 1/c + 1/d
  data.frame(yi = yi, vi = vi)
}

args <- commandArgs(trailingOnly = TRUE)
data_dir <- if (length(args) >= 1) args[[1]] else
  "F:/Projects/mahmood789/Pairwise70/data"
out_csv <- if (length(args) >= 2) args[[2]] else "pairwise70_studylevel.csv"

files <- list.files(data_dir, pattern = "\\.rda$", full.names = TRUE)
cat(sprintf("Found %d rda files in %s\n", length(files), data_dir))

bin_cols <- c("Experimental.cases", "Experimental.N", "Control.cases", "Control.N")
rows <- list()
n_kept <- 0L; n_skip <- 0L; n_err <- 0L

for (f in files) {
  env <- new.env()
  ok <- tryCatch({ load(f, envir = env); TRUE }, error = function(e) FALSE)
  if (!ok) { n_err <- n_err + 1L; next }
  obj_names <- ls(env)
  if (length(obj_names) == 0) { n_skip <- n_skip + 1L; next }
  df <- get(obj_names[1], envir = env)
  if (!all(bin_cols %in% names(df))) { n_skip <- n_skip + 1L; next }

  rid <- sub("_data\\.rda$", "", basename(f))
  a_num <- unique(df$Analysis.number)[1]
  ma <- df[df$Analysis.number == a_num, , drop = FALSE]
  # Match the canonical Pairwise70/SYNTHESIS benchmark exactly: take ALL rows of
  # the first analysis and keep those with complete 2x2 cells (escalc drops the
  # rest). No dedup/NA-label filtering, so k matches the published benchmark.
  cc <- complete.cases(ma$Experimental.cases, ma$Experimental.N,
                       ma$Control.cases, ma$Control.N)
  ma <- ma[cc, , drop = FALSE]
  if (nrow(ma) < 3) { n_skip <- n_skip + 1L; next }
  dat <- tryCatch(
    escalc_or(ai = ma$Experimental.cases, n1i = ma$Experimental.N,
              ci = ma$Control.cases,      n2i = ma$Control.N),
    error = function(e) NULL)
  if (is.null(dat)) { n_err <- n_err + 1L; next }

  keep <- is.finite(dat$yi) & is.finite(dat$vi) & dat$vi > 0
  yi <- dat$yi[keep]; vi <- dat$vi[keep]
  if (length(yi) < 3) { n_skip <- n_skip + 1L; next }

  n_kept <- n_kept + 1L
  rows[[length(rows) + 1L]] <- data.frame(
    review_id = rid,
    analysis_name = as.character(ma$Analysis.name[1]),
    study_idx = seq_along(yi),
    yi = as.numeric(yi),
    vi = as.numeric(vi),
    stringsAsFactors = FALSE)
}

out <- do.call(rbind, rows)
write.csv(out, out_csv, row.names = FALSE)
cat(sprintf("kept=%d skipped=%d errors=%d  -> %d reviews, %d study rows\n",
            n_kept, n_skip, n_err, length(unique(out$review_id)), nrow(out)))
cat(sprintf("wrote %s\n", out_csv))
