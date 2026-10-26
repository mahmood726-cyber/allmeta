suppressPackageStartupMessages(library(netmeta))
args <- commandArgs(trailingOnly = FALSE)
script <- sub('^--file=', '', args[grepl('^--file=', args)])
out <- file.path(dirname(normalizePath(script)), '..', 'rchecks-out', 'p0cnma')
plant_detected <- FALSE
for (case in c('control', 'placebo', 'mixed-case', 'pbo', 'combination', 'manual')) {
 d <- read.csv(file.path(out, paste0(case, '-input.csv')), stringsAsFactors=FALSE)
 page <- read.csv(file.path(out, paste0(case, '-page.csv')), stringsAsFactors=FALSE)
 inactive <- switch(case, control='control', placebo='placebo', 'mixed-case'='placebo', pbo='pbo', combination='control', manual='sham')
 stopifnot(nrow(page)==3L, all(page$inactive==inactive), !anyDuplicated(page$component))
 d$treat1 <- tolower(d$treat1); d$treat2 <- tolower(d$treat2)
 dc <- discomb(TE=d$TE, seTE=d$seTE, treat1=d$treat1, treat2=d$treat2,
   studlab=d$studlab, inactive=inactive, sep.comps='+', common=TRUE, random=TRUE)
 # These consistent fixtures have zero DL heterogeneity, as in cnma-oracle.R.
 stopifnot(is.finite(dc$tau), abs(dc$tau^2) <= 1e-12)
 cn <- names(dc$Comp.common)
 if (is.null(cn)) cn <- dc$comps
 keep <- cn != inactive
 cn <- cn[keep]; est <- as.numeric(dc$Comp.common)[keep]; se <- as.numeric(dc$seComp.common)[keep]
 stopifnot(setequal(page$component, cn))
 idx <- match(page$component, cn)
 matches <- function(p) all(is.finite(p$est)) && all(is.finite(p$se)) &&
   all(abs(p$est-est[idx])<=1e-6) && all(abs(p$se-se[idx])<=1e-6)
 stopifnot(matches(page))
 if (case=='placebo') {
   # Ignoring inactivity adds a placebo coefficient; the old design is full-rank
   # here because combination rows break the single-component aliasing.
   split <- function(x) strsplit(x, '+', fixed=TRUE)[[1]]
   comps <- sort(unique(unlist(lapply(c(d$treat1,d$treat2),split))))
   X <- t(vapply(seq_len(nrow(d)), function(i)
     as.numeric(comps %in% split(d$treat1[i]))-as.numeric(comps %in% split(d$treat2[i])), numeric(length(comps))))
   cov <- solve(crossprod(X, X/d$seTE^2))
   beta <- as.vector(cov %*% crossprod(X,d$TE/d$seTE^2))
   planted <- page
   planted$est[1] <- beta[match(page$component[1],comps)]
   planted$se[1] <- sqrt(diag(cov))[match(page$component[1],comps)]
   plant_detected <- !matches(planted)
   stopifnot(plant_detected)
   cat('PLANT_DETECTED\n')
 }
}
stopifnot(plant_detected)
cat('R_CHECK_PASS\n')
