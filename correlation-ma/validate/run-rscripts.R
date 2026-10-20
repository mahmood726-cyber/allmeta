# run-rscripts.R -- execute every script written by plus-check.cjs --write-r <dir> and collect its ALMJSON line.
# Each script is sourced in a fresh environment with its stdout captured; the result is exactly what
# `Rscript <file>` prints (a subset is also run as standalone Rscript processes: see standalone.txt).
suppressPackageStartupMessages(library(metafor))
print(.libPaths()); print(R.version.string); print(packageVersion('metafor'))
source('json17.R')
dir <- Sys.getenv('P17_RSCRIPT_DIR', unset='rscripts')
files <- sort(list.files(dir, pattern='\\.R$'))
excl <- Sys.getenv('P17_RSCRIPT_EXCLUDE', unset='')
if (nzchar(excl)) files <- files[!grepl(excl, files)]
outfile <- Sys.getenv('P17_RSCRIPT_OUT', unset='rscript-results.json')
res <- list(); bad <- 0
for (f in files) {
  out <- tryCatch(capture.output(sys.source(file.path(dir, f), envir=new.env(parent=globalenv()))), error=function(e) paste('ERROR:', conditionMessage(e)))
  aj <- grep('^ALMJSON:', out, value=TRUE)
  rec <- list(file=f, n_almjson=length(aj), error=any(grepl('^ERROR:', out)))
  if (length(aj) == 1) rec$almjson_raw <- sub('^ALMJSON:', '', aj) else bad <- bad + 1
  res[[length(res)+1]] <- rec
}
# emit: raw ALMJSON strings are already JSON objects; splice them in verbatim
con <- file(outfile, 'w', encoding='UTF-8')
cat('[', file=con)
for (i in seq_along(res)) {
  r <- res[[i]]
  cat(if (i > 1) ',' else '', '{"file":', encodeString(r$file, quote='"'), ',"n_almjson":', r$n_almjson, ',"error":', if (r$error) 'true' else 'false',
      if (!is.null(r$almjson_raw)) paste0(',"almjson":', r$almjson_raw) else '', '}', sep='', file=con)
}
cat(']\n', file=con); close(con)
cat(sprintf('RSCRIPTS: %d scripts executed; %d with exactly one ALMJSON line; %d without\n', length(res), length(res) - bad, bad))
