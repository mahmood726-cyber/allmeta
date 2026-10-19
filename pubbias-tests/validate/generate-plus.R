# Native R references for the pubbias-tests #alm-plus panel (PET-PEESE and leave-one-out sensitivity).
# Run from pubbias-tests/:  Rscript validate/generate-plus.R
# Inputs: validate/corpus/corpus.json (the unchanged 152-configuration paper corpus).
# Output: validate/plus-corpus/reference-plus-raw.json (canonicalised and pinned by validate/pin-plus.mjs).
# Egger, Begg, trim-and-fill, Peters and Harbord use exactly the calls of the publication archive's
# bench/original/reference-one.R; PET and PEESE use metafor::regtest(yi, vi=vi, model="lm", predictor="sei"/"vi").
.libPaths(c(Sys.getenv('R_LIBS_USER'), strsplit(Sys.getenv('R_LIBS'), ';')[[1]], .libPaths()))
cat('libPaths:', paste(.libPaths(), collapse=' | '), '\n')
suppressMessages({library(metafor); library(meta); library(jsonlite)})
versions <- list(R=R.version.string, metafor=as.character(packageVersion('metafor')),
                 meta=as.character(packageVersion('meta')), jsonlite=as.character(packageVersion('jsonlite')))
cat('versions:', paste(names(versions), unlist(versions), sep='=', collapse='; '), '\n')
SMOKE <- nzchar(Sys.getenv('PLUS_SMOKE'))  # local development smoke run only; never used for the pinned reference
if (!SMOKE && (versions$metafor != '5.2.1' || versions$meta != '8.5.0')) stop('Expected metafor 5.2-1 and meta 8.5-0')
options(warn=1)

js <- function(x) {
 if(is.null(x)) return('null')
 if(is.list(x)) {v<-vapply(x,js,''); if(!is.null(names(x)))return(paste0('{',paste(paste0(vapply(names(x),js,''),':',v),collapse=','),'}'));return(paste0('[',paste(v,collapse=','),']'))}
 if(length(x)!=1)return(paste0('[',paste(vapply(as.list(x),js,''),collapse=','),']'))
 if(is.na(x))return('null')
 if(is.character(x))return(paste0('"',gsub('\n','\\n',gsub('"','\\"',gsub('\\','\\\\',x,fixed=TRUE),fixed=TRUE),fixed=TRUE),'"'))
 if(is.logical(x))return(if(x)'true' else 'false')
 if(!is.finite(x))return('null');sprintf('%.17g',x)
}
# Same capture contract as the archive: errors become {error}, warnings are recorded; 120-second guard.
capture <- function(expr) {
 w <- character()
 setTimeLimit(elapsed=120, transient=TRUE); on.exit(setTimeLimit(elapsed=Inf))
 value <- tryCatch(withCallingHandlers(expr, warning=function(e){w<<-c(w,conditionMessage(e));invokeRestart('muffleWarning')}),
                   error=function(e) list(error=conditionMessage(e)))
 if (length(w)) value$warnings <- w
 value
}
reg <- function(y, v, predictor) {
 z <- regtest(y, vi=v, model='lm', predictor=predictor, ret.fit=TRUE); s <- coef(summary(z$fit))
 list(est=unname(z$est), ci_lb=unname(z$ci.lb), ci_ub=unname(z$ci.ub), se=unname(s[1,2]), t=unname(s[1,3]), p=unname(s[1,4]),
      slope=unname(s[2,1]), slope_t=unname(z$zval), slope_p=unname(z$pval), df=unname(z$dfs))
}
ALPHA <- 0.05; TIE <- 1e-9
conditional <- function(pet, peese) {
 if (!is.null(pet$error)) return(list(error=pet$error))
 if (abs(pet$p - ALPHA) <= TIE) return(list(error='alpha-tie'))
 branch <- if (pet$p < ALPHA) 'PEESE' else 'PET'; r <- if (branch == 'PET') pet else peese
 if (!is.null(r$error)) return(list(error=r$error))
 list(branch=branch, est=r$est, ci_lb=r$ci_lb, ci_ub=r$ci_ub)
}
tests <- function(y, v, b) {
 r <- list()
 r$egger <- capture({m<-rma(y,v,method='REML');z<-regtest(m,model='lm',predictor='sei',ret.fit=TRUE);list(statistic=z$zval,p=z$pval,limit=as.numeric(coef(z$fit)[1]))})
 if (!is.null(r$egger$error)) r$egger$fallback_vector_form <- capture({z<-regtest(y,vi=v,model='lm',predictor='sei',ret.fit=TRUE);list(statistic=z$zval,p=z$pval,limit=as.numeric(coef(z$fit)[1]))})
 r$begg <- capture({z<-ranktest(y,vi=v);list(tau=unname(z$tau),p=z$pval)})
 r$trimfill <- capture({z<-trimfill(rma(y,v,method='REML'),estimator='L0');list(k0=z$k0,side=z$side,est=as.numeric(z$b))})
 # Diagnostic only (never used as the reference value): when trimfill refuses, refit the side-determining REML
 # meta-regression rma(yi, vi, mods=sqrt(vi)) with step halving (stepadj=0.5, maxiter=1000) and pass its side.
 if (!is.null(r$trimfill$error)) r$trimfill$fallback_side <- capture({s<-rma(y,v,mods=sqrt(v),method='REML',control=list(stepadj=0.5,maxiter=1000));sd<-if(coef(s)[2]<0)'right' else 'left';z<-trimfill(rma(y,v,method='REML'),side=sd,estimator='L0');list(k0=z$k0,side=z$side,est=as.numeric(z$b))})
 r$pet <- capture(reg(y, v, 'sei')); r$peese <- capture(reg(y, v, 'vi')); r$conditional <- conditional(r$pet, r$peese)
 if (!is.null(b)) for (method in c('Peters','Harbord')) {
  key <- tolower(method)
  r[[key]] <- capture({z<-metabias(metabin(b$e1,b$n1,b$e2,b$n2,sm='OR',method='Inverse',allstudies=TRUE),method.bias=method,k.min=3);list(statistic=unname(z$statistic),p=z$p.value)})
  if (is.null(r[[key]]$error) && (length(r[[key]]$statistic)==0 || is.na(r[[key]]$statistic)) && (length(r[[key]]$p)==0 || is.na(r[[key]]$p))) r[[key]] <- list(error='meta::metabias returned no statistic or p-value (insufficient informative rows)')
  if (!is.null(r[[key]]$error)) r[[key]]$fallback_dl <- capture({z<-metabias(metabin(b$e1,b$n1,b$e2,b$n2,sm='OR',method='Inverse',allstudies=TRUE,method.tau='DL'),method.bias=method,k.min=3);list(statistic=unname(z$statistic),p=z$p.value)})
 }
 r
}
sig <- function(x) if (is.null(x$error) && !is.null(x$p) && is.finite(x$p)) x$p < ALPHA else NA
flags <- function(base, row) {
 f <- list()
 for (m in c('egger','begg','peters','harbord')) if (!is.null(base[[m]])) { a <- sig(base[[m]]); b <- sig(row[[m]]); f[[paste0(m,'_flip')]] <- if (is.na(a) || is.na(b)) NA else a != b }
 tb <- base$trimfill; tr <- row$trimfill
 f$trimfill_k0_change <- if (!is.null(tb$error) || !is.null(tr$error)) NA else tb$k0 != tr$k0
 cb <- base$conditional; cr <- row$conditional
 f$branch_change <- if (!is.null(cb$error) || !is.null(cr$error)) NA else cb$branch != cr$branch
 f
}

corpus <- fromJSON('validate/corpus/corpus.json', simplifyVector=FALSE)
stopifnot(length(corpus) == 152)
if (SMOKE) corpus <- corpus[as.integer(strsplit(Sys.getenv('PLUS_SMOKE'), ',')[[1]])]
LOO_MIN <- 4; LOO_MAX <- 100
out <- list(); t0 <- Sys.time()
for (d in corpus) {
 y <- as.numeric(unlist(d$yi)); v <- as.numeric(unlist(d$vi)); k <- length(y)
 b <- if (is.null(d$binary)) NULL else data.frame(e1=sapply(d$binary,`[[`,'e1'), n1=sapply(d$binary,`[[`,'n1'), e2=sapply(d$binary,`[[`,'e2'), n2=sapply(d$binary,`[[`,'n2'))
 full <- list(pet=capture(reg(y, v, 'sei')), peese=capture(reg(y, v, 'vi')))
 full$conditional <- conditional(full$pet, full$peese)
 entry <- list(k=k, binary=!is.null(b), full=full)
 if (k < LOO_MIN) entry$loo <- list(error='loo-requires-k-4')
 else if (k > LOO_MAX) entry$loo <- list(error='loo-k-above-100')
 else {
  base <- tests(y, v, b); rows <- list(c(list(omit=NULL), base))
  for (i in seq_len(k)) {
   r <- tests(y[-i], v[-i], if (is.null(b)) NULL else b[-i, , drop=FALSE])
   rows[[i+1]] <- c(list(omit=i), r, list(flags=flags(base, r)))
  }
  entry$loo <- list(rows=rows)
 }
 out[[d$id]] <- entry
 cat(sprintf('%s k=%d %.1fs\n', d$id, k, as.numeric(difftime(Sys.time(), t0, units='secs'))))
}
res <- list(schema='pubbias-tests-plus-reference-v1', versions=versions,
 settings=list(alpha=ALPHA, tie=TIE, loo_min_k=LOO_MIN, loo_max_k=LOO_MAX, time_limit_seconds=120,
  egger="regtest(rma(y,v,method='REML'),model='lm',predictor='sei',ret.fit=TRUE)", begg='ranktest(y,vi=v)',
  trimfill="trimfill(rma(y,v,method='REML'),estimator='L0')", pet="regtest(y,vi=v,model='lm',predictor='sei',ret.fit=TRUE)",
  peese="regtest(y,vi=v,model='lm',predictor='vi',ret.fit=TRUE)",
  peters_harbord="metabias(metabin(e1,n1,e2,n2,sm='OR',method='Inverse',allstudies=TRUE),method.bias=M,k.min=3)"),
 datasets=out)
dir.create('validate/plus-corpus', showWarnings=FALSE)
writeLines(js(res), if (SMOKE) Sys.getenv('PLUS_SMOKE_OUT') else 'validate/plus-corpus/reference-plus-raw.json', useBytes=TRUE)
cat('DONE', length(out), 'configurations', format(Sys.time()), '\n')
