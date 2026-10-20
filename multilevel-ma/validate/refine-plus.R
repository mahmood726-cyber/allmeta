# Independent R score refinement for the two variance components. The CR2
# reference is still calculated by clubSandwich on an rma.mv object.
# Loaded by generate-plus.R; that caller prints libraries and versions.
refine_variances <- function(d,start) {
  g <- split(d,d$cluster)
  score <- function(theta) {
    b <- theta[1]; w <- theta[2]
    parts <- lapply(g,function(z){di<-1/(z$v+w);s<-sum(di);den<-1+b*s;list(d=di,s=s,den=den,y=z$y)})
    info <- sum(vapply(parts,function(z)z$s/z$den,0))
    mu <- sum(vapply(parts,function(z)sum(z$d*z$y)/z$den,0))/info
    Reduce('+',lapply(parts,function(z){
      r <- z$y-mu; u<-sum(z$d*r);d2<-sum(z$d^2);wr<-z$d*(r-b*u/z$den)
      c(z$s/z$den-(z$s/z$den)^2/info-(u/z$den)^2,
        z$s-b*d2/z$den-d2/(z$den^2*info)-sum(wr^2))/2
    }))
  }
  scale <- max(mean(d$v),var(d$y),1e-12)
  x <- start; x[x<scale*1e-8] <- 0
  for(iter in 1:40) {
    s <- score(x)
    free <- which(x>scale*1e-10 | s<0)
    if(!length(free)||max(abs(s[free]))*scale<1e-11)break
    h <- scale*1e-5
    H <- sapply(free,function(j){xp<-xm<-x;xp[j]<-x[j]+h;xm[j]<-max(0,x[j]-h);(score(xp)[free]-score(xm)[free])/(xp[j]-xm[j])})
    step <- tryCatch(solve(matrix(H,length(free)),s[free]),error=function(e)rep(0,length(free)))
    if(any(!is.finite(step)))break
    nextx <- x;nextx[free]<-pmax(0,x[free]-step)
    if(max(abs(nextx-x))<scale*1e-13){x<-nextx;break}
    x<-nextx
  }
  residual <- score(x)
  stopifnot(all(is.finite(x)),all(x>=0),all(abs(residual[x>scale*1e-10])*scale<1e-7),all(residual[x<=scale*1e-10]*scale > -1e-7))
  x
}
