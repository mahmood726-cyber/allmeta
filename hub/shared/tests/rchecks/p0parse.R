# Invalid cells are null; every source record is retained for consumer validation.
# Overflow invalidates all numeric cells; undeclared ratio + CI is not converted.
args <- commandArgs(trailingOnly=FALSE)
script <- sub('^--file=', '', args[grepl('^--file=', args)])
tests <- dirname(dirname(normalizePath(script)))
fixtures <- file.path(tests, 'fixtures', 'p0parse')
out <- file.path(tests, 'rchecks-out', 'p0parse')
rules <- read.csv(file.path(fixtures,'rules.csv'), stringsAsFactors=FALSE)
schemas <- read.csv(file.path(fixtures,'schema.csv'), stringsAsFactors=FALSE)
value_keys <- c('yi','se','sei','vi','year','or','lower','upper','e1','n1','e2','n2','TP','FN','FP','TN')
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
 source_headers <- headers
 # SE and sei name the same measurement; exact headers keep precedence.
 for (alias in c('se','sei')) {
  target <- if (alias=='se') 'sei' else 'se'
  if (alias %in% source_headers && !alias %in% schema$name && target %in% schema$name && !target %in% source_headers) {
   headers[headers==alias] <- target
  }
 }
 refused <- integer()
 expected <- data.frame(study=character(),stringsAsFactors=FALSE)
 for (key in value_keys) expected[[key]] <- numeric()
 ratio_headers <- headers[tolower(headers) %in% c('or','rr','hr','lower','upper','lcl','ucl')]
 invalid_ratio <- any(tolower(headers) %in% c('or','rr','hr')) && any(tolower(headers) %in% c('lower','upper','lcl','ucl')) && any(!ratio_headers %in% schema$name)
 for (j in seq_len(length(lines)-1L)) {
  line <- lines[j+1L]
  connection <- textConnection(line)
  count <- count.fields(connection,sep=sep,quote='"',comment.char='')
  close(connection)
  stopifnot(length(count)==1L)
  overflow <- count > length(headers)
  # Supply extra names so read.csv never silently treats a field as row names.
  full_headers <- c(source_headers,if (overflow) paste0('extra',seq_len(count-length(headers))) else character())
  text <- paste(paste(full_headers,collapse=sep),line,sep='\n')
  if (sep==';') row <- read.csv2(text=text,dec=',',colClasses='character',check.names=FALSE,fill=TRUE,na.strings='')
  else row <- read.csv(text=text,sep=sep,colClasses='character',check.names=FALSE,fill=TRUE,na.strings='')
  stopifnot(nrow(row)==1L)
  names(row)[seq_along(headers)] <- headers
  record <- data.frame(study=row$study,stringsAsFactors=FALSE)
  for (key in value_keys) record[[key]] <- NA_real_
  if (invalid_ratio) refused <- c(refused,j)
  if (overflow) refused <- c(refused,j)
  # Unmatched headers survive as trimmed text in the parser result. The page
  # export includes them too when their names occur in value_keys (e.g. se
  # with a vi schema). Preserve their source values; do not alias them to vi.
  for (key in intersect(setdiff(headers,schema$name),value_keys)) {
   if (invalid_ratio && key %in% ratio_headers) next
   record[[key]] <- trimws(row[[key]][1])
  }
  for (key in intersect(schema$name,headers)) {
   type <- schema$type[match(key,schema$name)]
   raw <- trimws(row[[key]][1])
   if (!type %in% c('int','float')) next
   if (overflow || invalid_ratio) next
   if (is.na(raw) || raw=='') next # main's existing missing int/float warning
   invalid <- FALSE
   if (type=='int' && grepl(',',raw,fixed=TRUE)) invalid <- TRUE
   else if (type=='float' && sep==',' && grepl('[0-9],[0-9]',raw)) invalid <- TRUE
   else if (key %in% c('se','sei') && grepl('[0-9][[:space:]]*([(]|[-–][[:space:]]*[0-9])',raw)) invalid <- TRUE
   if (invalid) { refused <- c(refused,j); next }
   value <- suppressWarnings(as.numeric(if(type=='float' && sep!=',') sub(',','.',raw,fixed=TRUE) else raw))
   if (!is.finite(value) || (type=='int' && value!=trunc(value))) value <- NA_real_
   if (key %in% value_keys) record[[key]] <- value
  }
  if (!invalid_ratio) {
   absent_required <- setdiff(schema$name[schema$required],headers)
   for (key in absent_required) refused <- c(refused,j)
  }
  expected <- rbind(expected,record)
 }
 # Regression control: an undeclared SE is preserved, never interpreted as variance.
 # These assertions fail with the old schema-only expected-table builder.
 if (id=='guard-se') {
  stopifnot(nrow(expected)==1L, identical(expected$se,"12"), is.na(expected$vi))
  lost_se <- expected
  lost_se$se[1] <- NA_real_
  aliased_vi <- expected
  aliased_vi$vi[1] <- 12
  stopifnot(!equal_table(lost_se,expected), !equal_table(aliased_vi,expected))
 }
 if (id=='variance-control') {
  stopifnot(nrow(expected)==1L, identical(expected$vi,0.0144), is.na(expected$se))
 }
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
