# gen_hc_reference.R -- score every case in hc_testcases.json with metafor::hc()
# and write hc_reference.json. This is the authoritative reference the Python
# Henmi-Copas port is unit-tested against.
#
#   Rscript gen_hc_reference.R
#
# Personal library path (metafor installed there, Program Files lib not writable).
.libPaths("C:/Users/mahmo/Rlibs")
suppressMessages(library(metafor))
suppressMessages(library(jsonlite))

here  <- dirname(normalizePath(sub("--file=", "",
          grep("--file=", commandArgs(FALSE), value = TRUE)[1])))
cases <- fromJSON(file.path(here, "hc_testcases.json"), simplifyVector = FALSE)

out <- list()
for (cs in cases) {
   yi <- as.numeric(unlist(cs$y))
   vi <- as.numeric(unlist(cs$v))
   res <- rma(yi = yi, vi = vi, method = "DL")
   h   <- hc(res)
   out[[length(out) + 1]] <- list(
      label = cs$label,
      k     = length(yi),
      beta  = as.numeric(h$beta),       # FE point (H&C)
      ci_lb = as.numeric(h$ci.lb),
      ci_ub = as.numeric(h$ci.ub),
      se    = as.numeric(h$se),
      tau2  = as.numeric(h$tau2),
      metafor_version = as.character(packageVersion("metafor"))
   )
}
writeLines(toJSON(out, auto_unbox = TRUE, digits = 12),
           file.path(here, "hc_reference.json"))
cat("wrote", length(out), "reference rows -> hc_reference.json\n")
