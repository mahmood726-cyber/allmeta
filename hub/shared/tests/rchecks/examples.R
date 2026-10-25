# Entry point required by the examples lane runner. Resolve paths from this file.
script <- sub('^--file=','',grep('^--file=',commandArgs(),value=TRUE)[1])
repo <- normalizePath(file.path(dirname(normalizePath(script)), '../../../..'))
root <- file.path(repo,'validation','examples')
source(file.path(root,'check_examples.R'))
status <- tryCatch(run_examples(root),error=function(e) {cat('EXAMPLES ERROR:',conditionMessage(e),'\n');1L})
quit(save='no',status=status)
