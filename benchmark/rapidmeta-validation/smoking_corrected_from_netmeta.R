## Emit the CORRECT Hasselblad/Lu-Ades smoking dataset (netmeta::smokingcessation)
## as arm-level JSON, ready for canonical-datasets.js to adopt (coordinated merge).
suppressMessages({library(netmeta); library(jsonlite)})
data(smokingcessation)
key <- c(A="No contact", B="Self-help", C="Individual", D="Group")
studies <- list()
for(i in 1:nrow(smokingcessation)){
  r <- smokingcessation[i,]
  arms <- list(list(treatment=unname(key[as.character(r$treat1)]), events=r$event1, n=r$n1),
               list(treatment=unname(key[as.character(r$treat2)]), events=r$event2, n=r$n2))
  if(!is.na(r$treat3) && as.character(r$treat3)!="")
    arms[[3]] <- list(treatment=unname(key[as.character(r$treat3)]), events=r$event3, n=r$n3)
  studies[[i]] <- list(id=paste0("S",i), arms=arms)
}
out <- list(reference="No contact", measure="OR",
            source="netmeta::smokingcessation (Dias et al. NICE DSU TSD 2; Hasselblad 1998; Lu & Ades 2006)",
            studies=studies)
writeLines(toJSON(out, auto_unbox=TRUE, pretty=TRUE),
           "benchmark/rapidmeta-validation/smoking_corrected_arms.json")
cat("wrote smoking_corrected_arms.json with", length(studies), "studies; 3-arm studies:",
    sum(sapply(studies, function(s) length(s$arms)>=3)), "\n")
