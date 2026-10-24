# Refusal policy: excess fields or missing required values, decimal commas in comma-separated
# numeric cells, CI text in SE cells, and ratio headers with CI are refused.
# n/sd/N/sample size and se/sei are never aliases of variance. No conversion.
args <- commandArgs(trailingOnly=FALSE)
script <- sub('^--file=', '', args[grepl('^--file=', args)])
tests <- dirname(dirname(normalizePath(script)))
fixtures <- file.path(tests, 'fixtures', 'p0parse')
out <- file.path(tests, 'rchecks-out', 'p0parse')
rules <- read.csv(file.path(fixtures,'rules.csv'), stringsAsFactors=FALSE)
schemas <- read.csv(file.path(fixtures,'schema.csv'), stringsAsFactors=FALSE)
value_keys <- c('yi','se','vi','year','or','lower','upper','e1','n1','e2','n2')
read_chars <- function(path) read.csv(path, colClasses='character', check.names=FALSE, na.strings='', blank.lines.skip=TRUE)
equal_table <- function(a,b) {
 if (!identical(names(a),names(b)) || nrow(a)!=nrow(b)) return(FALSE)
 if (!identical(a$study,b$study)) return(FALSE)
 for (key in value_keys) {
  x <- suppressWarnings(as.numeric(a[[key]])); y <- suppressWarnings(as.numeric(b[[key]]))
  if (!identical(is.na(x),is.na(y))) return(FALSE)
  keep <- !is.na(x)
  if (any(!is.finite(x[keep])) || any(!is.finite(y[keep])) || any(abs(x[keep]-y[keep])>1e-9)) return(FALSE)
 }
 TRUE
}
plant_detected <- FALSE
for (i in seq_len(nrow(rules))) {
 id <- rules$id[i]
 cat(sprintf('Checking %s\n', id))
 for (suffix in c('.csv','-refused.csv')) {
  path <- file.path(out,paste0(id,suffix))
  if (!file.exists(path)) stop(sprintf('%s: missing page output; browser case did not complete: %s',id,path))
 }
 schema <- schemas[schemas$id == id, ]
 sep <- switch(rules$separator[i], semicolon=';', tab='\t', comma=',')
 # Interpret tab escape explicitly; read.csv2 handles decimal-comma semicolons.
 if (rules$separator[i]=='tab') sep <- intToUtf8(9)
 lines <- readLines(file.path(fixtures,paste0(id,'.csv')),warn=FALSE)
 headers <- strsplit(lines[1],sep,fixed=TRUE)[[1]]
 refused <- integer()
 for (j in seq_len(length(lines)-1L)) {
  line <- lines[j+1L]
  count <- count.fields(textConnection(line),sep=sep,quote='"',comment.char='')
  bad <- length(count)!=1L || count>length(headers)
  ratio_headers <- headers[tolower(headers) %in% c('or','rr','hr','lower','upper','lcl','ucl')]
  if (any(tolower(headers) %in% c('or','rr','hr')) && any(tolower(headers) %in% c('lower','upper','lcl','ucl')) && any(!ratio_headers %in% schema$name)) bad <- TRUE
  if (!bad) {
   row <- read.table(text=paste(lines[1],line,sep='\n'),sep=sep,header=TRUE,quote='"',colClasses='character',comment.char='',check.names=FALSE,fill=TRUE,na.strings='')
   names(row) <- headers
   for (key in schema$name[schema$required]) {
    if (!key %in% headers || is.na(row[[key]][1]) || trimws(row[[key]][1])=='') bad <- TRUE
   }
   for (key in intersect(schema$name[schema$type %in% c('int','float')],headers)) {
    value <- row[[key]][1]
    if (is.na(value)) next
    if (schema$type[match(key,schema$name)]=='int' && grepl(',',value,fixed=TRUE)) bad <- TRUE
    if (sep==',' && grepl('[0-9],[0-9]',value)) bad <- TRUE
    if (key %in% c('se','sei') && grepl('[0-9][[:space:]]*([(]|[-–][[:space:]]*[0-9])',value)) bad <- TRUE
   }
  }
  if (bad) refused <- c(refused,j)
 }
 kept <- setdiff(seq_len(length(lines)-1L),refused)
 clean <- paste(c(lines[1],lines[kept+1L]),collapse='\n')
 # Base R independently parses the same accepted source records.
 if (sep==';') data <- read.csv2(text=clean,colClasses='character',check.names=FALSE)
 else data <- read.csv(text=clean,sep=sep,colClasses='character',check.names=FALSE)
 expected <- data.frame(study=data$study,stringsAsFactors=FALSE)
 for (key in value_keys) expected[[key]] <- rep(NA_real_,nrow(data))
 for (key in intersect(value_keys,names(data))) expected[[key]] <- as.numeric(if(sep!=',') sub(',','.',data[[key]],fixed=TRUE) else data[[key]])
 actual <- read_chars(file.path(out,paste0(id,'.csv')))
 actual_refused <- read.csv(file.path(out,paste0(id,'-refused.csv')))$row
 stopifnot(identical(as.integer(actual_refused),as.integer(refused)),equal_table(actual,expected))
 if (id=='control') {
  planted <- actual
  planted$yi[1] <- as.character(as.numeric(planted$yi[1])+0.01)
  stopifnot(!equal_table(planted,expected))
  plant_detected <- TRUE
  cat('PLANT_DETECTED\n')
 }
}
stopifnot(plant_detected,nrow(rules)>0)
cat('R_CHECK_PASS\n')
