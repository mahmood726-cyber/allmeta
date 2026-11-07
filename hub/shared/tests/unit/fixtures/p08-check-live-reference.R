# Run from wt/. Compare the actual desktop/live function, without changing pins.
suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))
fixture <- fromJSON('hub/shared/tests/unit/fixtures/p08-ml-review-reference.json', simplifyVector=FALSE)
source('meta-regression/validate/reference.R')
fixed <- plus_reference
# The committed protocol is the original live function followed by its inputs.
protocol <- paste(readLines('meta-regression/validate/plus/live-protocol.R', warn=FALSE), collapse='\n')
originalSource <- strsplit(protocol, '\nc <- list', fixed=TRUE)[[1]][1]
oldEnvironment <- new.env()
eval(parse(text=originalSource), envir=oldEnvironment)
original <- oldEnvironment$plus_reference

check <- function(actual, expected, scale) {
  failures <- character()
  if (!identical(actual$status, 'ok')) return(paste('status', actual$status, actual$reason))
  for (model in c('full','reduced','comparison')) for (key in names(expected[[model]])) {
    a <- unlist(actual[[model]][[key]]); b <- unlist(expected[[model]][[key]])
    unit <- if(key=='tau2') scale^2 else if(key %in% c('beta','se','ciLo','ciHi')) scale else 1
    if(length(a)!=length(b) || any(!is.finite(a)) || any(abs(a/unit-b/unit)>1e-9))
      failures <- c(failures, paste(model,key,sep='.'))
  }
  failures
}
failed <- 0L
for (record in fixture$records) {
  input <- record$input; input$mods <- lapply(input$mods, unlist)
  before <- check(original(input), record$expected, record$scale)
  actual <- fixed(input)
  after <- check(actual, record$expected, record$scale)
  # The original ordinary-unit fit is also an independent plot-unit control.
  control <- fixture$records[[which(vapply(fixture$records,
    function(r) r$case==record$case && r$scale==1, logical(1)))]]$input
  control$mods <- lapply(control$mods, unlist)
  plotReference <- original(control)$plot
  for (key in names(plotReference)) {
    unit <- if(key %in% c('pred','se','ciLo','ciHi')) record$scale else 1
    a <- unlist(actual$plot[[key]]); b <- unlist(plotReference[[key]])
    if(length(a)!=length(b) || any(abs(a/unit-b)>1e-9)) after <- c(after,paste0('plot.',key))
  }
  cat('LIVE_REFERENCE ',record$case,' scale=',record$scale,
      ' original_failures=',length(before),' fixed_failures=',length(after),
      ' fields=',paste(after,collapse=','),'\n',sep='')
  # Test sensitivity: small-unit plants fail, ordinary-unit controls pass.
  if(record$scale %in% c(1e-6,1e-8)) stopifnot(length(before)>0)
  if(record$scale==1) stopifnot(length(before)==0)
  failed <- failed + length(after)
}
scaleFixture <- fromJSON('hub/shared/tests/unit/fixtures/p08-ml-reference.json', simplifyVector=FALSE)
for (record in scaleFixture$records) {
  input <- record$input; input$mods <- lapply(input$mods, unlist)
  after <- check(fixed(input), record$expected, record$scale)
  cat('LIVE_SCALE_REFERENCE ',record$case,' scale=',record$scale,
      ' fixed_failures=',length(after),' fields=',paste(after,collapse=','),'\n',sep='')
  failed <- failed + length(after)
}
cat(toJSON(list(R=R.version.string, metafor=as.character(packageVersion('metafor')),
               jsonlite=as.character(packageVersion('jsonlite'))),auto_unbox=TRUE),'\n')
stopifnot(failed==0L)
