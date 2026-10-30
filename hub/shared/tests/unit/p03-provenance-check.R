# Run from wt/. Both source runs and all generated artifacts use a temporary
# directory; the retained oracle, input and production code are never written.
script <- normalizePath('hub/shared/tests/unit/p03-diagnostics-reference.R')
fixture <- paste(readLines('hub/shared/tests/unit/p03-diagnostics-reference.json'), collapse = '')
input <- 'hub/shared/tests/unit/p03-diagnostics-input.csv'
lf <- gsub('\r\n', '\n', readChar(input, file.info(input)$size, useBytes = TRUE), fixed = TRUE)
expected_md5 <- sub('.*"input_md5":"([^"]+)".*', '\\1', fixture)
payload <- function(x) sub('^\\{"provenance":\\{[^}]*\\},', '', x)
run <- function(bytes) {
  original <- getwd()
  directory <- tempfile('p03-r-provenance-')
  dir.create(file.path(directory, 'hub/shared/tests/unit'), recursive = TRUE)
  on.exit({ setwd(original); unlink(directory, recursive = TRUE) })
  setwd(directory)
  writeBin(charToRaw(bytes), input)
  output <- capture.output(sys.source(script, envir = new.env()))
  trimws(tail(output, 1))
}
lf_result <- run(lf)
stopifnot(grepl(paste0('"input_md5":"', expected_md5, '"'), lf_result, fixed = TRUE))
stopifnot(identical(payload(lf_result), payload(fixture)))
cat('PASS: LF checksum and all retained numerical values\n')
crlf_result <- run(gsub('\n', '\r\n', lf, fixed = TRUE))
stopifnot(identical(crlf_result, lf_result))
cat('PASS: CRLF checksum and values equal LF\n')
changed_result <- run(sub(',85,', ',085,', lf, fixed = TRUE))
stopifnot(!grepl(paste0('"input_md5":"', expected_md5, '"'), changed_result, fixed = TRUE))
stopifnot(identical(payload(changed_result), payload(fixture)))
cat('PASS: non-newline byte change fails checksum while preserving parsed values\n')
