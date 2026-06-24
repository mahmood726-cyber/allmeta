## Decisive: does the EMBEDDED smoking arm data reproduce the PUBLISHED network?
suppressMessages({library(netmeta); library(jsonlite)})
options(width=200)

## ---- (1) PUBLISHED: netmeta::smokingcessation ----
data(smokingcessation)
pp <- pairwise(list(treat1,treat2,treat3),
               event=list(event1,event2,event3),
               n=list(n1,n2,n3),
               studlab=1:nrow(smokingcessation), data=smokingcessation, sm="OR")
np <- netmeta(pp, reference.group="A", common=FALSE, random=TRUE)
cat("===== PUBLISHED netmeta::smokingcessation (A=No contact) =====\n")
cat(sprintf("k studies=%d, n pairwise=%d, tau2=%.5f Q=%.3f df=%d\n",
            np$k, nrow(pp), np$tau2, np$Q, np$df.Q))
for (t in c("B","C","D")) cat(sprintf("  d_%s vs A: logOR=%.5f se=%.5f  OR=%.3f\n",
            t, np$TE.random[t,"A"], np$seTE.random[t,"A"], exp(np$TE.random[t,"A"])))

## ---- (2) EMBEDDED: hasselblad_arms.json ----
d <- fromJSON("benchmark/rapidmeta-validation/hasselblad_arms.json", simplifyVector=FALSE)
rows <- do.call(rbind, lapply(d$studies, function(s)
  do.call(rbind, lapply(s$arms, function(a)
    data.frame(study=s$id, treatment=a$treatment, event=a$events, n=a$n, stringsAsFactors=FALSE)))))
pe <- pairwise(treat=treatment, event=event, n=n, studlab=study, data=rows, sm="OR")
ne <- netmeta(pe, reference.group="No contact", common=FALSE, random=TRUE)
cat("\n===== EMBEDDED hasselblad_arms.json (ref=No contact) =====\n")
cat(sprintf("k studies=%d, n pairwise=%d, tau2=%.5f Q=%.3f df=%d\n",
            ne$k, nrow(pe), ne$tau2, ne$Q, ne$df.Q))
for (t in ne$trts) if (t!="No contact")
  cat(sprintf("  d_%s vs No contact: logOR=%.5f se=%.5f  OR=%.3f\n",
              t, ne$TE.random[t,"No contact"], ne$seTE.random[t,"No contact"], exp(ne$TE.random[t,"No contact"])))

## ---- (3) arm-count + treatment structure ----
cat("\n===== STRUCTURE =====\n")
cat("Published: studies with 3 arms:", sum(!is.na(smokingcessation$treat3)), "\n")
emb_arm_counts <- sapply(d$studies, function(s) length(s$arms))
cat("Embedded: studies with 3 arms:", sum(emb_arm_counts>=3), " (all 2-arm =>", all(emb_arm_counts==2), ")\n")
cat("Embedded treatment-pair tally:\n")
pairs <- sapply(d$studies, function(s) paste(sort(sapply(s$arms,function(a)a$treatment)),collapse=" vs "))
print(table(pairs))
