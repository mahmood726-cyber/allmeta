# Run an exported current-analysis script, then apply the browser comparison
# contract. No package installs or stored R references are used.
args <- commandArgs(trailingOnly=TRUE)
if (length(args) != 1L) stop('Usage: Rscript validation/live/check_live.R <json>')
main <- function(filename) {
  if (!file.exists(filename)) stop(paste('Export file not found:', filename, '(run scripts/xplat/dump-live.mjs)'))
  d <- jsonlite::fromJSON(filename, simplifyVector=FALSE)
  stopifnot(is.character(d$app), length(d$app)==1L, length(d$appValues)>0L)
  for (pkg in unlist(d$packages)) {
    if (!requireNamespace(pkg, quietly=TRUE)) stop(paste('Missing R package:', pkg))
    cat('PACKAGE', pkg, as.character(utils::packageVersion(pkg)), '\n')
  }
  cat('RVERSION', R.version.string, '\n')
  script_env <- new.env(parent=globalenv())
  output <- capture.output(eval(parse(text=d$script), envir=script_env))
  for (line in grep('^SERIALIZER ', output, value=TRUE)) cat(line, '\n')
  records <- grep('^ALMJSON:', output, value=TRUE)
  if (length(records) != 1L) stop('R must emit exactly one ALMJSON record')
  ref <- jsonlite::fromJSON(substring(records,9), simplifyVector=FALSE)
  keys <- vapply(d$appValues, function(v) v$key, '')
  if (anyDuplicated(keys) || anyDuplicated(names(ref)) || !setequal(keys,names(ref))) stop('Reference key coverage mismatch')
  finite_number <- function(x) is.numeric(x) && length(x)==1L && is.finite(x)
  compare <- function(a,r,kind,tol) {
    if (!(kind %in% c('abs','rel','exact'))) return(FALSE)
    # null == null is the declared unavailable-value contract.
    if (kind=='exact') {
      scalar <- function(x) length(x)==1L && (is.character(x) || is.logical(x) || finite_number(x))
      same_type <- (is.numeric(a)&&is.numeric(r)) || identical(typeof(a),typeof(r))
      return(scalar(a) && scalar(r) && same_type && isTRUE(a==r))
    }
    if (!finite_number(tol) || tol<0) return(FALSE)
    if (is.null(a) && is.null(r)) return(TRUE)
    if (!finite_number(a) || !finite_number(r)) return(FALSE)
    diff <- abs(a-r) / if(kind=='rel') max(1,abs(r)) else 1
    is.finite(diff) && diff<=tol
  }
  passed <- 0L
  for (v in d$appValues) {
    if (!all(c('key','label','value') %in% names(v))) stop('Malformed app value: key, label and value are required')
    kind <- d$compare$kind[[v$key]]
    if (is.null(kind)) kind <- 'abs'
    tol <- d$compare$tolerance[[v$key]]
    if (is.null(tol)) tol <- d$compare$tolerance$default
    ok <- compare(v$value,ref[[v$key]],kind,tol)
    if (ok) passed <- passed+1L else cat('MISS',v$key,'app=',jsonlite::toJSON(v$value,auto_unbox=TRUE,digits=NA),
      'R=',jsonlite::toJSON(ref[[v$key]],auto_unbox=TRUE,digits=NA),'kind=',kind,'tol=',tol,'\n')
  }
  cat(sprintf('LIVECHECK %s %d/%d\n',d$app,passed,length(keys)))
  if (passed==length(keys)) 0L else 1L
}
status <- tryCatch(main(args[1]),error=function(e) { cat('LIVECHECK ERROR:',conditionMessage(e),'\n'); 1L })
quit(save='no',status=status)
