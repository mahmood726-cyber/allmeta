# Execute the Shinylive app's own server() (app.R from app.json) in plain Rscript, without
# shiny/bs4Dash/DT: the reactive()/render*() calls are replaced by minimal stand-ins that
# evaluate the app's expressions on demand. Only the server code and sample_data are run;
# the ui and library() calls are skipped. Needs metafor (and readr when a CSV is given).
#
# Usage: Rscript run_app_server.R <app.R> <conf_level> <input_ci_level> <method> [csv]
# Prints one line per text output: "OUT<TAB><name><TAB><text>" and one "NUM" line.
args <- commandArgs(trailingOnly = TRUE)
app <- args[1]
suppressPackageStartupMessages(library(metafor))
exprs <- parse(app, keep.source = FALSE)
keep <- Filter(function(e) is.call(e) && identical(e[[1]], as.name("<-")) &&
                 as.character(e[[2]]) %in% c("sample_data", "server"), as.list(exprs))
stopifnot(length(keep) == 2)

lazy <- function(expr, ...) { e <- substitute(expr); env <- parent.frame(); function() eval(e, env) }
reactive <- lazy
renderPlot <- renderDT <- function(expr, ...) function() NULL
renderPrint <- function(expr, ...) { e <- substitute(expr); env <- parent.frame()
  function() paste(utils::capture.output(print(eval(e, env))), collapse = "\n") }
observe <- function(...) invisible(NULL)
updateSelectInput <- function(...) invisible(NULL)
downloadHandler <- function(...) NULL
read_csv <- function(path, ...) as.data.frame(readr::read_csv(path, show_col_types = FALSE))
for (e in keep) eval(e)

input <- list(conf_level = args[2], input_ci_level = args[3], meta_method = args[4],
              debug_mode = FALSE, file = if (length(args) >= 5) list(datapath = args[5]) else NULL,
              remove_study = "None")
output <- new.env()
server(input, output, session = NULL)
for (nm in c("meta_ci", "sig_test", "prediction_interval"))
  cat("OUT\t", nm, "\t", gsub("[\r\n]+", " ", output[[nm]]()), "\n", sep = "")
r <- get("metaResult", get("env", environment(output$meta_ci)))()
pr <- get("predResult", get("env", environment(output$meta_ci)))()
cat(sprintf("NUM\tb=%.15g ci.lb=%.15g ci.ub=%.15g pval=%.15g pi.lb=%.15g pi.ub=%.15g k=%d\n",
            c(r$b), r$ci.lb, r$ci.ub, r$pval, pr$pi.lb, pr$pi.ub, r$k))
