# Independent base-R checks of browser downloads. No JS readers or JSON packages.
args <- commandArgs(trailingOnly = FALSE)
script <- sub('^--file=', '', args[grepl('^--file=', args)])
root <- normalizePath(file.path(dirname(script), '..', 'rchecks-out', 'figpresets'), mustWork = TRUE)
check <- function(ok, message) if (!isTRUE(ok)) stop(message, call. = FALSE)
near <- function(a, b, tolerance = 0.01) is.finite(a) && abs(a - b) <= tolerance
bytes <- function(path) readBin(path, 'raw', n = file.info(path)$size)
# All binary offsets below are zero-based, matching file specifications.
uint <- function(b, offset, size, little = FALSE) {
  check(offset >= 0 && offset + size <= length(b), 'Truncated binary field')
  values <- as.integer(b[seq.int(offset + 1, offset + size)])
  sum(values * 256 ^ (if (little) seq.int(0, size - 1) else seq.int(size - 1, 0)))
}
text <- function(b, offset, size) rawToChar(b[seq.int(offset + 1, offset + size)])
png <- function(b) {
  check(identical(as.integer(b[1:8]), c(137L,80L,78L,71L,13L,10L,26L,10L)), 'Invalid PNG signature')
  offset <- 8; result <- list(); phys <- 0; ihdr <- 0; ended <- FALSE
  while (offset + 12 <= length(b)) {
    size <- uint(b, offset, 4); kind <- text(b, offset + 4, 4)
    check(offset + size + 12 <= length(b), 'Truncated PNG chunk')
    if (kind == 'IHDR') {
      check(size == 13 && offset == 8, 'Invalid PNG IHDR')
      ihdr <- ihdr + 1
      result$width <- uint(b, offset + 8, 4); result$height <- uint(b, offset + 12, 4)
    }
    if (kind == 'pHYs') {
      check(size == 9, 'Invalid PNG pHYs')
      phys <- phys + 1
      result$x <- uint(b, offset + 8, 4); result$y <- uint(b, offset + 12, 4)
      result$unit <- uint(b, offset + 16, 1)
    }
    offset <- offset + size + 12
    if (kind == 'IEND') { ended <- TRUE; break }
  }
  check(ended && phys == 1 && ihdr == 1, 'Missing/duplicate PNG metadata')
  result
}
tiff <- function(b) {
  order <- text(b, 0, 2); check(order %in% c('II', 'MM'), 'Invalid TIFF byte order')
  little <- order == 'II'
  u <- function(offset, size) uint(b, offset, size, little)
  check(u(2, 2) == 42, 'Invalid TIFF signature')
  ifd <- u(4, 4); count <- u(ifd, 2); tags <- list()
  for (i in seq_len(count)) {
    at <- ifd + 2 + (i - 1) * 12; tag <- u(at, 2); type <- u(at + 2, 2); n <- u(at + 4, 4)
    if (!tag %in% c(256, 257, 259, 282, 283, 296)) next
    check(n == 1, 'Unexpected TIFF metadata count')
    check(is.null(tags[[as.character(tag)]]), 'Duplicate TIFF tag')
    if (tag %in% c(282, 283)) {
      check(type == 5, 'TIFF resolution must be rational')
      ptr <- u(at + 8, 4); denominator <- u(ptr + 4, 4)
      check(denominator > 0, 'Invalid TIFF rational')
      value <- u(ptr, 4) / denominator
    } else {
      check(type %in% c(3, 4), 'Invalid TIFF integer type')
      value <- u(at + 8, if (type == 3) 2 else 4)
    }
    tags[[as.character(tag)]] <- value
  }
  check(all(c('256','257','259','282','283','296') %in% names(tags)), 'Missing TIFF metadata')
  tags
}
read_record <- function(name) {
  path <- file.path(root, name)
  check(file.exists(path), paste('Missing browser evidence:', name))
  read.csv(path, stringsAsFactors = FALSE, check.names = FALSE, na.strings = character(), fileEncoding = 'UTF-8')
}
validate <- function(record) {
  b <- bytes(file.path(root, record$file))
  width <- record$width_mm; dpi <- record$dpi; ratio <- record$ratio
  check(all(is.finite(c(width, dpi, ratio))) && min(width, dpi, ratio) > 0, 'Invalid expected settings')
  # JS rounds non-negative half pixels up; independent R implementation.
  px <- floor(width / 25.4 * dpi + 0.5); height <- floor(px * ratio + 0.5)
  if (record$format == 'png') {
    p <- png(b)
    check(p$x == floor(dpi / .0254 + .5) && p$y == floor(dpi / .0254 + .5) && p$unit == 1, 'PNG DPI mismatch')
    check(p$width == px && p$height == height, 'PNG pixel dimensions mismatch')
  } else if (record$format == 'tiff') {
    t <- tiff(b)
    check(t[['256']] == px && t[['257']] == height, 'TIFF pixel dimensions mismatch')
    check(t[['282']] == dpi && t[['283']] == dpi && t[['296']] == 2, 'TIFF DPI mismatch')
    check(record$compression %in% c('none','lzw'), 'Unknown TIFF compression')
    check(t[['259']] == if (record$compression == 'none') 1 else 5, 'TIFF compression mismatch')
  } else if (record$format == 'svg') {
    xml <- rawToChar(b)
    tag <- regmatches(xml, regexpr('<svg\\b[^>]*>', xml, perl = TRUE))
    check(length(tag) == 1 && nzchar(tag), 'Missing SVG root')
    attribute <- function(name) {
      match <- regmatches(tag, regexec(paste0('\\s', name, '="([0-9.eE+-]+)mm"'), tag, perl = TRUE))[[1]]
      check(length(match) == 2, paste('Missing SVG mm attribute:', name))
      as.numeric(match[2])
    }
    check(near(attribute('width'), width) && near(attribute('height'), width * ratio), 'SVG physical size mismatch')
  } else if (record$format == 'pdf') {
    check(text(b, 0, 5) == '%PDF-', 'Invalid PDF signature')
    # PDF image streams contain arbitrary bytes. Retain printable ASCII for dictionary matching.
    ascii <- b; ascii[as.integer(ascii) < 32 | as.integer(ascii) > 126] <- as.raw(32)
    pdf <- rawToChar(ascii)
    box <- regmatches(pdf, regexec('/MediaBox\\s*\\[([^]]+)\\]', pdf, perl = TRUE))[[1]]
    check(length(box) == 2, 'Missing PDF MediaBox')
    values <- scan(text = box[2], quiet = TRUE)
    check(length(values) == 4 && all(is.finite(values)), 'Invalid PDF MediaBox')
    check(near(values[3] - values[1], width / 25.4 * 72) &&
          near(values[4] - values[2], width / 25.4 * 72 * ratio), 'PDF physical size mismatch')
  } else stop('Unexpected export format')
  invisible(TRUE)
}

# Require the complete matrix: an absent/empty evidence folder cannot pass.
count <- 0
for (app in c('proportion-ma', 'heterogeneity', 'nma')) {
  for (preset in c('f1000', 'bmj')) {
    for (format in c('png', 'tiff', 'svg', 'pdf')) {
      name <- paste0(app, '-', preset, '.', format)
      record <- read_record(paste0(name, '.csv'))
      check(nrow(record) == 1 && record$file == name && record$app == app && record$preset == preset && record$format == format, 'Incorrect evidence identity')
      check(record$width_mm == if (preset == 'f1000') 75 else 85, 'Unexpected preset width')
      check(record$dpi == if (preset == 'f1000') 600 else 1200, 'Unexpected preset DPI')
      check(record$compression == if (preset == 'f1000') 'none' else 'lzw', 'Unexpected compression setting')
      validate(record); count <- count + 1
    }
  }
}
provenance <- read_record('provenance.csv')
check(nrow(provenance) == 8 && setequal(provenance$id, c('f1000','bmj','lancet','jama','nejm','plos','cochrane','custom')), 'Missing preset provenance')
warning <- "Unverified \u2014 check the journal's current author guide"
check(all(tolower(provenance$verified) == 'false') && all(tolower(provenance$visible) == 'true'), 'Unverified disclosure missing')
check(all(provenance$disclosure == paste0(provenance$name, ': ', warning)), 'Incorrect visible disclosure')
check(all(provenance$option == paste0(provenance$name, ' \u2014 ', warning)), 'Missing disclosure beside preset name')
check(provenance$source_url[provenance$id == 'custom'] == 'null', 'Custom must not imply a journal source')
check(all(grepl('^https://', provenance$source_url[provenance$id != 'custom'])), 'Journal source URL missing')
for (format in c('png', 'svg', 'pdf')) {
  name <- paste0('control-custom.', format)
  control <- read_record(paste0(name, '.csv'))
  check(nrow(control) == 1 && control$file == name && control$format == format && control$dpi == 300 && control$width_mm == 25.4, 'Invalid Custom control')
  validate(control)
}
plant <- read_record('plant-custom.png.csv')
check(nrow(plant) == 1 && plant$file == 'plant-custom.png' && plant$format == 'png' && plant$dpi == 300 && plant$width_mm == 25.4, 'Invalid plant expectation')
actual <- png(bytes(file.path(root, plant$file)))
check(actual$x == floor(150 / .0254 + .5) && actual$y == floor(150 / .0254 + .5) && actual$width == 150, 'Plant must be an actual 150-dpi export')
detected <- tryCatch({ validate(plant); FALSE }, error = function(e) identical(conditionMessage(e), 'PNG DPI mismatch'))
check(detected, 'Wrong-DPI plant was not rejected')
cat('PLANT_DETECTED\n')
cat(sprintf('Checked %d journal files, three Custom controls, and eight visible provenance disclosures\n', count))
cat('R_CHECK_PASS\n')
