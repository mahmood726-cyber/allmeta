# Regenerate from repository root with R 4.6.0 and the pinned packages below.
# Synthetic cases test the software contract; the BCG random-allocation subset
# is read directly from metadat. Synthetic obs rows are explicitly labelled.
stopifnot(as.character(getRversion()) == "4.6.0")
versions <- c(metafor="5.0.1", metadat="1.6.0", jsonlite="2.0.0")
for (p in names(versions)) {
  stopifnot(requireNamespace(p, quietly=TRUE))
  stopifnot(as.character(packageVersion(p)) == versions[[p]])
}

rcts <- data.frame(label=c("Synthetic RCT A", "Synthetic RCT B"),
                   yi=c(-0.2, 0.5), vi=c(0.01, 0.25), design="rct")
obs <- data.frame(label=c("Synthetic Obs A", "Synthetic Obs B"),
                  yi=c(-4, 6), vi=c(0.01, 0.02), design="obs")
bcg_source <- subset(metadat::dat.bcg, alloc == "random")
bcg <- metafor::escalc(measure="RR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=bcg_source)
bcg_rows <- data.frame(label=paste(bcg$author, bcg$year), yi=bcg$yi, vi=bcg$vi, design="rct")

reference <- function(id, rows, alpha) {
  active <- if (alpha == 0) subset(rows, design == "rct") else rows
  method <- if (nrow(active) == 1) "EE" else "DL"
  fit <- metafor::rma.uni(yi=active$yi, vi=active$vi, method=method, test="z", level=95)
  list(id=id, alpha=alpha, rows=rows,
       expected=list(mu=as.numeric(fit$b), sePost=fit$se,
                     ci_lo=fit$ci.lb, ci_hi=fit$ci.ub, tau2=fit$tau2))
}
nulls <- rcts
nulls$yi <- 0
cases <- list(
  reference("synthetic-heterogeneous-alpha0", rbind(rcts, obs), 0),
  reference("synthetic-single-rct-alpha0", rbind(rcts[1, ], obs), 0),
  reference("synthetic-null-alpha0", rbind(nulls, obs), 0),
  reference("synthetic-alpha1", rbind(rcts, obs), 1),
  reference("synthetic-all-obs-alpha1", obs, 1),
  reference("bcg-random-plus-synthetic-obs-alpha0", rbind(bcg_rows, obs), 0),
  reference("bcg-random-plus-synthetic-obs-alpha1", rbind(bcg_rows, obs), 1)
)
out <- list(R=as.character(getRversion()), packages=as.list(versions),
            estimator="DerSimonian-Laird, inverse-variance random effects, normal 95% CI; k=1 uses EE",
            source="metadat::dat.bcg, alloc == random; log risk ratios recomputed with metafor::escalc(RR)",
            source_url="https://wviechtb.github.io/metadat/reference/dat.bcg.html",
            disclosure="All added observational rows and non-BCG cases are synthetic regression fixtures, not clinical findings.",
            bcg_source_rows=bcg_source, cases=cases)
args <- commandArgs(trailingOnly=TRUE)
destination <- if(length(args)) args[[1]] else "tests/fixtures/cross-design-alpha0-oracle.json"
jsonlite::write_json(out, destination, pretty=TRUE, auto_unbox=TRUE, digits=16)
cat(length(cases), "reference cases generated with pinned versions\n")
