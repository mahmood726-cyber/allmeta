source('allmeta/dta-sroc/validate/preflight-plus.R')
cat("CASE:dat.kearon1998/year/reml/all\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(-1.65664593013704,-1.65664593013704,-1.65664593013704,-1.2653122458527,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.08268985985333,1.08268985985333,1.47402354413767,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,-0.0913111929996847,-0.0913111929996847,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.47402354413767,1.865357228422,1.865357228422)),formula=cbind(tsens,tfpr)~x,method='reml',correction.control='all',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.65664593013704,0,0),c(0,0,1,-1.65664593013704)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/year/reml/single\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(-1.65664593013704,-1.65664593013704,-1.65664593013704,-1.2653122458527,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.08268985985333,1.08268985985333,1.47402354413767,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,-0.0913111929996847,-0.0913111929996847,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.47402354413767,1.865357228422,1.865357228422)),formula=cbind(tsens,tfpr)~x,method='reml',correction.control='single',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.65664593013704,0,0),c(0,0,1,-1.65664593013704)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/year/ml/all\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(-1.65664593013704,-1.65664593013704,-1.65664593013704,-1.2653122458527,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.08268985985333,1.08268985985333,1.47402354413767,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,-0.0913111929996847,-0.0913111929996847,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.47402354413767,1.865357228422,1.865357228422)),formula=cbind(tsens,tfpr)~x,method='ml',correction.control='all',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.65664593013704,0,0),c(0,0,1,-1.65664593013704)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/year/ml/single\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(-1.65664593013704,-1.65664593013704,-1.65664593013704,-1.2653122458527,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.08268985985333,1.08268985985333,1.47402354413767,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,-0.0913111929996847,-0.0913111929996847,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.47402354413767,1.865357228422,1.865357228422)),formula=cbind(tsens,tfpr)~x,method='ml',correction.control='single',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.65664593013704,0,0),c(0,0,1,-1.65664593013704)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/year/fixed/all\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(-1.65664593013704,-1.65664593013704,-1.65664593013704,-1.2653122458527,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.08268985985333,1.08268985985333,1.47402354413767,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,-0.0913111929996847,-0.0913111929996847,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.47402354413767,1.865357228422,1.865357228422)),formula=cbind(tsens,tfpr)~x,method='fixed',correction.control='all',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.65664593013704,0,0),c(0,0,1,-1.65664593013704)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/year/fixed/single\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(-1.65664593013704,-1.65664593013704,-1.65664593013704,-1.2653122458527,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.08268985985333,1.08268985985333,1.47402354413767,-0.87397856156836,-0.87397856156836,-0.482644877284022,-0.0913111929996847,-0.482644877284022,-0.0913111929996847,-0.0913111929996847,0.300022491284653,0.300022491284653,0.300022491284653,0.691356175568991,1.47402354413767,1.865357228422,1.865357228422)),formula=cbind(tsens,tfpr)~x,method='fixed',correction.control='single',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.65664593013704,0,0),c(0,0,1,-1.65664593013704)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/patients/reml/all\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449)),formula=cbind(tsens,tfpr)~x,method='reml',correction.control='all',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.05107654562449,0,0),c(0,0,1,-1.05107654562449)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/patients/reml/single\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449)),formula=cbind(tsens,tfpr)~x,method='reml',correction.control='single',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.05107654562449,0,0),c(0,0,1,-1.05107654562449)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/patients/ml/all\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449)),formula=cbind(tsens,tfpr)~x,method='ml',correction.control='all',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.05107654562449,0,0),c(0,0,1,-1.05107654562449)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/patients/ml/single\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449)),formula=cbind(tsens,tfpr)~x,method='ml',correction.control='single',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.05107654562449,0,0),c(0,0,1,-1.05107654562449)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/patients/fixed/all\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449)),formula=cbind(tsens,tfpr)~x,method='fixed',correction.control='all',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.05107654562449,0,0),c(0,0,1,-1.05107654562449)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.kearon1998/patients/fixed/single\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(325,20,25,22,70,40,27,25,40,39,75,49,33,20,94,22,10,15,10,13,10,16,12,13,24,17,5,18,24,26),FN=c(8,5,3,3,7,6,7,4,0,2,22,1,1,3,27,3,15,9,4,10,22,45,37,13,18,10,17,13,4,29),FP=c(22,0,0,1,1,1,5,7,10,7,1,0,0,0,7,2,6,3,3,0,1,2,1,8,2,6,1,5,0,8),TN=c(483,29,23,24,142,18,36,28,27,29,59,50,75,64,346,45,47,29,44,123,55,184,137,66,55,85,45,240,104,81),x=c(0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,0.919691977421426,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449,-1.05107654562449)),formula=cbind(tsens,tfpr)~x,method='fixed',correction.control='single',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-1.05107654562449,0,0),c(0,0,1,-1.05107654562449)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.rivera2025/year/reml/all\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(103,237,146,131,588,103,812,39,771,51),FN=c(24,10,4,11,25,17,43,11,41,8),FP=c(36,133,85,9,16,7,8,11,8,3),TN=c(137,69,30,54,41,76,60,41,103,61),x=c(-1.19271985191882,-0.340777100548219,0.511165650822378,0.511165650822378,0.0851942751370791,-2.04466260328941,0.937137026507676,0.937137026507676,0.937137026507676,-0.340777100548219)),formula=cbind(tsens,tfpr)~x,method='reml',correction.control='all',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-2.04466260328941,0,0),c(0,0,1,-2.04466260328941)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.rivera2025/year/reml/single\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(103,237,146,131,588,103,812,39,771,51),FN=c(24,10,4,11,25,17,43,11,41,8),FP=c(36,133,85,9,16,7,8,11,8,3),TN=c(137,69,30,54,41,76,60,41,103,61),x=c(-1.19271985191882,-0.340777100548219,0.511165650822378,0.511165650822378,0.0851942751370791,-2.04466260328941,0.937137026507676,0.937137026507676,0.937137026507676,-0.340777100548219)),formula=cbind(tsens,tfpr)~x,method='reml',correction.control='single',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-2.04466260328941,0,0),c(0,0,1,-2.04466260328941)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.rivera2025/year/reml/none\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(103,237,146,131,588,103,812,39,771,51),FN=c(24,10,4,11,25,17,43,11,41,8),FP=c(36,133,85,9,16,7,8,11,8,3),TN=c(137,69,30,54,41,76,60,41,103,61),x=c(-1.19271985191882,-0.340777100548219,0.511165650822378,0.511165650822378,0.0851942751370791,-2.04466260328941,0.937137026507676,0.937137026507676,0.937137026507676,-0.340777100548219)),formula=cbind(tsens,tfpr)~x,method='reml',correction.control='none',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-2.04466260328941,0,0),c(0,0,1,-2.04466260328941)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.rivera2025/year/ml/all\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(103,237,146,131,588,103,812,39,771,51),FN=c(24,10,4,11,25,17,43,11,41,8),FP=c(36,133,85,9,16,7,8,11,8,3),TN=c(137,69,30,54,41,76,60,41,103,61),x=c(-1.19271985191882,-0.340777100548219,0.511165650822378,0.511165650822378,0.0851942751370791,-2.04466260328941,0.937137026507676,0.937137026507676,0.937137026507676,-0.340777100548219)),formula=cbind(tsens,tfpr)~x,method='ml',correction.control='all',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-2.04466260328941,0,0),c(0,0,1,-2.04466260328941)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.rivera2025/year/ml/single\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(103,237,146,131,588,103,812,39,771,51),FN=c(24,10,4,11,25,17,43,11,41,8),FP=c(36,133,85,9,16,7,8,11,8,3),TN=c(137,69,30,54,41,76,60,41,103,61),x=c(-1.19271985191882,-0.340777100548219,0.511165650822378,0.511165650822378,0.0851942751370791,-2.04466260328941,0.937137026507676,0.937137026507676,0.937137026507676,-0.340777100548219)),formula=cbind(tsens,tfpr)~x,method='ml',correction.control='single',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-2.04466260328941,0,0),c(0,0,1,-2.04466260328941)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.rivera2025/year/ml/none\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(103,237,146,131,588,103,812,39,771,51),FN=c(24,10,4,11,25,17,43,11,41,8),FP=c(36,133,85,9,16,7,8,11,8,3),TN=c(137,69,30,54,41,76,60,41,103,61),x=c(-1.19271985191882,-0.340777100548219,0.511165650822378,0.511165650822378,0.0851942751370791,-2.04466260328941,0.937137026507676,0.937137026507676,0.937137026507676,-0.340777100548219)),formula=cbind(tsens,tfpr)~x,method='ml',correction.control='none',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-2.04466260328941,0,0),c(0,0,1,-2.04466260328941)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.rivera2025/year/fixed/all\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(103,237,146,131,588,103,812,39,771,51),FN=c(24,10,4,11,25,17,43,11,41,8),FP=c(36,133,85,9,16,7,8,11,8,3),TN=c(137,69,30,54,41,76,60,41,103,61),x=c(-1.19271985191882,-0.340777100548219,0.511165650822378,0.511165650822378,0.0851942751370791,-2.04466260328941,0.937137026507676,0.937137026507676,0.937137026507676,-0.340777100548219)),formula=cbind(tsens,tfpr)~x,method='fixed',correction.control='all',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-2.04466260328941,0,0),c(0,0,1,-2.04466260328941)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.rivera2025/year/fixed/single\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(103,237,146,131,588,103,812,39,771,51),FN=c(24,10,4,11,25,17,43,11,41,8),FP=c(36,133,85,9,16,7,8,11,8,3),TN=c(137,69,30,54,41,76,60,41,103,61),x=c(-1.19271985191882,-0.340777100548219,0.511165650822378,0.511165650822378,0.0851942751370791,-2.04466260328941,0.937137026507676,0.937137026507676,0.937137026507676,-0.340777100548219)),formula=cbind(tsens,tfpr)~x,method='fixed',correction.control='single',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-2.04466260328941,0,0),c(0,0,1,-2.04466260328941)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
cat("CASE:dat.rivera2025/year/fixed/none\n")
print(.libPaths()); print(packageVersion('mada')); print(packageVersion('mvmeta'))
f<-mada::reitsma(data.frame(TP=c(103,237,146,131,588,103,812,39,771,51),FN=c(24,10,4,11,25,17,43,11,41,8),FP=c(36,133,85,9,16,7,8,11,8,3),TN=c(137,69,30,54,41,76,60,41,103,61),x=c(-1.19271985191882,-0.340777100548219,0.511165650822378,0.511165650822378,0.0851942751370791,-2.04466260328941,0.937137026507676,0.937137026507676,0.937137026507676,-0.340777100548219)),formula=cbind(tsens,tfpr)~x,method='fixed',correction.control='none',control=list(maxiter=1000,reltol=1e-12))
b<-as.numeric(coef(f)); V<-vcov(f); se<-sqrt(diag(V)); z<-b/se
L<-rbind(c(1,-2.04466260328941,0,0),c(0,0,1,-2.04466260328941)); mu<-as.vector(L%*%b); C<-L%*%V%*%t(L); Psi<-f$Psi;if(is.null(Psi))Psi<-matrix(0,2,2)
sens<-plogis(mu[1]);fp<-plogis(mu[2]);prev<-0.1
a<-list(coef=b,se=se,z=z,p=2*pnorm(-abs(z)),lo=b-qnorm(.975)*se,hi=b+qnorm(.975)*se,sens=sens,spec=1-fp,positive=prev*sens/(prev*sens+(1-prev)*fp),negative=prev*(1-sens)/(prev*(1-sens)+(1-prev)*(1-fp)))
emit<-function(v){stopifnot(all(is.finite(v)));z<-paste(sprintf('%.17g',v),collapse=',');if(length(v)==1)z else paste0('[',z,']')}
cat('ALMJSON:{',paste(paste0('"',names(a),'":',vapply(a,emit,'')),collapse=','),'}\n',sep='')
