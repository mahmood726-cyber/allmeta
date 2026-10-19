# metafor reference for the GOSH exact streaming engine: metafor::gosh FORCED to enumerate every subset.
#
# metafor::gosh(res) enumerates all non-empty subsets only when 2^k - 1 <= subsets (default 1e6, i.e. k <= 19);
# otherwise it fits `subsets` random subsets. Here every configuration is called with subsets = 2^k - 1, which makes
# gosh.rma take its `exact` branch (expand.grid of all inclusion patterns). The script asserts that the returned
# inclusion matrix has 2^k - 1 DISTINCT rows, then summarises g$res exactly as the app streams it:
# count/mean/min/max of estimate, I2, QE (and tau2 for DL), type-7 quartiles, the 100 x 100 estimate x I2 grid
# (same cell expression as the app) and per-study with/without means from g$incl. Wall time of the gosh() call is
# recorded (single process, parallel = "no", progbar = FALSE).
#
# Usage: Rscript generate-exact-metafor.R <corpus.json> <work_dir> <output.json> [max_k=20] [ids=comma-separated]
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) stop("usage: Rscript generate-exact-metafor.R <corpus.json> <work_dir> <output.json> [max_k] [ids]")
lib <- Sys.getenv("P13B_RLIB", "")
if (nzchar(lib)) .libPaths(c(lib, .libPaths()))
suppressPackageStartupMessages({ library(jsonlite); library(metafor) })
if (as.character(packageVersion("metafor")) != "5.2.1") stop("metafor 5.2.1 required, found ", as.character(packageVersion("metafor")))
corpus_path <- args[1]; work <- args[2]; out_path <- args[3]
max_k <- if (length(args) >= 4) as.integer(args[4]) else 20L
only <- if (length(args) >= 5 && nzchar(args[5])) strsplit(args[5], ",")[[1]] else NULL
dir.create(work, showWarnings = FALSE, recursive = TRUE)
corpus <- fromJSON(corpus_path, simplifyVector = FALSE)
GX <- corpus$grid$nx; GY <- corpus$grid$ny
cat(R.version.string, "| metafor", as.character(packageVersion("metafor")), "| jsonlite", as.character(packageVersion("jsonlite")), "\n")

run_one <- function(cfg, model) {
  y <- unlist(cfg$te); se <- unlist(cfg$se); k <- length(y)
  res <- rma(yi = y, sei = se, method = model)
  N <- 2^k - 1
  t0 <- proc.time()[["elapsed"]]
  g <- gosh(res, subsets = N, progbar = FALSE, parallel = "no")
  secs <- proc.time()[["elapsed"]] - t0
  stopifnot(nrow(g$res) == N, nrow(g$incl) == N, all(g$fit))
  code <- drop(g$incl %*% (2^(0:(k - 1))))
  stopifnot(length(unique(code)) == N, min(code) == 1, max(code) == N)
  est <- g$res$estimate; I2 <- g$res$I2; Q <- g$res$QE; tau2 <- g$res$tau2
  stopifnot(!anyNA(est), !anyNA(I2), !anyNA(Q))
  x0 <- min(y); x1 <- max(y); if (!(x1 > x0)) { x0 <- x0 - 0.5; x1 <- x1 + 0.5 }
  fx <- (est - x0) * (GX / (x1 - x0)); fy <- I2 * (GY / 100)
  ix <- pmin(pmax(floor(fx), 0), GX - 1); iy <- pmin(pmax(floor(fy), 0), GY - 1)
  grid <- tabulate(iy * GX + ix + 1, nbins = GX * GY)
  M <- g$incl * 1
  half <- 2^(k - 1)
  we <- colSums(M * est); wi <- colSums(M * I2); oe <- colSums((1 - M) * est); oi <- colSums((1 - M) * I2)
  out <- list(
    id = cfg$id, model = model, k = k, n_subsets = N, gosh_seconds = secs,
    mean_est = mean(est), min_est = min(est), max_est = max(est),
    mean_i2 = mean(I2), min_i2 = min(I2), max_i2 = max(I2),
    mean_q = mean(Q), min_q = min(Q), max_q = max(Q),
    zero_i2 = sum(I2 == 0),
    q25_est = unname(quantile(est, 0.25, type = 7)), median_est = unname(quantile(est, 0.5, type = 7)), q75_est = unname(quantile(est, 0.75, type = 7)),
    q25_i2 = unname(quantile(I2, 0.25, type = 7)), median_i2 = unname(quantile(I2, 0.5, type = 7)), q75_i2 = unname(quantile(I2, 0.75, type = 7)),
    grid_x0 = x0, grid_x1 = x1,
    grid_cells = lapply(which(grid > 0), function(i) c(i - 1, grid[i])),
    near_edge_x = sum(abs(fx - round(fx)) < 1e-9 & round(fx) > 0 & round(fx) < GX),
    near_edge_y = sum(I2 != 0 & abs(fy - round(fy)) < 1e-9 & round(fy) > 0 & round(fy) < GY),
    per_study = lapply(seq_len(k), function(j) list(study = j, with_n = sum(M[, j]), without_n = N - sum(M[, j]),
      with_mean = we[j] / half, without_mean = oe[j] / (half - 1), with_i2 = wi[j] / half, without_i2 = oi[j] / (half - 1)))
  )
  if (model == "DL") { out$mean_tau2 <- mean(tau2); out$min_tau2 <- min(tau2); out$max_tau2 <- max(tau2); out$tau2_positive <- sum(tau2 > 0) }
  out
}

done <- character(0)
for (cfg in corpus$configurations) {
  if (cfg$k > max_k) next
  if (!is.null(only) && !(cfg$id %in% only)) next
  for (model in corpus$models) {
    f <- file.path(work, paste0(gsub("[^A-Za-z0-9]+", "_", cfg$id), "__", model, ".json"))
    done <- c(done, f)
    if (file.exists(f)) { cat("skip (checkpoint)", cfg$id, model, "\n"); next }
    r <- run_one(cfg, model)
    writeLines(toJSON(r, auto_unbox = TRUE, digits = NA), paste0(f, ".tmp")); file.rename(paste0(f, ".tmp"), f)
    cat(sprintf("%s %s k=%d subsets=%.0f gosh() %.1fs\n", cfg$id, model, r$k, r$n_subsets, r$gosh_seconds)); flush.console()
    rm(r); invisible(gc())
  }
}
results <- lapply(done, function(f) fromJSON(f, simplifyVector = FALSE))
writeLines(toJSON(list(`_schema` = "gosh-exact-reference-metafor-v1",
  generator = "generate-exact-metafor.R: metafor::gosh(rma(yi, sei, method), subsets = 2^k - 1) forced full enumeration",
  R = R.version.string, metafor = as.character(packageVersion("metafor")), jsonlite = as.character(packageVersion("jsonlite")),
  max_k = max_k, grid = corpus$grid, results = results), auto_unbox = TRUE, digits = NA), out_path)
cat("Wrote", length(results), "results to", out_path, "\n")
