# Independent R oracle; checks every row, including expected missing values.
suppressPackageStartupMessages(library(jsonlite))
suppressPackageStartupMessages(library(metafor))
cat(sprintf("R %s; metafor %s; jsonlite %s\n",getRversion(),
  packageVersion("metafor"),packageVersion("jsonlite")))
args <- commandArgs(trailingOnly=TRUE)
path <- if (length(args)) args[[1]] else "validation/entry/cases.json"
cases <- fromJSON(path, simplifyVector=FALSE)
tol <- 1e-10
passed <- 0L
`%or%` <- function(x,y) if (is.null(x)) y else x
# True relative criterion |js - r| <= 1e-10 * |r| at every magnitude. (The former denominator
# floor of 1 made the check absolute for |r| < 1.) When r == 0 this demands js == 0 exactly.
# A missing JS value (null) must match an R NA.
same <- function(js,r) {
  if (is.null(js)) return(length(r)==1L && is.na(r))
  is.numeric(js) && length(js)==1L && is.finite(js) && is.finite(r) &&
    abs(js-r) <= tol*abs(r)
}
oracle <- function(case) {
  a <- case$args
  level <- a$level %or% .95
  ratio <- isTRUE(a$ratio)
  trans <- if(ratio) log else identity
  if (case$fn == "convertFivenum") {
    if (!is.null(a$method)) a$method <- unlist(a$method)
    ans <- suppressWarnings(do.call(metafor::conv.fivenum, a))
    return(list(mean=ans$mean[[1]],sd=ans$sd[[1]]))
  }
  if (case$fn == "seFromCI") {
    # conv.wald calculates vi, and checks midpoint only when out is supplied.
    ans <- suppressWarnings(metafor::conv.wald(out=a$est %or% NA_real_,
      ci.lb=a$lo,ci.ub=a$hi,level=level,transf=trans,check=FALSE))
    value <- sqrt(ans$vi[[1]])
    direct <- (trans(a$hi)-trans(a$lo))/(2*qnorm(1-(1-level)/2))
    if(!same(value,direct)) stop("conv.wald/direct CI cross-check disagrees")
  } else if (case$fn == "seFromP") {
    ans <- metafor::conv.wald(out=a$est,pval=a$p,transf=trans)
    value <- sqrt(ans$vi[[1]])
    direct <- abs(trans(a$est))/qnorm(a$p/2,lower.tail=FALSE)
    if(!same(value,direct)) stop("conv.wald/direct p cross-check disagrees")
  } else if (case$fn == "estFromCI") {
    # conv.wald does not impute a missing out. Supply the midpoint, then
    # check that the returned transformed yi and variance agree.
    midpoint <- (trans(a$lo)+trans(a$hi))/2
    value <- if(ratio) exp(midpoint) else midpoint
    ans <- metafor::conv.wald(out=value,ci.lb=a$lo,ci.ub=a$hi,
      level=level,transf=trans,check=FALSE)
    if(!same(ans$yi[[1]],midpoint)) stop("conv.wald midpoint cross-check disagrees")
  } else if (case$fn == "sdFromCI") {
    crit <- if(a$n < 60) qt(1-(1-level)/2,a$n-1) else qnorm(1-(1-level)/2)
    value <- sqrt(a$n)*(a$hi-a$lo)/(2*crit)
  } else if (case$fn == "sdFromSE") {
    value <- a$se*sqrt(a$n)
  } else if (case$fn == "eventsFromPercent") {
    # JavaScript/entry convention: ties go upward for nonnegative counts.
    value <- floor(a$pct/100*a$n+.5)
  } else if (case$fn %in% c("designEffect","clusterCounts","clusterSE")) {
    # Cochrane Handbook v6.5 section 23.1.4: DE = 1 + (M - 1) * ICC; M = total / clusters when not given.
    m <- if (!is.null(a$m)) a$m else a$total/a$k
    de <- if (!is.null(a$designEffect)) a$designEffect else 1+(m-1)*a$icc
    if (case$fn == "clusterCounts") return(list(events=a$events/de,n=a$n/de,designEffect=de))
    value <- if (case$fn == "clusterSE") a$se*sqrt(de) else de
  } else stop(paste("Unknown function",case$fn))
  list(value=value)
}
for (case in cases) {
  expected <- tryCatch(oracle(case),error=function(e)e)
  ok <- TRUE
  if(inherits(expected,"error")){
    cat(sprintf("FAIL %s %s js=%s R=ERROR:%s\n",case$id,case$fn,
      toJSON(case$js,auto_unbox=TRUE,null="null"),conditionMessage(expected)))
    ok <- FALSE
  } else {
    for (key in names(expected)) {
      js <- case$js[[key]]
      r <- expected[[key]]
      if(!same(js,r)){
        cat(sprintf("FAIL %s %s.%s js=%s R=%s\n",case$id,case$fn,key,
          if(is.null(js)) "null" else format(js,digits=17),
          format(r,digits=17)))
        ok <- FALSE
      }
    }
  }
  if(ok) passed <- passed+1L
}
cat(sprintf("ENTRY %d/%d\n",passed,length(cases)))
quit(status=if(passed==length(cases)) 0L else 1L)
