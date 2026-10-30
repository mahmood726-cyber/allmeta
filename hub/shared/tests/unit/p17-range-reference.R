# Native R oracle for ordinary controls; run before changing the JS engine.
suppressPackageStartupMessages(library(metafor))
destination <- 'hub/shared/tests/unit/p17-range-reference.json'
if (file.exists(destination)) stop('Refusing to overwrite the recorded R fixture')
source('correlation-ma/validate/json17.R')
cases <- list(
  identical = list(r = c(.2, .2), n = c(100, 100)),
  example = list(r = c(.45, .30, .55, .20, .38, .62, .28, .50),
                 n = c(40, 55, 30, 80, 65, 25, 90, 45)))
for (name in names(cases)) {
  d <- cases[[name]]
  fits <- list()
  for (method in c('FE', 'DL', 'PM', 'REML')) {
    f <- rma(atanh(d$r), 1 / (d$n - 3), method = method,
             control = list(threshold = 1e-12, maxiter = 10000, stepadj = .5,
                            tol = .Machine$double.eps^0.75))
    fits[[method]] <- list(mu = as.numeric(f$b), se = as.numeric(f$se),
                          ciLo = as.numeric(f$ci.lb), ciHi = as.numeric(f$ci.ub),
                          Q = f$QE, tau2 = f$tau2, I2 = f$I2)
  }
  cases[[name]]$fits <- fits
}
ref <- list(provenance = list(R = R.version.string, metafor = as.character(packageVersion('metafor')),
                             metadat = as.character(packageVersion('metadat')),
                             script = 'p17-range-reference.R',
                             serialization = 'base R json17.R, 17 significant digits'), cases = cases)
# Required reference fixture, not a test log/cache.
write_json17(ref, destination)
cat('P17 native R fixture recorded:', destination, '\n')
cat(R.version.string, '; metafor ', as.character(packageVersion('metafor')), '\n', sep = '')
