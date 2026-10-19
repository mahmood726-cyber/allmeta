# Independent exhaustive R reference for the GOSH exact streaming engine (gosh/exact-enum.js).
#
# NOT metafor and NOT the app's algorithm: every non-empty subset (2^k - 1, singletons included) is fitted in
# vectorised chunks from a 0/1 incidence matrix with closed-form TWO-PASS fixed-effect / DerSimonian-Laird
# formulae on the raw (uncentred) effects:
#   mu_FE = sum(w y)/sum(w);  Q = sum(w (y - mu_FE)^2);  I2 = 100 (Q - df)/Q if Q > df else 0
#   tau2_DL = max(0, (Q - df)/(sum w - sum w^2/sum w));  mu_DL = sum(y/(v + tau2))/sum(1/(v + tau2))
# Every subset value is KEPT (vectors of length 2^k - 1), so quartiles come from R's quantile(type = 7) on the full
# vector, not from the app's histogram method. Grid cells use the same expression as the app:
#   ix = floor((est - x0) * (GX/(x1 - x0))), iy = floor(I2 * (GY/100)), clamped; x0/x1 = min/max of te.
# Near-edge diagnostics count subsets whose scaled coordinate is within 1e-9 of an INTERIOR cell boundary.
#
# Usage: Rscript generate-exact-r.R <corpus.json> <work_dir> <output.json>
# Checkpoints one JSON per configuration x model in <work_dir>; rerunning resumes.
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 3) stop("usage: Rscript generate-exact-r.R <corpus.json> <work_dir> <output.json>")
lib <- Sys.getenv("P13B_RLIB", "")
if (nzchar(lib)) .libPaths(c(lib, .libPaths()))
suppressPackageStartupMessages(library(jsonlite))
stopifnot(as.character(packageVersion("jsonlite")) == "2.0.0")
corpus_path <- args[1]; work <- args[2]; out_path <- args[3]
dir.create(work, showWarnings = FALSE, recursive = TRUE)
corpus <- fromJSON(corpus_path, simplifyVector = FALSE)
GX <- corpus$grid$nx; GY <- corpus$grid$ny
cat("R", R.version.string, "jsonlite", as.character(packageVersion("jsonlite")), "\n")

fit_config <- function(cfg, model) {
  y <- unlist(cfg$te); se <- unlist(cfg$se); k <- length(y)
  stopifnot(k == cfg$k, k <= 30, all(se > 0))
  v <- se^2; w <- 1 / v
  x0 <- min(y); x1 <- max(y); if (!(x1 > x0)) { x0 <- x0 - 0.5; x1 <- x1 + 0.5 }
  gx <- GX / (x1 - x0); gy <- GY / 100
  N <- 2^k - 1
  est_all <- numeric(N); i2_all <- numeric(N); q_all <- numeric(N); t_all <- numeric(N)
  with_est <- numeric(k); with_i2 <- numeric(k); without_est <- numeric(k); without_i2 <- numeric(k)
  grid <- numeric(GX * GY); edge_x <- 0; edge_y <- 0
  B <- 2^16
  starts <- seq(1, N, by = B)
  pos <- 0
  for (s in starts) {
    masks <- s:min(N, s + B - 1)
    M <- vapply(seq_len(k), function(j) as.numeric(bitwAnd(as.integer(masks), as.integer(2^(j - 1))) > 0), numeric(length(masks)))
    if (is.null(dim(M))) M <- matrix(M, nrow = 1)
    n <- rowSums(M); df <- n - 1
    sw <- drop(M %*% w)
    mu <- drop(M %*% (w * y)) / sw
    D <- matrix(y, nrow(M), k, byrow = TRUE) - mu
    Q <- rowSums(M * matrix(w, nrow(M), k, byrow = TRUE) * D^2)
    I2 <- ifelse(df > 0 & Q > df, 100 * (Q - df) / Q, 0)
    tau2 <- rep(0, length(masks)); est <- mu
    if (model == "DL") {
      C <- sw - drop(M %*% (w^2)) / sw
      tau2 <- ifelse(df > 0, pmax(0, (Q - df) / C), 0)
      Ws <- M / (matrix(v, nrow(M), k, byrow = TRUE) + tau2)
      est <- rowSums(Ws * matrix(y, nrow(M), k, byrow = TRUE)) / rowSums(Ws)
    }
    idx <- pos + seq_along(masks)
    est_all[idx] <- est; i2_all[idx] <- I2; q_all[idx] <- Q; t_all[idx] <- tau2
    pos <- pos + length(masks)
    with_est <- with_est + colSums(M * est); with_i2 <- with_i2 + colSums(M * I2)
    without_est <- without_est + colSums((1 - M) * est); without_i2 <- without_i2 + colSums((1 - M) * I2)
    fx <- (est - x0) * gx; fy <- I2 * gy
    # interior cell boundaries only: the outer edges (fx = 0 or GX) are resolved by clamping
    edge_x <- edge_x + sum(abs(fx - round(fx)) < 1e-9 & round(fx) > 0 & round(fx) < GX)
    edge_y <- edge_y + sum(I2 != 0 & abs(fy - round(fy)) < 1e-9 & round(fy) > 0 & round(fy) < GY)
    ix <- pmin(pmax(floor(fx), 0), GX - 1); iy <- pmin(pmax(floor(fy), 0), GY - 1)
    grid <- grid + tabulate(iy * GX + ix + 1, nbins = GX * GY)
  }
  stopifnot(pos == N, sum(grid) == N)
  half <- 2^(k - 1)
  cells <- which(grid > 0)
  res <- list(
    id = cfg$id, model = model, k = k, n_subsets = N,
    mean_est = mean(est_all), min_est = min(est_all), max_est = max(est_all),
    mean_i2 = mean(i2_all), min_i2 = min(i2_all), max_i2 = max(i2_all),
    mean_q = mean(q_all), min_q = min(q_all), max_q = max(q_all),
    zero_i2 = sum(i2_all == 0),
    q25_est = unname(quantile(est_all, 0.25, type = 7)), median_est = unname(quantile(est_all, 0.5, type = 7)),
    q75_est = unname(quantile(est_all, 0.75, type = 7)),
    q25_i2 = unname(quantile(i2_all, 0.25, type = 7)), median_i2 = unname(quantile(i2_all, 0.5, type = 7)),
    q75_i2 = unname(quantile(i2_all, 0.75, type = 7)),
    grid_x0 = x0, grid_x1 = x1,
    grid_cells = lapply(cells, function(i) c(i - 1, grid[i])),
    near_edge_x = edge_x, near_edge_y = edge_y,
    per_study = lapply(seq_len(k), function(j) list(study = j, with_n = half, without_n = half - 1,
      with_mean = with_est[j] / half, without_mean = without_est[j] / (half - 1),
      with_i2 = with_i2[j] / half, without_i2 = without_i2[j] / (half - 1)))
  )
  if (model == "DL") { res$mean_tau2 <- mean(t_all); res$min_tau2 <- min(t_all); res$max_tau2 <- max(t_all); res$tau2_positive <- sum(t_all > 0) }
  res
}

for (cfg in corpus$configurations) for (model in corpus$models) {
  f <- file.path(work, paste0(gsub("[^A-Za-z0-9]+", "_", cfg$id), "__", model, ".json"))
  if (file.exists(f)) { cat("skip (checkpoint)", cfg$id, model, "\n"); next }
  t0 <- proc.time()[["elapsed"]]
  r <- fit_config(cfg, model)
  r$seconds <- proc.time()[["elapsed"]] - t0
  writeLines(toJSON(r, auto_unbox = TRUE, digits = NA), paste0(f, ".tmp"))
  file.rename(paste0(f, ".tmp"), f)
  cat(sprintf("%s %s k=%d subsets=%.0f %.1fs\n", cfg$id, model, r$k, r$n_subsets, r$seconds))
  flush.console()
}
results <- list()
for (cfg in corpus$configurations) for (model in corpus$models) {
  f <- file.path(work, paste0(gsub("[^A-Za-z0-9]+", "_", cfg$id), "__", model, ".json"))
  results[[length(results) + 1]] <- fromJSON(f, simplifyVector = FALSE)
}
writeLines(toJSON(list(`_schema` = "gosh-exact-reference-r-v1", generator = "generate-exact-r.R (independent closed-form two-pass, not metafor)",
  R = R.version.string, jsonlite = as.character(packageVersion("jsonlite")), grid = corpus$grid, results = results),
  auto_unbox = TRUE, digits = NA), out_path)
cat("Wrote", length(results), "results to", out_path, "\n")
