# Generates numeric-ids.json: synthetic designs whose cluster IDs are the
# numbers 1..K in shuffled row order, with multi-row clusters.
# Rscript rve-meta/tests/fixtures/p15/numeric-ids.R  (R 4.6.0, robumeta 2.1,
# clubSandwich 0.7.0, Windows x64, LC_COLLATE=C)
#
# robumeta 2.1 robu.R:37-39 orders rows by as.factor(studynum). For a numeric
# studynum the levels are numeric; for a character studynum they are bytewise
# under LC_COLLATE=C. Each design is referenced three times: numeric studynum,
# the same IDs as character, and a factor whose levels are in first-seen order.
# A seed is kept only when R itself separates the numeric reference from both
# other orders at the 1e-9 gate, so the fixture can detect either ordering.
# The selection uses R results only; the app engine is not consulted.
suppressMessages({library(robumeta); library(clubSandwich)})
invisible(Sys.setlocale('LC_COLLATE', 'C'))
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[[1]] else 'numeric-ids.json'
num <- function(a) if (is.finite(a)) sprintf('%.17g', a) else 'null'
enc <- function(v) {
  if (is.list(v)) {
    z <- vapply(v, enc, '')
    if (!is.null(names(v)))
      return(paste0('{', paste0(vapply(names(v), encodeString, '', quote = '"'), ':', z, collapse = ','), '}'))
    return(paste0('[', paste(z, collapse = ','), ']'))
  }
  if (is.numeric(v)) z <- vapply(v, num, '')
  else if (is.logical(v)) z <- ifelse(v, 'true', 'false')
  else z <- vapply(as.character(v), encodeString, '', quote = '"')
  if (length(z) == 1) z else paste0('[', paste(z, collapse = ','), ']')
}
reference <- function(d, rho) {
  rr <- robu(yi ~ x, data = d, studynum = cl, var.eff.size = vi,
             modelweights = 'CORR', rho = rho, small = TRUE)
  ord <- order(as.factor(d$cl))
  stopifnot(identical(rr$data.full$effect.size, d$yi[ord]))
  w <- numeric(nrow(d)); w[ord] <- rr$data.full$r.weights
  tab <- rr$reg_table
  cb <- as.data.frame(coef_test(rr, vcov = 'CR2', test = 'Satterthwaite'))
  list(table = lapply(seq_len(nrow(tab)), function(j) as.list(tab[j, c('b.r', 'SE', 't', 'dfs', 'prob', 'CI.L', 'CI.U')])),
       tau2 = as.numeric(rr$mod_info$tau.sq),
       club = list(beta = cb$beta, SE = cb$SE, tstat = cb$tstat, df_Satt = cb$df_Satt, p_Satt = cb$p_Satt),
       weights = w, levels = levels(as.factor(d$cl)))
}
gap <- function(a, b) {
  q <- c('b.r', 'SE', 't', 'dfs', 'prob', 'CI.L', 'CI.U'); absolute <- c('prob', 'CI.L', 'CI.U')
  max(unlist(lapply(seq_along(a$table), function(j) vapply(q, function(k) {
    x <- a$table[[j]][[k]]; y <- b$table[[j]][[k]]
    abs(x - y) / if (k %in% absolute) 1 else max(1, abs(y))
  }, 0))), abs(a$tau2 - b$tau2) / max(1, abs(b$tau2)))
}
designs <- list(); seed <- 0
while (length(designs) < 3 && seed < 500) {
  seed <- seed + 1; set.seed(seed)
  K <- sample(12:15, 1); size <- sample(1:4, K, replace = TRUE)
  if (sum(size > 1) < 4) next
  ids <- rep(sample(K), times = size); rowsOrder <- sample(length(ids)); ids <- ids[rowsOrder]
  year <- sample(1985:2015, K, replace = TRUE)
  d <- data.frame(cl = ids, yi = round(rnorm(length(ids), 0.3, 0.3), 3),
                  vi = round(runif(length(ids), 0.01, 0.1), 4), x = year[ids])
  rho <- c(0, 0.8)[1 + seed %% 2]
  rn <- tryCatch(reference(d, rho), error = function(e) NULL)
  dc <- d; dc$cl <- as.character(d$cl)
  df <- d; df$cl <- factor(d$cl, levels = unique(d$cl))
  rc <- tryCatch(reference(dc, rho), error = function(e) NULL)
  rf <- tryCatch(reference(df, rho), error = function(e) NULL)
  if (is.null(rn) || is.null(rc) || is.null(rf)) next
  if (!(gap(rn, rc) > 1e-9 && gap(rn, rf) > 1e-9)) next
  rows <- function(cl) lapply(seq_len(nrow(d)), function(i) list(cluster = cl[[i]], yi = d$yi[i], vi = d$vi[i], X = c(1, d$x[i])))
  designs[[length(designs) + 1]] <- list(
    seed = seed, rho = rho, clusters = K, rows = nrow(d),
    numeric = list(rows = rows(as.list(d$cl)), R = rn),
    character = list(rows = rows(as.list(as.character(d$cl))), R = rc),
    first_seen = list(R = rf),
    gap_numeric_vs_character = gap(rn, rc), gap_numeric_vs_first_seen = gap(rn, rf))
}
stopifnot(length(designs) == 3)
info <- list(R = R.version.string, robumeta = as.character(packageVersion('robumeta')),
             clubSandwich = as.character(packageVersion('clubSandwich')),
             platform = R.version$platform, LC_COLLATE = Sys.getlocale('LC_COLLATE'))
writeLines(enc(list(generated_by = 'rve-meta/tests/fixtures/p15/numeric-ids.R', session = info, designs = designs)), out, useBytes = TRUE)
cat('wrote', out, 'seeds', vapply(designs, function(x) x$seed, 0), '\n')
