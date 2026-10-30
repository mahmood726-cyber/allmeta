# Execute actual downloaded scripts in separate R processes, asserting exit code AND verdict.
artifact_dir <- file.path(dirname(tempdir()), 'p11-r3-plot-export')
stopifnot(dir.exists(artifact_dir))
setwd(artifact_dir)
cases <- c('control', 'baujat.x', 'baujat.y', 'radial.x', 'radial.z', 'radial.resid', 'radial.slope', 'table', 'exclusion', 'boundary')
failed <- character()
for (name in cases) {
  planted <- !(name %in% c('control', 'exclusion', 'boundary'))
  output <- suppressWarnings(system2(file.path(R.home('bin'), 'Rscript'), shQuote(paste0(name, '.R')), stdout=TRUE, stderr=TRUE))
  status <- attr(output, 'status'); if (is.null(status)) status <- 0L
  quantity <- if (name == 'table') 'inf.dffits' else name
  ok <- if (planted) status == 1L && any(grepl(paste0('FAIL ', quantity, '[1]:'), output, fixed=TRUE)) && !any(grepl('ALL ', output, fixed=TRUE)) else status == 0L && any(grepl('ALL ', output, fixed=TRUE))
  writeLines(output, paste0(name, '.log'))
  cat(if (ok) 'PASS' else 'FAIL', name, 'exit', status, '\n')
  cat(paste(output[grepl('^(ALL |FAIL |metafor |Error)', output)], collapse='\n'), '\n')
  if (!ok) failed <- c(failed, name)
}
cat(R.version.string, '; metafor ', as.character(packageVersion('metafor')), '\n', sep='')
if (length(failed)) stop('Verification assertions failed: ', paste(failed, collapse=', '))
