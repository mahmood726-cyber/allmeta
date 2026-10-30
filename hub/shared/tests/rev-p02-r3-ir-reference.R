# Additional one-contrast controls; does not replace the six existing references.
# Run from wt: Rscript hub/shared/tests/rev-p02-r3-ir-reference.R
suppressPackageStartupMessages(library(dosresmeta))
num <- function(x) sprintf("%.17g", as.numeric(x))
vec <- function(x) paste0("[", paste(num(x), collapse=","), "]")
items <- character()
for (high in c(FALSE, TRUE)) for (reverse in c(FALSE, TRUE)) {
  one <- data.frame(dose=c(0, 1), cases=if (high) c(101, 130) else c(10, 13),
    n=c(100, 80), logrr=c(0, log(1.3)), se=c(0, .5), type="ir")
  if (reverse) one <- one[2:1, ]
  d <- do.call(rbind, lapply(1:3, function(id) cbind(id=id, one)))
  f <- dosresmeta(logrr ~ dose, id=id, type=type, se=se, cases=cases, n=n,
    data=d, covariance="h", proc="2stage", method="fixed")
  stopifnot(all(is.finite(coef(f))), all(is.finite(vcov(f))))
  rows <- vapply(seq_len(nrow(d)), function(i) paste0('{"id":"', d$id[i],
    '","dose":', num(d$dose[i]), ',"cases":', num(d$cases[i]), ',"n":', num(d$n[i]),
    ',"logrr":', num(d$logrr[i]), ',"se":', num(d$se[i]), ',"type":"ir"}'), "")
  name <- paste(if (high) "above-person-time" else "below-person-time",
    if (reverse) "reference-last" else "reference-first", sep="/")
  items <- c(items, paste0('{"name":"', name, '","rows":[', paste(rows, collapse=","),
    '],"coef":', vec(coef(f)), ',"vcov":', vec(vcov(f)), '}'))
  cat(name, "fit\n")
}
fixture <- paste0('{"R":"', R.version.string, '","dosresmeta":"', packageVersion("dosresmeta"),
  '","mixmeta":"', packageVersion("mixmeta"), '","cases":[', paste(items, collapse=","), ']}')
writeLines(fixture, "hub/shared/tests/fixtures/rev-p02-r3-ir-r.json")
cat(R.version.string, "\ndosresmeta", as.character(packageVersion("dosresmeta")),
  "\nmixmeta", as.character(packageVersion("mixmeta")), "\nWrote 4 additional one-contrast R fits.\n")
