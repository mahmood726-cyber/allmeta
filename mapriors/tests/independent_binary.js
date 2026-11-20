// Independent direct trapezoid convolution, accelerated by FFT. No engine numerics.
'use strict';
function fft(re,im,inverse=false){let n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}for(let len=2;len<=n;len*=2){let ang=(inverse?2:-2)*Math.PI/len,cr=Math.cos(ang),ci=Math.sin(ang);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){let a=i+j,b=a+len/2,tr=wr*re[b]-wi*im[b],ti=wr*im[b]+wi*re[b];re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;let tmp=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=tmp;}}}if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}}
module.exports=function(data){const N=8192,h=.01;let spectra=[...data.map(d=>x=>Math.exp(d.r*x-d.n*(Math.max(x,0)+Math.log1p(Math.exp(-Math.abs(x)))))),x=>1/(1+Math.exp(-x))].map(f=>{let re=new Float64Array(N),im=new Float64Array(N);for(let j=0;j<=4000;j++)re[j]=f(-20+h*j)*(j===0||j===4000?.5:1);fft(re,im);return{re,im};});
 let den=0,num=0;
 for(let it=0;it<=200;it++){let tau=it*.03,kr=new Float64Array(N),ki=new Float64Array(N);if(it===0)kr[0]=1;else for(let j=0;j<N;j++){let x=(j<=N/2?j:j-N)*h;kr[j]=h*Math.exp(-.5*(x/tau)**2)/(Math.sqrt(2*Math.PI)*tau);}fft(kr,ki);
 let conv=spectra.map(s=>{let re=new Float64Array(N),im=new Float64Array(N);for(let j=0;j<N;j++){re[j]=s.re[j]*kr[j]-s.im[j]*ki[j];im[j]=s.re[j]*ki[j]+s.im[j]*kr[j];}fft(re,im,true);return re;});
 for(let ib=0;ib<=400;ib++){let beta=-12+ib*.05,j=800+ib*5,w=Math.exp(-beta*beta/8-tau*tau/2)*(it===0||it===200?.5:1)*(ib===0||ib===400?.5:1);for(let k=0;k<data.length;k++)w*=Math.max(0,conv[k][j]);den+=w;num+=w*conv[data.length][j];}}
 return num/den;
};
