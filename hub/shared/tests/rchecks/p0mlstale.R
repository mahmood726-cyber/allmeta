# Page-produced CSV only; run from the worktree root (TEST.ps1).
suppressPackageStartupMessages(library(metafor))
base <- file.path('hub', 'shared', 'tests', 'rchecks-out', 'p0mlstale')
d <- read.csv(file.path(base, 'fixture.csv'), stringsAsFactors=FALSE)
p <- read.csv(file.path(base, 'estimates.csv'), stringsAsFactors=FALSE)
s <- read.csv(file.path(base, 'stale.csv'), stringsAsFactors=FALSE)
stopifnot(nrow(d) >= 3, all(is.finite(d$yi)), all(is.finite(d$vi)), all(d$vi > 0))
f <- rma.mv(yi, vi, random = ~ 1 | study/es_id, method='REML', data=d)
reference <- c(mu=as.numeric(coef(f)), se=as.numeric(f$se), ciLo=as.numeric(f$ci.lb),
               ciHi=as.numeric(f$ci.ub), sigma2Between=f$sigma2[1],
               sigma2Within=f$sigma2[2], logLik=as.numeric(logLik(f)))
check_estimates <- function(x) {
  identical(as.character(x$metric), names(reference)) &&
    length(x$value)==length(reference) && all(is.finite(x$value)) &&
    all(abs(x$value-unname(reference)) <= 1e-6)
}
check_stale <- function(x) {
  nrow(x)==1 && identical(as.integer(x$rows), 2L) && identical(x$stale, TRUE)
}
stopifnot(check_estimates(p), check_stale(s))
# Both deliberately wrong exported values and a FALSE stale row must be rejected.
wrong <- p; wrong$value[1] <- reference[1]+0.01
wrong_stale <- s; wrong_stale$stale[1] <- FALSE
plant_detected <- !check_estimates(wrong) && !check_stale(wrong_stale)
stopifnot(plant_detected)
cat('PLANT_DETECTED\n')
cat('R_CHECK_PASS\n')
