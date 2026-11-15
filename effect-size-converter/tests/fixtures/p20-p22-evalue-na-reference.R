# Offline formula oracle: Rscript effect-size-converter/tests/fixtures/p20-p22-evalue-na-reference.R
# EValue is unavailable. Formula transcription of EValue 4.1.4 (source identity
# recorded in p20-r7-evalue-reference.json); NOT a fresh package execution.
# Validate against both existing native-output fixtures before writing results.
library(jsonlite)
rr <- function(m, x, rare=FALSE, sd=1) {
  if (m %in% c("SMD", "D", "MD")) return(exp(.91*x/sd))
  if (m == "OR" && !rare) return(sqrt(x))
  if (m == "HR" && !rare) return((1-.5^sqrt(x))/(1-.5^sqrt(1/x)))
  x
}
ev <- function(x) { x <- max(x, 1/x); x + sqrt(x*(x-1)) }
calc <- function(m,p,l=NA_real_,h=NA_real_,rare=FALSE,sd=1) {
  v <- rr(m,c(p,l,h),rare,sd)
  near <- if(v[1]>=1) 2 else 3
  ci <- if(is.na(v[near])) NA_real_ else if ((v[1]>=1 && v[near]<=1) || (v[1]<1 && v[near]>=1)) 1 else ev(v[near])
  list(point=ev(v[1]),ci=ci,lower=if(near==2) ci else NA_real_,upper=if(near==3) ci else NA_real_)
}
old <- fromJSON("tests/fixtures/evalue-input-oracle.json", simplifyVector=FALSE)
for(c in old$cases) {
  a <- calc(c$measure,c$point,if(is.null(c$lo)) NA_real_ else c$lo,if(is.null(c$hi)) NA_real_ else c$hi,c$rare)
  stopifnot(abs(a$point-c$expected$point)<1e-12)
  if(is.null(c$expected$ci)) stopifnot(is.na(a$ci)) else stopifnot(abs(a$ci-c$expected$ci)<1e-12)
}
native <- fromJSON("effect-size-converter/tests/fixtures/p20-r7-evalue-reference.json",simplifyVector=FALSE)
for(c in native$cases) if(c$accepted) {
  a <- calc("RR",c$point,c$lo,c$hi)
  stopifnot(abs(a$lower-as.numeric(c$native[[2]][[2]]))<1e-12, c$native[[2]][[3]]=="NA",is.na(a$upper))
}
cases <- list()
for(m in c("RR","OR","HR","SMD","D","MD")) for(rare in if(m %in% c("OR","HR")) c(FALSE,TRUE) else FALSE) for(dir in c("above","below")) for(kind in c("complete","crossing","missing","near-only","far-only")) {
  continuous <- m %in% c("SMD","D","MD")
  v <- if(continuous) c(.3,.1,.6) else c(2,1.5,2.7)
  if(dir=="below") v <- if(continuous) -v[c(1,3,2)] else 1/v[c(1,3,2)]
  if(kind=="crossing") v[if(dir=="above") 2 else 3] <- if(continuous) if(dir=="above") -.1 else .1 else if(dir=="above") .8 else 1.2
  near <- if(dir=="above") 2 else 3
  if(kind=="missing") v[2:3] <- NA_real_
  if(kind=="near-only") v[if(near==2) 3 else 2] <- NA_real_
  if(kind=="far-only") v[near] <- NA_real_
  sd <- if(m=="MD") 2 else 1
  if(m=="MD") v <- v*sd
  cases[[length(cases)+1]] <- list(id=paste(m,rare,dir,kind,sep="-"),measure=m,point=v[1],lo=v[2],hi=v[3],rare=rare,sd=sd,expected=calc(m,v[1],v[2],v[3],rare,sd))
}
write_json(list(provenance=list(R=R.version.string,method="Offline EValue 4.1.4 formula transcription cross-checked against recorded native outputs; not installed EValue",disclosure="Synthetic test inputs; MD standardized by supplied SD"),cases=cases),"effect-size-converter/tests/fixtures/p20-p22-evalue-na-reference.json",pretty=TRUE,auto_unbox=TRUE,digits=17,na="null")
