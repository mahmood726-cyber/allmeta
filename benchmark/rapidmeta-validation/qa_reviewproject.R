suppressMessages({library(metadat); library(meta); library(metafor)})
options(width=200)

## ---------- MAGNESIUM vs metadat::dat.egger2001 ----------
cat("===== dat.egger2001 (IV magnesium, published) =====\n")
d <- dat.egger2001
print(d[, c("study","year","ai","n1i","ci","n2i")], row.names=FALSE)

emb <- data.frame(
 label=c("Morton","Rasmussen","Smith","Abraham","Feldstedt","Shechter","Ceremuzynski","LIMIT-2","ISIS-4"),
 eT=c(1,9,2,1,10,1,1,90,2216), nT=c(40,135,200,48,150,59,25,1159,29011),
 eC=c(2,23,7,1,8,9,3,118,2103),  nC=c(36,135,200,46,148,56,23,1157,29039))
cat("\n--- match embedded magnesium trials to dat.egger2001 by name ---\n")
for(i in 1:nrow(emb)){
  r <- d[grepl(substr(emb$label[i],1,5), d$study, ignore.case=TRUE),]
  if(nrow(r)>=1){ r<-r[1,]
    flag <- if(emb$eT[i]!=r$ai||emb$nT[i]!=r$n1i||emb$eC[i]!=r$ci||emb$nC[i]!=r$n2i) "  <<MISMATCH" else "  ok"
    cat(sprintf("%-13s emb %d/%d vs %d/%d | pub %s/%s vs %s/%s%s\n",
        emb$label[i], emb$eT[i],emb$nT[i],emb$eC[i],emb$nC[i], r$ai,r$n1i,r$ci,r$n2i, flag))
  } else cat(sprintf("%-13s NO NAME MATCH in dat.egger2001\n", emb$label[i]))
}

## ---------- pooled re-derivation (internal consistency vs app claims) ----------
pool <- function(eT,nT,eC,nC,lab,method="MH"){
  m <- metabin(eT,nT,eC,nC, sm="OR", method=method, common=TRUE, random=TRUE)
  cat(sprintf("%-22s FE-OR=%.3f [%.3f,%.3f]  RE-OR=%.3f [%.3f,%.3f]  I2=%.0f%%\n",
    lab, exp(m$TE.common),exp(m$lower.common),exp(m$upper.common),
    exp(m$TE.random),exp(m$lower.random),exp(m$upper.random), m$I2*100))
}
cat("\n===== pooled re-derivation =====\n")
pool(emb$eT,emb$nT,emb$eC,emb$nC,"Magnesium (all 9, incl ISIS4)")
pool(emb$eT[1:8],emb$nT[1:8],emb$eC[1:8],emb$nC[1:8],"Magnesium (8, no ISIS4)")
# corticosteroids CD004661
pool(c(2,87,34,103,22,12),c(30,629,352,1188,343,837),c(1,107,38,96,24,7),c(29,626,336,1256,337,796),"Cortico CD004661 (claim 0.96)")
# htn CD000028
pool(c(7,48,7,74,60,32,135,213,36,301,123,58,196),c(22,61,44,1415,419,443,416,2365,812,2183,2398,857,1933),
     c(9,44,7,75,69,7,149,242,63,315,137,24,235),c(26,62,47,1398,465,108,424,2371,815,2213,2297,426,1912),"HTN CD000028")
