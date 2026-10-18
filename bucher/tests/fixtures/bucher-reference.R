# Synthetic software fixtures; no clinical study data.
# From repo root: Rscript --vanilla bucher/tests/fixtures/bucher-reference.R
# Recomputes the committed oracle with installed pinned packages, no network.
suppressPackageStartupMessages(library(netmeta))
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
stopifnot(as.character(packageVersion("netmeta")) == "3.5.0",
          as.character(packageVersion("metafor")) == "5.0.1",
          as.character(packageVersion("jsonlite")) == "2.0.0")
path <- "bucher/tests/fixtures/bucher-reference.json"
cases <- list(
  list(name="triangle", TE=c(-.3,-.5,-.22,-.28,-.48), se=c(.1,.12,.09,.11,.14),
       t1=c("A","A","B","A","A"), t2=c("B","C","C","B","C")),
  list(name="reversed", TE=c(.5,.22,.48), se=c(.12,.09,.14),
       t1=c("C","C","C"), t2=c("A","B","A")),
  list(name="null", TE=c(0,0), se=c(.1,.2), t1=c("A","B"), t2=c("C","C")),
  list(name="positive", TE=c(.8,-.3), se=c(.2,.4), t1=c("A","B"), t2=c("C","C")),
  list(name="unequal", TE=c(-.7,-.2,.1,.4), se=c(.01,.9,.3,.2),
       t1=c("A","A","B","B"), t2=rep("C",4)),
  list(name="named", TE=c(-.2,.15), se=c(.2,.3),
       t1=c("Drug A","Control"), t2=c("Control","Drug B")),
  list(name="tail", TE=c(3,0), se=c(.2,.3), t1=c("A","B"), t2=c("C","C"))
)
out <- lapply(cases, function(x) {
  named <- x$name == "named"
  A <- if(named) "Drug A" else "A"; B <- if(named) "Drug B" else "B"; C <- if(named) "Control" else "C"
  d <- data.frame(study=paste0("synthetic-", seq_along(x$TE)),
                  treat1=x$t1, treat2=x$t2, TE=x$TE, seTE=x$se)
  link <- function(T) {
    sel <- (d$treat1 == T & d$treat2 == C) | (d$treat1 == C & d$treat2 == T)
    g <- d[sel,]; y <- ifelse(g$treat1 == T, g$TE, -g$TE)
    f <- rma.uni(yi=y, sei=g$seTE, method="FE", test="z")
    list(mu=unname(coef(f)[1]), se=unname(f$se))
  }
  ac <- link(A); bc <- link(B)
  selected <- d[d$treat1 == C | d$treat2 == C,]
  n <- netmeta(TE, seTE, treat1, treat2, studlab=study, data=selected,
               sm="MD", reference.group=C, common=TRUE, random=FALSE)
  mu <- ac$mu-bc$mu; se <- sqrt(ac$se^2+bc$se^2)
  stopifnot(abs(mu - n$TE.common[A,B]) < 1e-10,
            abs(se - n$seTE.common[A,B]) < 1e-10)
  ci <- mu + c(-1,1)*qnorm(.975)*se
  list(name=x$name, rows=d, options=list(A=A,B=B,C=C),
       expected=list(AC=ac,BC=bc,mu=mu,se=se,lo=ci[1],hi=ci[2],
                     p=2*pnorm(-abs(mu/se)),netmeta_mu=n$TE.common[A,B],
                     netmeta_se=n$seTE.common[A,B]))
})
write_json(list(synthetic=TRUE, R=as.character(getRversion()),
  versions=list(netmeta=as.character(packageVersion("netmeta")),
                metafor=as.character(packageVersion("metafor")),
                jsonlite=as.character(packageVersion("jsonlite"))),
  cases=out), path, auto_unbox=TRUE, pretty=TRUE, digits=16)
cat("Fresh pinned R comparisons:", length(out), "cases passed\n")
