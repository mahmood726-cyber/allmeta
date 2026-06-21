suppressMessages(library(netmeta)); suppressMessages(library(jsonlite))
d <- fromJSON("benchmark/rapidmeta-validation/hasselblad_arms.json", simplifyVector=FALSE)
rows <- do.call(rbind, lapply(d$studies, function(s){
  do.call(rbind, lapply(s$arms, function(a) data.frame(study=s$id, treatment=a$treatment, event=a$events, n=a$n, stringsAsFactors=FALSE)))
}))
p <- pairwise(treat=treatment, event=event, n=n, studlab=study, data=rows, sm="OR")
ref <- d$reference
for (model in c("common","random")) {
  nm <- netmeta(p, common=TRUE, random=TRUE, reference.group=ref)
  TE <- if(model=="common") nm$TE.common else nm$TE.random
  se <- if(model=="common") nm$seTE.common else nm$seTE.random
  cat("===", model, "=== ref:", ref, " tau2=", round(nm$tau2,6), " Q=", round(nm$Q,4), " df=", nm$df.Q, "\n")
  for (t in nm$trts) if (t!=ref) cat(sprintf("  %s: logOR=%.6f se=%.6f\n", t, TE[t,ref], se[t,ref]))
}
