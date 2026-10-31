# dose-response-ma edge-case reference (2026-10-31): dosresmeta reference for negative doses, fractional counts and a single study.
suppressPackageStartupMessages({ library(dosresmeta); library(jsonlite) })
cat(R.version.string, '| dosresmeta', as.character(packageVersion('dosresmeta')), '| mixmeta', as.character(packageVersion('mixmeta')),
    '| jsonlite', as.character(packageVersion('jsonlite')), '\n')
ex <- read.csv(text = 'id,dose,cases,n,logrr,se,type
1,0,126,414,0,,cc
1,9.06,61,261,-0.223144,0.223338,cc
1,27,69,228,-0.0001,0.233752,cc
1,45,22,44,0.530628,0.376514,cc
1,64.8,19,34,0.875469,0.444005,cc
2,0,77,258,0,,cc
2,16.05,88,413,-0.430783,0.221305,cc
2,46.425,24,202,-1.07881,0.297565,cc
2,77.16,13,64,-0.616186,0.387079,cc
3,0,83,208,0,,cc
3,1.176,46,175,-0.579818,0.317147,cc
3,8.916,17,58,-0.562119,0.418614,cc
3,18.72,4,11,0.615186,0.909101,cc
4,0,83,208,0,,cc
4,0.955,29,117,-0.287682,0.333234,cc
4,7.43,32,81,0.512824,0.338373,cc
4,15.6,18,39,-0.314711,0.471345,cc
5,0,159,480,0,,ci
5,6,229,975,-0.415516,0.144215,ci
5,18,38,207,-0.634878,0.238349,ci
5,28.8,39,133,-0.083382,0.273885,ci
6,0,302,1269,0,,ci
6,6.25,129,436,-0.223144,0.156587,ci
6,18.75,19,49,-0.01005,0.351089,ci
6,30,15,41,-0.261365,0.416511,ci', stringsAsFactors = FALSE)

neg <- ex; neg$dose <- neg$dose - 20
frac <- ex
frac$cases[frac$id == 1 & frac$dose == 0] <- 126.5; frac$n[frac$id == 1 & frac$dose == 0] <- 414.25
frac$cases[frac$id == 1 & frac$dose == 27] <- 69.5
frac$cases[frac$id == 5 & frac$dose == 6] <- 229.4; frac$n[frac$id == 5 & frac$dose == 6] <- 975.6
one <- ex[ex$id == 1, ]
one5 <- ex[ex$id == 5, ]

run <- function(name, d, model, covariance, proc, method, pdose) {
  f <- if (model == 'linear') logrr ~ dose else logrr ~ dose + I(dose^2)
  w <- character(0)
  fit <- withCallingHandlers(
    dosresmeta(formula = f, id = id, type = type, se = se, cases = cases, n = n, data = d,
               covariance = covariance, proc = proc, method = method),
    warning = function(x) { w <<- c(w, conditionMessage(x)); invokeRestart('muffleWarning') })
  b <- as.numeric(coef(fit)); V <- unname(vcov(fit)); p <- length(b)
  xref <- min(d$dose)
  basis <- function(x) if (model == 'linear') cbind(x) else cbind(x, x^2)
  Xp <- sweep(basis(pdose), 2, as.numeric(basis(xref)), '-')
  lp <- as.numeric(Xp %*% b); sp <- sqrt(pmax(0, rowSums((Xp %*% V) * Xp)))
  g <- gof(fit)
  q <- if (fit$proc == '2stage') qtest(fit) else NULL
  wt <- waldtest(b = b, Sigma = V, Terms = 1:p)
  wn <- if (p > 1) waldtest(b = b, Sigma = V, Terms = 2:p) else NULL
  ll <- tryCatch(as.numeric(logLik(fit)), error = function(e) NA)
  out <- list(name = name, proc_used = fit$proc, method_used = fit$method, warnings = w, k = length(unique(d$id)),
    coef = b, vcov = as.numeric(V), Psi = if (!is.null(fit$Psi) && fit$method != 'fixed') as.numeric(fit$Psi) else NULL,
    logLik = ll,
    qtest = if (!is.null(q)) list(Q = as.numeric(q$Q), df = as.numeric(q$df), p = as.numeric(q$pvalue)) else NULL,
    wald = as.numeric(wt$chitest), waldNonlin = if (!is.null(wn)) as.numeric(wn$chitest) else NULL,
    gof = list(D = as.numeric(g$deviance$D), R2 = as.numeric(g$R2), R2adj = as.numeric(g$R2adj), resid = as.numeric(g$tdata$tresiduals)),
    pred = list(dose = pdose, pred = lp, se = sp), xref = xref)
  cat('ALMJSON:', toJSON(out, digits = NA, auto_unbox = TRUE, null = 'null', na = 'null'), '\n', sep = '')
}
pd <- c(-15, 0, 10, 30)
run('neg-quadratic-gl-2stage-reml', neg, 'quadratic', 'gl', '2stage', 'reml', pd)
run('neg-linear-gl-2stage-reml', neg, 'linear', 'gl', '2stage', 'reml', pd)
run('neg-quadratic-gl-1stage-reml', neg, 'quadratic', 'gl', '1stage', 'reml', pd)
run('frac-linear-gl-2stage-reml', frac, 'linear', 'gl', '2stage', 'reml', c(5, 20, 40))
run('frac-quadratic-gl-2stage-reml', frac, 'quadratic', 'gl', '2stage', 'reml', c(5, 20, 40))
run('frac-linear-h-2stage-fixed', frac, 'linear', 'h', '2stage', 'fixed', c(5, 20, 40))
run('one-linear-gl-2stage-reml', one, 'linear', 'gl', '2stage', 'reml', c(10, 30, 60))
run('one-quadratic-gl-2stage-reml', one, 'quadratic', 'gl', '2stage', 'reml', c(10, 30, 60))
run('one5-linear-h-1stage-ml', one5, 'linear', 'h', '1stage', 'ml', c(10, 20))
# meta-regression with a single study
r <- tryCatch({ dd <- one; dd$cov <- 3
  fit <- dosresmeta(logrr ~ dose, id = id, type = type, se = se, cases = cases, n = n, data = dd, mod = ~ cov, proc = '2stage', method = 'reml')
  paste('MOD1 fitted: proc', fit$proc, 'method', fit$method, 'coef', paste(format(coef(fit), digits = 17), collapse = ' '))
}, error = function(e) paste('MOD1 ERROR:', conditionMessage(e)))
cat(r, '\n')
cat('gof names:', names(gof(dosresmeta(logrr ~ dose, id = id, type = type, se = se, cases = cases, n = n, data = ex))), '\n')
