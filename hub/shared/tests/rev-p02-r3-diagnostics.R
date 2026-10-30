# Read-only diagnostics for the failed new reference generator and IR control.
suppressPackageStartupMessages(library(dosresmeta))
cat(R.version.string, "\ndosresmeta", as.character(packageVersion("dosresmeta")),
  "\nmixmeta", as.character(packageVersion("mixmeta")), "\n")
cat("R Hamling implementation:\n")
print(get("hamling", asNamespace("dosresmeta")))
for (type in c("cc", "ci", "ir")) {
  d <- data.frame(id=rep(1:3, each=2), dose=rep(0:1, 3),
    cases=if (type == "ir") 101 else 10, n=100, type=type,
    logrr=0, se=rep(c(0, .5), 3))
  for (covariance in c("gl", "h")) {
    cat("One-contrast control:", type, covariance, "\n")
    f <- tryCatch(dosresmeta(logrr ~ dose, id=id, type=type, se=se, cases=cases, n=n,
      data=d, covariance=covariance, proc="2stage", method="fixed"), error=identity)
    if (inherits(f, "error")) cat(conditionMessage(f), "\n") else print(coef(f))
    if (covariance == "h") {
      print(tryCatch(dosresmeta:::hamling(y=d$logrr[1:2], v=d$se[1:2]^2,
        cases=d$cases[1:2], n=d$n[1:2], type=type), error=conditionMessage))
    }
  }
}
