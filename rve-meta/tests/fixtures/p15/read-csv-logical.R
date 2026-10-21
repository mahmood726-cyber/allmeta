# Generates read-csv-logical.json: how R 4.6.0's read.csv types a cluster
# column of T/F/TRUE/FALSE tokens, and the as.factor() levels robumeta sees.
# Rscript rve-meta/tests/fixtures/p15/read-csv-logical.R  (R 4.6.0, Windows x64,
# LC_COLLATE=C)
#
# type.convert() tries logical first: a column whose entries are all exactly
# T, F, TRUE or FALSE (case-sensitive; quotes are removed first, surrounding
# whitespace inside quotes is kept) is logical, and factor(<logical>) has the
# levels "FALSE" < "TRUE". "true", "True" and " T" are character.
invisible(Sys.setlocale('LC_COLLATE', 'C'))
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[[1]] else 'read-csv-logical.json'
str <- function(s) encodeString(s, quote = '"')
arr <- function(z) paste0('[', paste(z, collapse = ','), ']')
cases <- list(c('T', 'TRUE'), c('F', 'T', 'FALSE', 'TRUE', 'F'), c('"T"', 'F', 'FALSE'),
              c('true', 'false'), c('True', 'False'), c('T', 't'), c('"T "', 'F'),
              c('" T"', 'T'), c('TRUE', '1'), c('tRUE', 'F'), c('T', 'F', 'true'),
              c('T', 'True'), c('FALSE', 'F', 'F'))
enc <- vapply(cases, function(s) {
  d <- read.csv(text = paste0('id,y\n', paste0(s, ',1', collapse = '\n')))
  f <- as.factor(d$id)
  paste0('{"input":', arr(vapply(s, str, '')), ',"class":', str(class(d$id)),
         ',"levels":', arr(vapply(levels(f), str, '')), ',"codes":', arr(as.integer(f)), '}')
}, '')
writeLines(paste0('{"generated_by":"rve-meta/tests/fixtures/p15/read-csv-logical.R","R":',
                  str(R.version.string), ',"LC_COLLATE":', str(Sys.getlocale('LC_COLLATE')),
                  ',"cases":', arr(enc), '}'), out, useBytes = TRUE)
cat('wrote', out, length(cases), 'cases\n')
