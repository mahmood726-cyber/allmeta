## QA: published reference datasets vs RapidMeta embedded canonical-datasets.js
## Truth-first: prints the PUBLISHED numbers so we can diff against embedded.
suppressMessages({library(metafor); library(netmeta)})
options(width=200)

cat("########## BCG (Berkey 1995) = metafor::dat.bcg ##########\n")
data(dat.bcg)
db <- escalc(measure="RR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)
out <- data.frame(trial=dat.bcg$trial, author=dat.bcg$author, year=dat.bcg$year,
                  ablat=dat.bcg$ablat,
                  yi=round(as.numeric(db$yi),4), vi=round(as.numeric(db$vi),4))
print(out, row.names=FALSE)

cat("\n########## Smoking cessation = netmeta::smokingcessation ##########\n")
data(smokingcessation)
print(smokingcessation, row.names=TRUE)

cat("\n# treatments key: A=No contact, B=Self-help, C=Individual counselling, D=Group counselling\n")
cat("# n columns are arm sizes; event columns are quitters.\n")
