# Preserve exact input coordinates without reserializing computed R references.
# jsonlite's digits=NA export rounded one 16-digit input in the first run.
preserve_input_coordinates <- function(text, coordinates) {
  pattern <- '"x"\\s*:\\s*-?[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?'
  positions <- gregexpr(pattern, text, perl = TRUE)
  tokens <- regmatches(text, positions)[[1]]
  before <- jsonlite::fromJSON(text, simplifyVector = FALSE)
  stopifnot(length(tokens) == length(coordinates),
    length(before$chi_square) == length(coordinates))
  expected <- vapply(coordinates, function(pair) as.numeric(pair[[1]]), numeric(1))
  stopifnot(all(is.finite(expected)))
  for (i in seq_along(tokens)) {
    token_value <- jsonlite::fromJSON(paste0("{", tokens[[i]], "}"))$x
    stopifnot(identical(token_value, before$chi_square[[i]]$x))
    if (!isTRUE(token_value == expected[[i]])) {
      tokens[[i]] <- paste0('"x": ', sprintf("%.17g", expected[[i]]))
    }
  }
  fixed <- text
  regmatches(fixed, positions) <- list(tokens)
  after <- jsonlite::fromJSON(fixed, simplifyVector = FALSE)
  for (i in seq_along(expected)) {
    stopifnot(isTRUE(after$chi_square[[i]]$x == expected[[i]]))
    before$chi_square[[i]]$x <- after$chi_square[[i]]$x
  }
  # Both structural and byte-level guards: no reference p-value, estimate,
  # uncertainty, version, or other field may change during the repair.
  stopifnot(identical(before, after),
    identical(gsub(pattern, '"x": INPUT', text, perl = TRUE),
              gsub(pattern, '"x": INPUT', fixed, perl = TRUE)))
  fixed
}
