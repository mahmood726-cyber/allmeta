# Base-R regression controls, invoked before the numerical cross-check. These
# are synthetic dependency-policy probes, never scientific example evidence.
check_runtime_package_controls <- function() {
  approved <- c('metafor','meta','netmeta','metadat','mada','metasens','robumeta','clubSandwich')
  for (pkg in approved) validate_runtime_packages(pkg)
  validate_runtime_packages(approved)
  for (bad in list('unapproved', c('metafor','unapproved'), character(), NA_character_, '', 1)) {
    rejected <- tryCatch({validate_runtime_packages(bad); FALSE}, error=function(e) TRUE)
    need(rejected, 'Planted invalid runtime package list escaped')
  }
  # Exercise check_one itself: a pinned source-only package must reach the
  # independent source validator, without being treated as a runtime import.
  probe <- new.env(parent=environment(check_one))
  probe$read_evidence <- function(...) list(data=list(source_package='source_only'), artifact=list(packages='metafor'))
  probe$validate_source <- function(d,root) {
    need(identical(d$source_package,'source_only'), 'Probe source changed')
    stop('SOURCE_VALIDATOR_REACHED', call.=FALSE)
  }
  check_probe <- check_one
  environment(check_probe) <- probe
  message <- tryCatch({check_probe('',list(),''); ''}, error=function(e) conditionMessage(e))
  need(identical(message,'SOURCE_VALIDATOR_REACHED'), 'Source provenance was mistaken for a runtime dependency')
  cat('RUNTIME_PACKAGE_CONTROLS_PASS\n')
  invisible(TRUE)
}
