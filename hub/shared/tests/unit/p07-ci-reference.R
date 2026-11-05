# Re-run the original oracle without changing the pinned fixture. Its script,
# input, versions and newly generated values are printed for wrapper feedback;
# the disposable output stays in R's temporary directory.
script <- "hub/shared/tests/unit/p07-translation-reference.R"
code <- readLines(script, warn = FALSE)
assignment <- grep("^reference_path <-", code)
stopifnot(length(assignment) == 1L)
code[assignment] <- 'reference_path <- tempfile("p07-reference-", fileext = ".json")'
eval(parse(text = code), envir = new.env(parent = globalenv()))
