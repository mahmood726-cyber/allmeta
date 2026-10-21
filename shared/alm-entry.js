/* Smart entry: local rules and explicit, provenance-bearing conversions.
 * Five-number formulas ported from metafor 5.2.1 conv.fivenum.
 * No statistical engine or app wiring lives in this module. */
(function (global) {
  "use strict";
  const RULES_VERSION="entry6.1";
  const RULES=[];
  function defineRule(id,kind,pattern,description) {
    const rule=Object.freeze({id,version:1,kind,pattern,description});
    RULES.push(rule);return pattern;
  }
  function ruleRegex(id) {
    const rule=RULES.find(r=>r.id===id);
    if(!rule)throw new Error("Unknown extraction rule: "+id);
    return new RegExp(rule.pattern.source,rule.pattern.flags);
  }
  const ruleRef=id=>id+"@"+RULES.find(r=>r.id===id).version;
  const finite = x => typeof x === "number" && Number.isFinite(x);
  const present = x => x !== undefined && x !== null && !Number.isNaN(x);
  const flag = (code, text, blocking = false, extra = {}) => ({code, text, blocking, ...extra});
  // Per-function sources: SE/estimate from a ratio or difference CI is §6.3.1, SE from p §6.3.2,
  // SD from the SE or CI of a mean §6.5.2.2.
  const handbook = "Cochrane Handbook v6.5 §6.5.2.2", ciSource = "Cochrane Handbook v6.5 §6.3.1", pSource = "Cochrane Handbook v6.5 §6.3.2";
  function result(value, method, citation, inputs, flags = []) {
    const fn=({"SE from CI":"seFromCI","SE from p":"seFromP","CI midpoint":"estFromCI","SD from SE":"sdFromSE","SD from CI (t, n-1 df)":"sdFromCI","SD from CI (normal)":"sdFromCI","events from percent":"eventsFromPercent","design effect":"designEffect","design effect (reported)":"designEffect","SE × √(design effect)":"clusterSE"})[method];
    return {value: finite(value) ? value : null, method, citation, inputs: {...inputs}, flags,...(fn?{fn,args:{...inputs},result:finite(value)?value:null,rulesVersion:RULES_VERSION}:{})};
  }
  function invalid(inputs, text, citation) {
    return result(null, "not converted", citation, inputs, [flag("invalid-input", text, true)]);
  }
  function levelOf(a) { return a.level === undefined ? 0.95 : a.level; }
  function validCI(a) {
    return finite(a.lo) && finite(a.hi) && a.lo <= a.hi &&
      levelOf(a) > 0 && levelOf(a) < 1 && (!a.ratio || a.lo > 0);
  }
  // Wichura AS241, all three degree-seven rational approximations.
  function poly(x, a) { return a.reduceRight((y, c) => y * x + c, 0); }
  function qnorm(p) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    if (!(p > 0 && p < 1)) return NaN;
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      return q * poly(r, [3.387132872796366608,133.14166789178437745,1971.5909503065514427,13731.693765509461125,45921.953931549871457,67265.770927008700853,33430.575583588128105,2509.0809287301226727]) /
        poly(r, [1,42.313330701600911252,687.1870074920579083,5394.1960214247511077,21213.794301586595867,39307.89580009271061,28729.085735721942674,5226.495278852854561]);
    }
    let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p)), z;
    if (r <= 5) {
      r -= 1.6;
      z = poly(r, [1.42343711074968357734,4.6303378461565452959,5.7694972214606914055,3.64784832476320460504,1.27045825245236838258,.24178072517745061177,.0227238449892691845833,.00077454501427834140764]) /
        poly(r, [1,2.05319162663775882187,1.6763848301838038494,.68976733498510000455,.14810397642748007459,.0151986665636164571966,.0005475938084995344946,1.05075007164441684324e-9]);
    } else {
      r -= 5;
      z = poly(r, [6.6579046435011037772,5.4637849111641143699,1.7848265399172913358,.29656057182850489123,.026532189526576123093,.0012426609473880784386,.0000271155556874348757815,2.01033439929228813265e-7]) /
        poly(r, [1,.59983220655588793769,.13692988092273580531,.0148753612908506148525,.0007868691311456132591,1.8463183175100546818e-5,1.4215117583164458887e-7,2.04426310338993978564e-15]);
    }
    return q < 0 ? -z : z;
  }
  function logGamma(z) {
    const c = [676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI*z)) - logGamma(1-z);
    z--;
    let x = .99999999999980993;
    c.forEach((v,i) => { x += v/(z+i+1); });
    const t = z+7.5;
    return .91893853320467274178+(z+.5)*Math.log(t)-t+Math.log(x);
  }
  function betaCF(a,b,x) {
    const tiny = 1e-300;
    let c=1,d=1-(a+b)*x/(a+1);
    if (Math.abs(d)<tiny) d=tiny;
    d=1/d;
    let h=d;
    for (let m=1;m<10000;m++) {
      let aa=m*(b-m)*x/((a+2*m-1)*(a+2*m));
      d=1+aa*d; if(Math.abs(d)<tiny)d=tiny;
      c=1+aa/c; if(Math.abs(c)<tiny)c=tiny;
      d=1/d; h*=d*c;
      aa=-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));
      d=1+aa*d; if(Math.abs(d)<tiny)d=tiny;
      c=1+aa/c; if(Math.abs(c)<tiny)c=tiny;
      d=1/d; const delta=d*c; h*=delta;
      if(Math.abs(delta-1)<4e-16) return h;
    }
    throw new Error("Incomplete beta did not converge");
  }
  function ibeta(x,a,b) {
    if(x<=0)return 0;
    if(x>=1)return 1;
    const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));
    return x<(a+1)/(a+b+2) ? bt*betaCF(a,b,x)/a : 1-bt*betaCF(b,a,1-x)/b;
  }
  let sharedStats = global.AlmStats;
  if (typeof module !== "undefined" && module.exports) sharedStats = require("./stats-qt.js");
  // Reuse shared qt as a starting point, then refine against a full-precision
  // incomplete beta. The shared implementation's CF stops at 3e-7.
  function qt(p,df) {
    if (!(df>0) || !(p>0 && p<1)) return NaN;
    if(p===.5)return 0;
    const tail=Math.min(p,1-p), sign=p>.5?1:-1;
    if(df===1)return sign/Math.tan(Math.PI*tail);
    if(df===2)return sign*(1-2*tail)/Math.sqrt(2*tail*(1-tail));
    const survival=t=>.5*ibeta(df/(df+t*t),df/2,.5);
    let lo=0,hi=Math.max(1, sharedStats ? Math.abs(sharedStats.qt(p,df)) : Math.abs(qnorm(p)));
    while(survival(hi)>tail)hi*=2;
    for(let i=0;i<100;i++){
      const t=(lo+hi)/2;
      if(survival(t)>tail)lo=t;else hi=t;
      if(hi-lo<3e-15*Math.max(1,t))break;
    }
    return sign*(lo+hi)/2;
  }
  // Normal survival via regularized gamma Q(1/2,x²/2).
  function normalTail(z) {
    if(z<0)return 1-normalTail(-z);
    if(z===0)return .5;
    const x=z*z/2, a=.5, pref=Math.exp(-x+a*Math.log(x)-.57236494292470008707);
    if(x<1.5) {
      let term=1/a,sum=term,ap=a;
      for(let i=0;i<1000;i++){term*=x/(++ap);sum+=term;if(Math.abs(term)<Math.abs(sum)*2e-16)break;}
      return .5*(1-sum*pref);
    }
    let b=x+1-a,c=1e300,d=1/b,h=d;
    for(let i=1;i<1000;i++){
      const an=-i*(i-a); b+=2; d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;
      c=b+an/c;if(Math.abs(c)<1e-300)c=1e-300;
      d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<3e-16)break;
    }
    return .5*pref*h;
  }
  const walterCache = new Map();
  function expectedRange(n) {
    if(walterCache.has(n))return walterCache.get(n);
    // R integrate() uses QUADPACK's 15-point infinite-interval rule and a
    // default relative/absolute tolerance of eps^0.25. Reproducing that
    // stopping criterion matters: a tighter integral differs from conv.fivenum
    // by more than its requested cross-check tolerance for n=25 and n=5000.
    const xgk=[.991455371120812639206854697526329,.949107912342758524526189684047851,.864864423359769072789712788640926,.741531185599394439863864773280788,.586087235467691130294144838258730,.405845151377397166906606412076961,.207784955007898467600689403773245,0];
    const wgk=[.022935322010529224963732008058970,.063092092629978553290700663189204,.104790010322250183839876322541518,.140653259715525918745189590510238,.169004726639267902826583426598550,.190350578064785409913256402421014,.204432940075298892414161999234649,.209482141084727828012999174891714];
    const wg=[0,.129484966168869693270611432679082,0,.279705391489276667901467771423780,0,.381830050505118944950369775488975,0,.417959183673469387755102040816327];
    const f=t=>{
      const x=(1-t)/t,p=1-normalTail(x),pm=normalTail(x);
      return ((1-(1-p)**n-p**n)+(1-(1-pm)**n-pm**n))/(t*t);
    };
    function rule(a,b) {
      const center=(a+b)/2,half=(b-a)/2,fc=f(center),left=[],right=[];
      let gauss=wg[7]*fc,kronrod=wgk[7]*fc,abs=wgk[7]*Math.abs(fc);
      for(let j=0;j<7;j++){
        left[j]=f(center-half*xgk[j]);right[j]=f(center+half*xgk[j]);
        const sum=left[j]+right[j];gauss+=wg[j]*sum;kronrod+=wgk[j]*sum;
        abs+=wgk[j]*(Math.abs(left[j])+Math.abs(right[j]));
      }
      const mean=kronrod/2;let asc=wgk[7]*Math.abs(fc-mean);
      for(let j=0;j<7;j++)asc+=wgk[j]*(Math.abs(left[j]-mean)+Math.abs(right[j]-mean));
      const value=kronrod*half;asc*=half;abs*=half;
      let error=Math.abs((kronrod-gauss)*half);
      if(asc&&error)error=asc*Math.min(1,(200*error/asc)**1.5);
      error=Math.max(error,50*Number.EPSILON*abs);
      return {a,b,value,error};
    }
    const intervals=[rule(0,1)],eps=Number.EPSILON**.25;
    let value=intervals[0].value,error=intervals[0].error;
    while(error>Math.max(eps,eps*Math.abs(value))&&intervals.length<100){
      intervals.sort((a,b)=>b.error-a.error);
      const old=intervals.shift(),mid=(old.a+old.b)/2,l=rule(old.a,mid),r=rule(mid,old.b);
      value+=l.value+r.value-old.value;error+=l.error+r.error-old.error;
      intervals.push(l,r);
    }
    value=intervals.reduce((sum,r)=>sum+r.value,0);
    walterCache.set(n,value);return value;
  }
  function seFromCI(a) {
    if(!validCI(a))return invalid(a,"CI bounds, level or ratio scale are invalid",ciSource);
    const lo=a.ratio?Math.log(a.lo):a.lo,hi=a.ratio?Math.log(a.hi):a.hi;
    return result((hi-lo)/(2*qnorm(1-(1-levelOf(a))/2)),"SE from CI",ciSource,a);
  }
  function seFromP(a) {
    const token=typeof a.p==="string"?parseCell(a.p,{header:"p"}):a.p;
    const p=typeof token==="object" && token ? token.value : token;
    if(token && typeof token==="object" && token.op && token.op!=="=")
      return result(null,"not converted",pSource,a,[flag("p-inequality","A p-value inequality cannot be converted to an SE",true)]);
    if(!finite(a.est)||!finite(p)||p<=0||p>=1||(a.ratio&&a.est<=0))return invalid(a,"An exact p in (0,1) and a valid estimate are required",pSource);
    return result(Math.abs(a.ratio?Math.log(a.est):a.est)/(-qnorm(p/2)),"SE from p",pSource,a);
  }
  function estFromCI(a) {
    if(!validCI(a))return invalid(a,"CI bounds or ratio scale are invalid",ciSource);
    // (L+U)/2 is the oracle's exact operation order; halve first only if the sum overflows.
    const v=a.ratio?Math.exp((Math.log(a.lo)+Math.log(a.hi))/2):finite(a.lo+a.hi)?(a.lo+a.hi)/2:a.lo/2+a.hi/2;
    return result(v,"CI midpoint",ciSource,a,[flag("ci-midpoint","estimate taken as CI midpoint")]);
  }
  function sdFromSE(a) {
    if(!finite(a.se)||a.se<0||!finite(a.n)||a.n<=0)return invalid(a,"SE must be nonnegative and n positive",handbook);
    return result(a.se*Math.sqrt(a.n),"SD from SE",handbook,a);
  }
  function sdFromCI(a) {
    if(!validCI(a)||!finite(a.n)||a.n<=1)return invalid(a,"Valid CI and n > 1 are required",handbook);
    const small=a.n<60,p=1-(1-levelOf(a))/2;
    return result(Math.sqrt(a.n)*(a.hi-a.lo)/(2*(small?qt(p,a.n-1):qnorm(p))),small?"SD from CI (t, n-1 df)":"SD from CI (normal)",handbook,a);
  }
  function eventsFromPercent(a) {
    if(!finite(a.pct)||a.pct<0||a.pct>100||!finite(a.n)||a.n<=0)return invalid(a,"Percent must be in [0,100] and n positive","Arithmetic: percent × n / 100");
    const raw=a.pct/100*a.n,v=Math.round(raw);
    return result(v,"events from percent","Arithmetic: percent × n / 100",a,Math.abs(raw-v)>.05?[flag("rounded-events","non-integer events (rounded %)")]:[]);
  }
  // Cluster-randomised trials (Cochrane Handbook v6.5 §23.1.4): DE = 1 + (M - 1) × ICC, M = mean cluster size
  // (given, or total / number of clusters), or a design effect taken from the report. Events and totals are
  // divided by the same DE (effective sample size); an SE is multiplied by sqrt(DE).
  const clusterSource="Cochrane Handbook v6.5 §23.1.4";
  function designEffect(a) {
    if(present(a.designEffect)){
      if(!finite(a.designEffect)||a.designEffect<1)return invalid(a,"A design effect must be a number of at least 1",clusterSource);
      return result(a.designEffect,"design effect (reported)",clusterSource,a);
    }
    const m=present(a.m)?a.m:finite(a.total)&&finite(a.k)&&a.k>0?a.total/a.k:NaN;
    if(!finite(m)||m<1||!finite(a.icc)||a.icc<0||a.icc>1)return invalid(a,"Give the mean cluster size (at least 1), or the number of clusters and the total, and an ICC between 0 and 1; or a design effect",clusterSource);
    return result(1+(m-1)*a.icc,"design effect",clusterSource,a);
  }
  function clusterCounts(a) {
    const de=designEffect(a),bad=!finite(a.events)||!finite(a.n)||a.n<=0||a.events<0||a.events>a.n;
    const flags=de.value===null?de.flags:bad?[flag("invalid-input","Events must be between 0 and a positive total",true)]:[];
    const values=flags.length?null:{events:a.events/de.value,n:a.n/de.value,designEffect:de.value};
    return {values,...(values||{events:null,n:null,designEffect:null}),value:values&&values.designEffect,method:"effective sample size",citation:clusterSource,inputs:{...a},flags,fn:"clusterCounts",args:{...a},result:values,rulesVersion:RULES_VERSION};
  }
  function clusterSE(a) {
    const de=designEffect(a);
    if(de.value===null)return {...de,fn:"clusterSE",args:{...a},result:null,rulesVersion:RULES_VERSION};
    if(!finite(a.se)||a.se<0)return invalid(a,"SE must be nonnegative",clusterSource);
    return result(a.se*Math.sqrt(de.value),"SE × √(design effect)",clusterSource,a);
  }
  // SHA-256 of the UTF-8 bytes (FIPS 180-4); constants from the fractional parts of prime roots.
  const SHA_K=[],SHA_H=[];
  for(let c=2;SHA_K.length<64;c++){
    let prime=true;for(let d=2;d*d<=c;d++)if(c%d===0){prime=false;break;}
    if(!prime)continue;
    if(SHA_H.length<8)SHA_H.push(Math.pow(c,1/2)*4294967296|0);
    SHA_K.push(Math.pow(c,1/3)*4294967296|0);
  }
  function sha256(text) {
    const bytes=new TextEncoder().encode(String(text)),len=bytes.length,words=new Array(((len+72)>>6)<<4).fill(0),w=new Array(64);
    for(let i=0;i<len;i++)words[i>>2]|=bytes[i]<<(24-8*(i&3));
    words[len>>2]|=0x80<<(24-8*(len&3));
    words[words.length-2]=Math.floor(len/536870912);words[words.length-1]=(len*8)>>>0;
    let h=SHA_H.slice();
    const rot=(x,n)=>x>>>n|x<<(32-n);
    for(let j=0;j<words.length;j+=16){
      for(let i=0;i<64;i++)w[i]=i<16?words[j+i]|0:(rot(w[i-15],7)^rot(w[i-15],18)^w[i-15]>>>3)+w[i-7]+(rot(w[i-2],17)^rot(w[i-2],19)^w[i-2]>>>10)+w[i-16]|0;
      let [a,b,c,d,e,f,g,k]=h;
      for(let i=0;i<64;i++){
        const t1=k+(rot(e,6)^rot(e,11)^rot(e,25))+(e&f^~e&g)+SHA_K[i]+w[i]|0,t2=(rot(a,2)^rot(a,13)^rot(a,22))+(a&b^a&c^b&c)|0;
        k=g;g=f;f=e;e=d+t1|0;d=c;c=b;b=a;a=t1+t2|0;
      }
      h=[a,b,c,d,e,f,g,k].map((x,i)=>x+h[i]|0);
    }
    return h.map(x=>(x>>>0).toString(16).padStart(8,"0")).join("");
  }
  const meanMethods=["luo/wan/shi","hozo2005","wan2014","bland2015","luo2016","walter2007"];
  const sdMethods=["luo/wan/shi","hozo2005","wan2014","bland2015","shi2020","walter2007"];
  const FIVENUM_METHODS=meanMethods.filter(m=>sdMethods.includes(m));
  function convertFivenum(a) {
    let methods=Array.isArray(a.method)?a.method.slice():[a.method||"default",a.method||"default"];
    if(methods.length!==2)throw new Error("method must contain a mean and an SD method");
    methods=methods.map((m,i)=>{
      m=String(m).toLowerCase();
      if(["qe","bc","mln","blue"].some(v=>v.startsWith(m)))throw new Error("method not available in allmeta");
      const match=["default",...(i?sdMethods:meanMethods)].find(v=>v.startsWith(m));
      if(!match)throw new Error("Unknown method");
      return match==="default"?"luo/wan/shi":match;
    });
    const dist=a.dist||"norm";
    if(!["norm","lnorm"].includes(dist))throw new Error("Unknown dist; use norm or lnorm");
    const flags=[];
    if(dist==="lnorm"&&methods.some(m=>m!=="luo/wan/shi")){
      methods=["luo/wan/shi","luo/wan/shi"];
      flags.push(flag("lnorm-method","Using luo/wan/shi for log-normal data, as in metafor"));
    }
    let mean=NaN,sd=NaN;
    const finish=()=>{
      const values={mean:finite(mean)?mean:null,sd:finite(sd)?sd:null};
      if(values.mean===null||values.sd===null)flags.push(flag("fivenum-unavailable","Mean or SD is unavailable for this method, scenario, sample size or skewness test",true));
      return {values,...values,fn:"convertFivenum",args:{...a},result:values,rulesVersion:RULES_VERSION,method:methods,citation:methods.map((m,i)=>m==="luo/wan/shi"?(i?(scenario===3?"Shi 2020":"Wan 2014"):"Luo 2018"):({hozo2005:"Hozo 2005",wan2014:"Wan 2014",bland2015:"Bland 2015",luo2016:"Luo 2018",shi2020:"Shi 2020",walter2007:"Walter 2007"})[m]).join("; "),inputs:{...a},flags,scenario};
    };
    let scenario=0;
    const n=present(a.n)?a.n:NaN;
    if(n<5||a.include===false)return finish();
    let [min,q1,med,q3,max]=["min","q1","median","q3","max"].map(k=>present(a[k])?a[k]:NaN);
    const observed=[min,q1,med,q3,max].filter(finite);
    if(observed.some((v,i)=>i&&v<observed[i-1]))throw new Error("min <= q1 <= median <= q3 <= max must hold");
    if(finite(min)&&!finite(q1)&&!finite(q3)&&finite(max))scenario=1;
    if(!finite(min)&&finite(q1)&&finite(q3)&&!finite(max))scenario=2;
    if(finite(min)&&finite(q1)&&finite(q3)&&finite(max))scenario=3;
    if(dist==="lnorm"){
      if(observed.some(v=>v<=0))throw new Error("Log-normal data must be positive");
      [min,q1,med,q3,max]=[min,q1,med,q3,max].map(Math.log);
    }
    const range=max-min,iqr=q3-q1;
    let tval,crit;
    if(scenario===1){tval=Math.abs((min+max-2*med)/range);crit=1/Math.log(n+9)+2.5/(n+1);}
    if(scenario===2){tval=Math.abs((q1+q3-2*med)/iqr);crit=2.65/Math.sqrt(n)-6/n**2;}
    if(scenario===3){tval=Math.max(2.65*Math.log(.6*n)/Math.sqrt(n)*Math.abs((min+max-2*med)/range),Math.abs((q1+q3-2*med)/iqr));crit=3/Math.sqrt(n)-40/n**3;}
    if(tval>=crit){
      flags.push(flag("fivenum-skew","data look skewed; the mean/SD estimate may be unreliable",a.test!==false));
      if(a.test!==false)return finish();
      flags.push(flag("SKEW_OVERRIDE","User explicitly chose to convert anyway (metafor test=FALSE)"));
    }
    const mm=methods[0],sm=methods[1],luo=mm==="luo/wan/shi"||mm==="luo2016";
    const xi=2*qnorm((n-.375)/(n+.25)),eta=2*qnorm((.75*n-.125)/(n+.25));
    let weight;
    if(scenario===1){
      weight=4/(4+n**.75);
      if(luo)mean=weight*(min+max)/2+(1-weight)*med;
      if(mm==="hozo2005")mean=Number.isNaN(n)?NaN:n<=25?(min+2*med+max)/4:med;
      if(mm==="wan2014")mean=(min+2*med+max)/4;
      if(mm==="walter2007")mean=med;
      if(sm==="luo/wan/shi"||sm==="wan2014")sd=range/xi/Math.sqrt(dist==="lnorm"?1.01+.25/Math.log(n)**2:1);
      if(sm==="hozo2005")sd=Number.isNaN(n)?NaN:n<=15?Math.sqrt((min-2*med+max)**2/4+range**2)/Math.sqrt(12):n<=70?range/4:range/6;
      if(sm==="walter2007"&&finite(n))sd=range/expectedRange(n);
    }
    if(scenario===2){
      weight=.7+.39/n;
      if(luo)mean=weight*(q1+q3)/2+(1-weight)*med;
      if(mm==="wan2014")mean=(q1+med+q3)/3;
      if(sm==="luo/wan/shi"||sm==="wan2014")sd=iqr/eta/Math.sqrt(dist==="lnorm"?1+1.58/n:1);
    }
    if(scenario===3){
      const w1=2.2/(2.2+n**.75),w2=.7-.72/n**.55;
      if(luo)mean=w1*(min+max)/2+w2*(q1+q3)/2+(1-w1-w2)*med;
      if(mm==="wan2014"||mm==="bland2015")mean=(min+2*q1+2*med+2*q3+max)/8;
      weight=1/(1+.07*n**.6);
      if(sm==="luo/wan/shi"||sm==="shi2020")sd=(weight*range/xi+(1-weight)*iqr/eta)/Math.sqrt(dist==="lnorm"?1+.28/Math.log(n)**2:1);
      if(sm==="wan2014")sd=.5*(range/xi+iqr/eta);
      if(sm==="bland2015")sd=Math.sqrt((min**2+2*q1**2+2*med**2+2*q3**2+max**2)/16+(min*q1+q1*med+med*q3+q3*max)/8-(min+2*q1+2*med+2*q3+max)**2/64);
    }
    if(dist==="lnorm"&&a.transf!==false&&scenario){
      let s4,phi,phi1,phi2;
      if(scenario===1){
        s4=(range/xi)**4/(1+2.23/Math.log(n)**2);
        phi=1+.565*sd**2/n+.37*s4/n;phi1=1+2.26*sd**2/n+5.92*s4/n;phi2=1+2.26*sd**2/n+1.48*s4/n;
      } else if(scenario===2){
        s4=(iqr/eta)**4/(1+19.2/n**1.2);
        phi=1+.57*sd**2/n+.75*s4/n;phi1=1+2.28*sd**2/n+12*s4/n;phi2=1+2.28*sd**2/n+3*s4/n;
      } else {
        s4=(weight*range/xi+(1-weight)*iqr/eta)**4/(1+3.93/n);
        phi=1+.405*sd**2/n+.315*s4/n;phi1=1+1.62*sd**2/n+5.04*s4/n;phi2=1+1.62*sd**2/n+1.26*s4/n;
      }
      const btmean=Math.exp(mean+sd**2/2)/phi;
      sd=Math.sqrt(Math.exp(2*mean+2*sd**2)/phi1-Math.exp(2*mean+sd**2)/phi2);mean=btmean;
    }
    return finish();
  }

  const NUM="[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
  const RANGE=`(${NUM})\\s*(?:to|,|-)\\s*(${NUM})`;
  const norm=s=>normalize(String(s===null||s===undefined?"":s)).text.trim();
  function parseCell(str,ctx={}) {
    const token=parseCellRaw(str,ctx);
    // Non-enumerable metadata preserves the established token/fixture contract.
    Object.defineProperty(token,"rule",{value:ruleRef(token._ruleId||"R-CELL-UNKNOWN"),enumerable:false});
    const comma=token._comma;
    delete token._ruleId;delete token._comma;
    const source=String(str??""),mapped=sourceMap(source),working=comma==="comma"?mapped.value.replace(ruleRegex("R-DECIMAL-REPLACE"),"$1."):mapped.value;
    // Grouped numbers keep their commas in the span so provenance quotes "1,234" verbatim.
    const numbers=[...working.matchAll(comma==="thousands"?ruleRegex("R-THOUSANDS-NUMBERS"):ruleRegex("R-CELL-NUMBERS"))],used=new Set(),spans={};
    for(const [field,value] of Object.entries(token)){
      if(!finite(value)||field==="level")continue;
      const found=numbers.find((m,i)=>!used.has(i)&&+m[0].replace(/,/g,"")===value);
      if(found){used.add(numbers.indexOf(found));spans[field]=mapped.span(found.index,found.index+found[0].length);}
    }
    Object.defineProperty(token,"spans",{value:spans,enumerable:false});
    Object.defineProperty(token,"comma",{value:comma||null,enumerable:false});
    Object.defineProperty(token,"selectors",{value:Object.fromEntries(Object.entries(spans).map(([k,p])=>[k,selectors(source,p)])),enumerable:false});
    return token;
  }
  defineRule("R-CELL-PATTERN-01","parse",new RegExp(`^(?:p\\s*)?([<>=≤≥]+)\\s*(${NUM})$`,"i"),"Cell grammar 1");
  defineRule("R-CELL-PATTERN-02","parse",new RegExp(`^(${NUM})(?:\\s*\\/\\s*(${NUM}))?\\s*[([{]\\s*(${NUM})\\s*%\\s*[)\\]}]$`),"Cell grammar 2");
  defineRule("R-CELL-PATTERN-03","parse",new RegExp(`^(${NUM})\\s*%$`),"Cell grammar 3");
  defineRule("R-CELL-PATTERN-04","parse",new RegExp(`^(${NUM})\\s*\\/\\s*(${NUM})$`),"Cell grammar 4");
  defineRule("R-CELL-PATTERN-05","parse",new RegExp(`^${NUM}$`),"Cell grammar 5");
  defineRule("R-CELL-PATTERN-06","parse",new RegExp(`^(${NUM})\\s*(?:[, ]*[(\\[{]\\s*|,\\s*|\\s+)${RANGE}\\s*[)\\]}]?$`,"i"),"Cell grammar 6");
  defineRule("R-CELL-PATTERN-07","parse",new RegExp(`^${RANGE}$`,"i"),"Cell grammar 7");
  defineRule("R-CELL-PATTERN-08","parse",new RegExp(`^(?:mean\\s*)?(${NUM})\\s*(?:±|\\+/-|[(\\[{])\\s*(${NUM})\\s*(?:[)\\]}])?\\s*$`,"i"),"Cell grammar 8");
  defineRule("R-CELL-CUE-01","context",/\d,\d/,"R-CELL-CUE cue 1");
  defineRule("R-CELL-CUE-02","context",/^(?:NA|N\/A|NR|not reported|-)$/i,"R-CELL-CUE cue 2");
  defineRule("R-CELL-CUE-03","context",/^p(?:[ -]?value)?$/,"R-CELL-CUE cue 3");
  defineRule("R-CELL-CUE-04","context",/^p(?:[ -]?value)?$/,"R-CELL-CUE cue 4");
  defineRule("R-CELL-CUE-05","context",/\d+(?:\.\d+)?\s*%\s*CI/ig,"R-CELL-CUE cue 5");
  defineRule("R-CELL-CUE-06","context",/\b(?:median|mean|IQR|range|CI)\b/ig,"R-CELL-CUE cue 6");
  defineRule("R-CELL-CUE-07","context",/[;:]/g,"R-CELL-CUE cue 7");
  defineRule("R-CELL-CUE-08","context",/\b(SD|SE)\b/i,"R-CELL-CUE cue 8");
  defineRule("R-CELL-CUE-09","context",/\b(?:SD|SE)\b/ig,"R-CELL-CUE cue 9");
  defineRule("R-CELL-CUE-10","context",/\bse\b|standard error/,"R-CELL-CUE cue 10");
  defineRule("R-CELL-CUE-11","context",/\bsd\b|standard deviation/,"R-CELL-CUE cue 11");
  defineRule("R-CELL-UNKNOWN","unknown",/.*/,"Unsupported or unresolved cell");
  defineRule("R-CELL-MEDIAN_IQR","median_iqr",ruleRegex("R-CELL-PATTERN-06"),"Three-number cell with an IQR header or cue");
  defineRule("R-CELL-MEDIAN_RANGE","median_range",ruleRegex("R-CELL-PATTERN-06"),"Three-number cell with a range header or cue");
  defineRule("R-CELL-EST_CI","est_ci",ruleRegex("R-CELL-PATTERN-06"),"Estimate with lower and upper interval limits");
  defineRule("R-CELL-MEAN_SD","mean_sd",ruleRegex("R-CELL-PATTERN-08"),"Mean and spread, requiring SD/SE interpretation");
  defineRule("R-CELL-NUMBERS","span",new RegExp(`(?<![\\d.])${NUM}`,"g"),"Source numeric token spans");
  defineRule("R-CELL-LEVEL","context",/(\d+(?:\.\d+)?)\s*%\s*CI/i,"Explicit confidence level");
  defineRule("R-CELL-IQR","context",/iqr|interquartile/i,"Interquartile range cue");
  defineRule("R-CELL-RANGE","context",/range/i,"Range cue");
  // Meaning of a comma between digits. decimal: "comma" (decimal mark), "thousands" (digit grouping),
  // "list" (separates values; legacy alias "separator"), "point" (the per-paste setting: the comma is not a
  // decimal mark, so it is grouping when every such comma is a valid 3-digit group, otherwise a list
  // separator); anything else ("ask", undefined) leaves the cell ambiguous so convert() asks.
  function commaMode(s,decimal) {
    if(!ruleRegex("R-CELL-CUE-01").test(s))return null;
    if(decimal==="separator")decimal="list";
    if(decimal==="point")return ruleRegex("R-CELL-CUE-01").test(s.replace(ruleRegex("R-THOUSANDS-GROUP"),""))?"list":"thousands";
    return ["comma","thousands","list"].includes(decimal)?decimal:"ask";
  }
  function parseCellRaw(str,ctx={}) {
    let s=norm(str),header=String(ctx.header||"").toLowerCase();
    const comma=commaMode(s,ctx.decimal);
    if(comma==="ask")return {_ruleId:"R-CELL-UNKNOWN",kind:"unknown",raw:s,ambiguousDecimal:true};
    if(comma==="comma")s=s.replace(ruleRegex("R-DECIMAL-REPLACE"),"$1.");
    if(comma==="thousands"){
      s=s.replace(ruleRegex("R-THOUSANDS-GROUP"),"");
      // A comma that is not a valid 3-digit group cannot be a thousands separator.
      if(ruleRegex("R-CELL-CUE-01").test(s))return {_ruleId:"R-THOUSANDS-GROUP",_comma:comma,kind:"unknown",raw:norm(str),invalidGrouping:true};
    }
    // A bare "a,b" with a non-decimal comma is two listed values, never a CI or range.
    if(comma==="list"&&ruleRegex("R-LIST-PAIR").test(s))return {_ruleId:"R-LIST-PAIR",_comma:comma,kind:"unknown",raw:s,listPair:true};
    return {...parseCellGrammar(s,header,ctx),...(comma?{_comma:comma}:{})};
  }
  function parseCellGrammar(s,header,ctx) {
    let m;
    if(!s||ruleRegex("R-CELL-CUE-02").test(s))return {_ruleId:"R-CELL-UNKNOWN",kind:"unknown",raw:s,missing:true};
    if((m=s.match(ruleRegex("R-CELL-PATTERN-01"))))return {_ruleId:"R-CELL-PATTERN-01",kind:"p",op:m[1],value:+m[2]};
    if((m=s.match(ruleRegex("R-CELL-PATTERN-02"))))return {_ruleId:"R-CELL-PATTERN-02",kind:"n_pct",num:+m[1],...(m[2]?{den:+m[2]}:{}),pct:+m[3]};
    if((m=s.match(ruleRegex("R-CELL-PATTERN-03"))))return {_ruleId:"R-CELL-PATTERN-03",kind:"percent",value:+m[1]};
    if((m=s.match(ruleRegex("R-CELL-PATTERN-04"))))return {_ruleId:"R-CELL-PATTERN-04",kind:"fraction",num:+m[1],den:+m[2]};
    if((m=s.match(ruleRegex("R-CELL-PATTERN-05"))))return {_ruleId:"R-CELL-PATTERN-05",kind:ruleRegex("R-CELL-CUE-03").test(header)?"p":"number",value:+m[0],...(ruleRegex("R-CELL-CUE-04").test(header)?{op:"="}:{})};
    const levelMatch=s.match(ruleRegex("R-CELL-LEVEL"));
    const level=levelMatch?+levelMatch[1]/100:undefined;
    const isIQR=ruleRegex("R-CELL-IQR").test(s+" "+header),isRange=ruleRegex("R-CELL-RANGE").test(s+" "+header);
    let clean=s.replace(ruleRegex("R-CELL-CUE-05"),"").replace(ruleRegex("R-CELL-CUE-06"),"").replace(ruleRegex("R-CELL-CUE-07")," ").trim();
    if((m=clean.match(ruleRegex("R-CELL-PATTERN-06")))){
      if(isIQR)return {_ruleId:"R-CELL-MEDIAN_IQR",kind:"median_iqr",median:+m[1],q1:+m[2],q3:+m[3]};
      if(isRange)return {_ruleId:"R-CELL-MEDIAN_RANGE",kind:"median_range",median:+m[1],min:+m[2],max:+m[3]};
      return {_ruleId:"R-CELL-EST_CI",kind:"est_ci",est:+m[1],lo:+m[2],hi:+m[3],...(level?{level}:{})};
    }
    if((m=clean.match(ruleRegex("R-CELL-PATTERN-07"))))return {_ruleId:"R-CELL-PATTERN-07",kind:"ci",lo:+m[1],hi:+m[2],...(level?{level}:{})};
    const statedDispersion=s.match(ruleRegex("R-CELL-CUE-08"));
    const dispersionText=s.replace(ruleRegex("R-CELL-CUE-09"),"").trim();
    if((m=dispersionText.match(ruleRegex("R-CELL-PATTERN-08")))){
      const dispersion=((statedDispersion&&statedDispersion[1])||(ruleRegex("R-CELL-CUE-10").test(header)?"SE":ruleRegex("R-CELL-CUE-11").test(header)?"SD":"")).toUpperCase();
      return {_ruleId:"R-CELL-MEAN_SD",kind:"mean_sd",mean:+m[1],spread:+m[2],dispersion:dispersion||null,ambiguousDispersion:!dispersion};
    }
    return {_ruleId:"R-CELL-UNKNOWN",kind:"unknown",raw:s};
  }
  // RFC-4180 scanner also handles tabs/semicolons and quoted newlines.
  function scan(text,delimiter) {
    const rows=[];let row=[],cell="",quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){
        if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
      }else if(!quoted&&(c==="\n"||c==="\r")){
        if(c==="\r"&&text[i+1]==="\n")i++;
        row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell="";
      }else if(!quoted&&((delimiter==="spaces"&&c===" "&&text[i+1]===" ")||c===delimiter)){
        row.push(cell.trim());cell="";if(delimiter==="spaces")while(text[i+1]===" ")i++;
      }else cell+=c;
    }
    row.push(cell.trim());if(row.some(Boolean))rows.push(row);
    return {rows,unclosed:quoted};
  }
  function parseTable(text,ctx={}) {
    text=String(text||"").replace(/^\uFEFF/,"").replace(/[\u00a0\u2009\u202f]/g," ");
    const notes=[];
    // Inspect only separators outside quotes.
    let outside="",quoted=false;
    for(let i=0;i<text.length;i++){if(text[i]==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted)outside+=text[i];}
    let delimiter=ctx.delimiter|| (outside.includes("\t")?"\t":outside.includes(";")?";":null);
    if(!delimiter&&outside.includes(",")){
      if(/\d,\d/.test(outside)){notes.push("Decimal comma or CSV separator is ambiguous; confirm before conversion");delimiter=/ {2,}/.test(outside)?"spaces":null;}
      else delimiter=",";
    }
    if(!delimiter&&/ {2,}/.test(outside))delimiter="spaces";
    const parsed=scan(text,delimiter);
    if(parsed.unclosed)notes.push("Unclosed quoted field");
    const first=parsed.rows[0]||[];
    const headerLike=first.length>0 && first.every(s=>parseCell(s).kind==="unknown"&&!parseCell(s).ambiguousDecimal);
    const header=headerLike?parsed.rows.shift():null;
    if(parsed.rows.some(r=>r.length!==(header||first).length))notes.push("Rows have different column counts");
    return {rows:parsed.rows,delimiter,header,notes,source:text};
  }
  const SCHEMAS={
    generic:["study","yi","sei"],binary2x2:["study","ai","n1i","ci","n2i"],
    continuous:["study","m1i","sd1i","n1i","m2i","sd2i","n2i"],
    proportion:["study","xi","ni"],correlation:["study","ri","ni"],
    dta:["study","tp","fp","fn","tn"],
    "arm-nma":["study","treatment","events","n","mean","sd"],
    "contrast-nma":["study","t1","t2","yi","sei"],
    dose:["study","dose","cases","n","yi","sei"]
  };
  const sources=["est","lo","hi","p","se","sd","mean","n","min","q1","median","q3","max","pct","ci_bounds","summary","summary1","summary2","se1","se2","lo1","hi1","lo2","hi2"];
  function schemaName(schema){return typeof schema==="object"?schema.name||schema.schema:""+schema;}
  function schemaFields(schema){return SCHEMAS[schemaName(schema)]||SCHEMAS.generic;}
  function question(id,text,choices){return {id,text,choices};}
  function headerField(raw,schema) {
    const h=norm(raw).toLowerCase().replace(/[_-]/g," ").replace(/\s+/g," ").trim(),fields=schemaFields(schema);
    const exact=fields.find(k=>k.toLowerCase()===h);
    if(exact)return exact;
    if(/^(study|study id|study name|author|authors|reference|trial|study or subgroup)$/.test(h))return "study";
    if(/^(treatment|arm|intervention)$/.test(h))return "treatment";
    if(/^(tp|true positive|true positives)$/.test(h))return "tp";
    if(/^(fp|false positive|false positives)$/.test(h))return "fp";
    if(/^(fn|false negative|false negatives)$/.test(h))return "fn";
    if(/^(tn|true negative|true negatives)$/.test(h))return "tn";
    const control=/control|comparator|group 2|arm 2/.test(h),experimental=/experimental|intervention|treatment|group 1|arm 1/.test(h);
    if(control||experimental){
      const suffix=control?"2":"1";
      if(/events|cases/.test(h))return control?"ci":"ai";
      if(/total|sample size|\bn\b/.test(h))return "n"+suffix+"i";
      if(/standard error|\bse\b/.test(h))return "se"+suffix;
      if(/mean.*(?:sd|se)|median|iqr|range/.test(h))return "summary"+suffix;
      if(/standard deviation|\bsd\b/.test(h))return "sd"+suffix+"i";
      if(/mean/.test(h))return "m"+suffix+"i";
    }
    if(/^(?:95% )?(?:ci|confidence interval)$/.test(h))return "ci_bounds";
    if(/^(ll|llci|lower|lower ci|ci lower|ci lb|lower bound|95% ci lower)$/.test(h))return "lo";
    if(/^(ul|ulci|upper|upper ci|ci ub|upper bound|95% ci upper)$/.test(h))return "hi";
    if(/^(p|p value|pvalue)$/.test(h))return "p";
    if(/^(se|standard error|se of effect)$/.test(h))return fields.includes("sei")?"sei":schemaName(schema)==="continuous"?"se1":"se";
    if(/^(sd|standard deviation)$/.test(h))return fields.includes("sd")?"sd":schemaName(schema)==="continuous"?"sd1i":"sd";
    if(/mean.*(?:sd|se)|median.*(?:iqr|range)|iqr/.test(h))return "summary";
    if(/^(min|minimum)$/.test(h))return "min";
    if(/^(max|maximum)$/.test(h))return "max";
    if(/^(q1|first quartile|25th percentile)$/.test(h))return "q1";
    if(/^(q3|third quartile|75th percentile)$/.test(h))return "q3";
    if(h==="median")return "median";
    if(h==="mean")return schemaName(schema)==="continuous"?"m1i":"mean";
    if(/^(n|total|sample size|participants|number of participants)$/.test(h))return fields.includes("ni")?"ni":schemaName(schema)==="continuous"?"n1i":"n";
    if(/^(events|event|cases|number of events)$/.test(h))return fields.includes("xi")?"xi":fields.includes("cases")?"cases":"events";
    if(/^(%|percent|percentage|event rate)$/.test(h))return "pct";
    if(/^(r|correlation|pearson r)$/.test(h))return "ri";
    if(/dose/.test(h))return "dose";
    if(/^(yi|estimate|effect|effect size|or|rr|hr|md|smd|log or|log rr|log hr)$/.test(h)||/risk ratio|odds ratio|hazard ratio|mean difference/.test(h))return "yi";
    if(/^(weight|weight %)$/.test(h))return "ignore";
    return null;
  }
  // Effect-measure family named by headers. Abbreviations match case-sensitively as whole tokens, so the
  // English word "or" (RevMan's "Study or Subgroup", "Mean (SD) or median (IQR)") never names a ratio.
  // Label columns (study, treatment, t1, t2) are skipped. A difference header never sets ratio: when both
  // families are named, nothing is decided and convert() asks.
  defineRule("R-MEASURE-RATIO","context",/(?:^|[^A-Za-z])(?:OR|RR|HR|IRR)(?![A-Za-z])/,"Ratio measure abbreviation in a header");
  defineRule("R-MEASURE-RATIO-WORDS","context",/odds ratio|risk ratio|hazard ratio|rate ratio|relative risk/i,"Spelled-out ratio measure (any case)");
  defineRule("R-MEASURE-DIFFERENCE","context",/(?:^|[^A-Za-z])(?:MD|SMD|WMD|RD)(?![A-Za-z])/,"Difference measure abbreviation in a header");
  defineRule("R-MEASURE-DIFFERENCE-WORDS","context",/difference/i,"Spelled-out difference measure (any case)");
  function measureFromHeaders(headers,mapping={}) {
    const named=(headers||[]).filter((h,i)=>h&&!["study","treatment","t1","t2"].includes(mapping[i])).map(h=>norm(h));
    const ratio=named.some(h=>ruleRegex("R-MEASURE-RATIO").test(h)||ruleRegex("R-MEASURE-RATIO-WORDS").test(h));
    const difference=named.some(h=>ruleRegex("R-MEASURE-DIFFERENCE").test(h)||ruleRegex("R-MEASURE-DIFFERENCE-WORDS").test(h));
    return ratio&&!difference?"ratio":difference&&!ratio?"difference":null;
  }
  function detect(table,schema) {
    const mapping={},confidence={},questions=[],used=new Set(),width=Math.max(0,(table.header||[]).length,...table.rows.map(r=>r.length));
    const choices=["ignore",...new Set([...schemaFields(schema),...sources])];
    for(let col=0;col<width;col++){
      const h=table.header&&table.header[col];let field=h?headerField(h,schema):null,score=field?1:0;
      if(field&&field!=="ignore"&&used.has(field)){field=null;score=0;}
      const heuristicField=schemaFields(schema).includes("xi")?"xi":"events";
      if(!field&&!used.has(heuristicField)){
        const vals=table.rows.map(r=>parseCell(r[col]));
        const next=table.rows.map(r=>parseCell(r[col+1]));
        if(vals.length&&vals.every((v,i)=>v.kind==="number"&&Number.isInteger(v.value)&&v.value>=0&&next[i].kind==="number"&&v.value<=next[i].value)){
          field=heuristicField;score=.55;
        }
      }
      mapping[col]=field||"ignore";confidence[col]=score;
      if(field&&field!=="ignore")used.add(field);
      if(score<.85)questions.push(question("column:"+col,`Choose the meaning of column ${col+1}${h?` (${h})`:""}`,choices));
    }
    return {mapping,confidence,questions};
  }

  // Plain words for every schema field (screens never show xi/ni codes; the CSV keeps them).
  const FIELD_LABELS={study:"Study label",xi:"events",ni:"total in this group",events:"events",n:"total in this group",cases:"cases",
    ai:"events (intervention)",n1i:"total (intervention)",ci:"events (control)",n2i:"total (control)",yi:"effect estimate",sei:"standard error",
    ri:"correlation",m1i:"mean (intervention)",sd1i:"SD (intervention)",m2i:"mean (control)",sd2i:"SD (control)",tp:"true positives",fp:"false positives",
    fn:"false negatives",tn:"true negatives",treatment:"treatment name",mean:"mean",sd:"SD",t1:"treatment 1",t2:"treatment 2",dose:"dose",
    est:"estimate",lo:"lower limit",hi:"upper limit",p:"p-value",se:"standard error",min:"minimum",q1:"first quartile",median:"median",q3:"third quartile",
    max:"maximum",pct:"percent",ci_bounds:"confidence interval (both limits)",summary:"summary (mean (SD) or median (IQR))",summary1:"summary (intervention)",
    summary2:"summary (control)",se1:"standard error (intervention)",se2:"standard error (control)",lo1:"lower limit (intervention)",hi1:"upper limit (intervention)",
    lo2:"lower limit (control)",hi2:"upper limit (control)",subgroup:"subgroup"};
  const capital=s=>s.charAt(0).toUpperCase()+s.slice(1);
  const checkRow=r=>r.study?` Check row '${r.study}'.`:"";
  const plural=(n,word)=>`${n} ${word}${n===1?"":"s"}`;
  // Exported rules permit an independent planted-defect test of the gate.
  const sanityRules = {
    events:(r)=>[["xi","ni"],["events","n"],["cases","n"],["ai","n1i"],["ci","n2i"]].flatMap(([e,n])=>finite(r[e])&&((finite(r[n])&&r[e]>r[n])||r[e]<0)?[flag("events-bounds",r[e]<0?`${capital(FIELD_LABELS[e]||e)} (${r[e]}) cannot be negative.${checkRow(r)}`:`${capital(FIELD_LABELS[e]||e)} (${r[e]}) cannot be more than the ${FIELD_LABELS[n]||n} (${r[n]}).${checkRow(r)}`,true,{field:e})]:[]),
    sample:r=>["ni","n","n1i","n2i"].filter(k=>finite(r[k])&&r[k]<=0).map(k=>flag("sample-size",`${capital(FIELD_LABELS[k]||k)} (${r[k]}) must be more than 0.${checkRow(r)}`,true,{field:k})),
    ci:r=>finite(r.lo)&&finite(r.hi)&&r.lo>r.hi?[flag("ci-order","Lower CI exceeds upper CI; swap bounds",true,{action:"swap-ci"})]:[],
    estimate:r=>{
      const est=present(r.est)?r.est:r.yi,unit=r.roundingUnit===undefined?1e-12:r.roundingUnit;
      return finite(est)&&finite(r.lo)&&finite(r.hi)&&(est<r.lo-.5*unit||est>r.hi+.5*unit)?[flag("estimate-outside","Estimate is outside its CI beyond rounding",true)]:[];
    },
    sd:r=>["sd","sd1i","sd2i"].filter(k=>finite(r[k])&&r[k]<0).map(k=>flag("negative-sd",`${k} must not be negative`,true)),
    quartiles:r=>finite(r.q1)&&finite(r.q3)&&r.q1>r.q3?[flag("quartile-order","q1 exceeds q3",true)]:[],
    extremes:r=>(finite(r.min)&&finite(r.q1)&&r.min>r.q1)||(finite(r.q3)&&finite(r.max)&&r.q3>r.max)?[flag("extreme-order","min > q1 or q3 > max",true)]:[],
    median:r=>finite(r.median)&&((finite(r.q1)&&r.median<r.q1)||(finite(r.q3)&&r.median>r.q3))?[flag("median-outside","Median is outside the IQR",true)]:[],
    ratio:r=>r.ratio&&r.scale!=="log"&&[present(r.est)?"est":"yi","lo","hi"].some(k=>finite(r[k])&&r[k]<=0)?[flag("ratio-positive","A ratio must be positive on its natural scale",true)]:[],
    asymmetry:r=>{
      let e=present(r.est)?r.est:r.yi,l=r.lo,h=r.hi;
      if(![e,l,h].every(finite)||l>h)return [];
      if(r.ratio&&r.scale!=="log"){if(Math.min(e,l,h)<=0)return [];[e,l,h]=[e,l,h].map(Math.log);}
      const a=Math.abs(e-l),b=Math.abs(h-e);
      return Math.abs(a-b)>.1*Math.max(a,b)?[flag("ci-asymmetric","CI is asymmetric: check scale/rounding")]:[];
    },
    logscale:r=>r.ratio&&r.scale!=="log"&&[present(r.est)?"est":"yi","lo","hi"].some(k=>finite(r[k])&&r[k]<0)?[flag("ratio-log-scale","Values look log-scale for a ratio measure; confirm scale")]:[],
    p:r=>{
      const est=present(r.est)?r.est:r.yi,p=typeof r.p==="object"?r.p.value:r.p;
      if(!finite(est)||!finite(p)||p<=0||p>=1||(typeof r.p==="object"&&r.p.op!=="="))return [];
      const a={lo:r.lo,hi:r.hi,level:r.level,ratio:r.ratio&&r.scale!=="log"};
      if(!validCI(a))return [];
      const se=seFromCI(a).value,e=a.ratio?Math.log(est):est;
      if(!(se>0)||!finite(e))return [];
      const pci=2*normalTail(Math.abs(e)/se);
      return Math.abs(Math.log10(p)-Math.log10(pci))>.5?[flag("p-ci-inconsistent","p is inconsistent with CI (Altman & Bland 2011)")]:[];
    },
    counts:r=>["xi","ni","events","n","cases","ai","ci","n1i","n2i","tp","fp","fn","tn"].filter(k=>finite(r[k])&&!Number.isInteger(r[k])).map(k=>flag("noninteger-count",`${k} is not an integer`,false,{field:k})),
    dta:r=>["tp","fp","fn","tn"].filter(k=>finite(r[k])&&r[k]<0).map(k=>flag("negative-count",`${k} must not be negative`,true))
  };
  function sanity(records,schema) {
    const flags=[],seen=new Set();
    records.forEach((r,row)=>{
      const enriched={...(typeof schema==="object"?{ratio:schema.ratio}:{}),...r};
      Object.values(sanityRules).forEach(rule=>rule(enriched).forEach(f=>flags.push({...f,row,study:r.study})));
      consistency(enriched).filter(f=>!flags.some(old=>old.row===row&&old.code===f.code)).forEach(f=>flags.push({...f,row,study:r.study}));
      if(r.study&&seen.has(r.study))flags.push(flag("duplicate-study","Duplicate study label",false,{row,study:r.study}));
      if(r.study)seen.add(r.study);
    });
    for(const [e,n] of [["xi","ni"],["events","n"],["cases","n"],["ai","n1i"],["ci","n2i"]]){
      if(records.length&&records.every(r=>finite(r[e])&&finite(r[n])&&r[e]>r[n]))flags.push(flag("swapped-columns",`Every value in the ${FIELD_LABELS[e]||e} column is larger than the ${FIELD_LABELS[n]||n}; the two columns may be swapped`,false,{action:"swap-columns",fields:[e,n]}));
    }
    return flags;
  }
  const commaWords={comma:"a decimal mark",thousands:"a thousands separator",list:"a list separator"};
  const effectFields=["yi","est","lo","hi","p","ci_bounds"];
  // A conversion depends on ratio vs difference unless every effect column is an analysis-scale "yi"
  // column (header "yi", or a user mapping on a headerless paste) holding plain numbers.
  function measureMatters(table,map,answers) {
    return Object.keys(map).filter(k=>effectFields.includes(map[k])).some(k=>{
      const h=(table.header||[])[k];
      if(map[k]!=="yi"||(h&&!/^\s*yi\s*$/i.test(h)))return true;
      return table.rows.some(r=>["ci","est_ci"].includes(parseCell(r[k],{header:h,decimal:answers.decimal}).kind));
    });
  }
  function logSymmetricHint(table,map,answers) {
    const triples=table.rows.map(row=>{
      const t={};
      Object.keys(map).filter(k=>effectFields.includes(map[k])).forEach(k=>{
        const c=parseCell(row[k],{header:(table.header||[])[k],decimal:answers.decimal});
        if(c.kind==="est_ci"){t.e=c.est;t.l=c.lo;t.h=c.hi;}else if(c.kind==="ci"){t.l=c.lo;t.h=c.hi;}
        else if(c.kind==="number")t[map[k]==="lo"?"l":map[k]==="hi"?"h":"e"]=c.value;
      });
      return t;
    }).filter(t=>[t.e,t.l,t.h].every(v=>finite(v)&&v>0)&&t.l<t.e&&t.e<t.h);
    const asym=(e,l,h)=>{const a=e-l,b=h-e;return Math.abs(a-b)>.1*Math.max(a,b);};
    return triples.length>0&&triples.every(t=>asym(t.e,t.l,t.h)&&!asym(Math.log(t.e),Math.log(t.l),Math.log(t.h)));
  }
  function roundingUnit(text) {
    const m=norm(text).match(new RegExp(NUM));
    if(!m)return 1e-12;
    const parts=m[0].toLowerCase().split("e"),digits=(parts[0].split(".")[1]||"").length;
    return 10**((+parts[1]||0)-digits);
  }
  function convert(table,mapping,schema="generic",answers={}) {
    const records=[],steps=[],flags=[],questions=[],fields=schemaFields(schema),name=schemaName(schema);
    const detected=detect(table,schema);
    // A supplied mapping is an explicit user decision. A detect result retains
    // confidence questions until answered; the UI passes that result.
    const detectionObject=mapping&&mapping.mapping;
    const map={...(detectionObject?mapping.mapping:mapping||detected.mapping)};
    const ask=q=>{if(!questions.some(x=>x.id===q.id))questions.push(q);return answers[q.id];};
    if(!mapping||detectionObject)for(const q of (detectionObject?mapping.questions:detected.questions)||[]){
      const a=ask(q);if(q.choices.includes(a))map[q.id.split(":")[1]]=a;
    }
    if(table.notes.some(n=>/Decimal comma/.test(n))){
      const a=ask(question("table:delimiter","Does comma separate columns or mark decimals?",["columns","decimals"]));
      if(a==="columns"){
        // parseTable retained the raw cell; scan after explicit consent.
        const text=table.source||[...(table.header?[table.header]:[]),...table.rows].map(r=>r.join(table.delimiter==="spaces"?"  ":table.delimiter||"")).join("\n");
        const parsed=parseTable(text,{delimiter:","});
        const retry=convert(parsed,null,schema,{...answers,"table:delimiter":"columns"});
        return {...retry,questions:[...questions,...retry.questions]};
      }
    }
    if(table.notes.some(n=>/Unclosed|different column/.test(n)))flags.push(flag("table-shape","Repair unclosed quotes or inconsistent column counts",true));
    // Ratio vs difference decides log transforms; when neither the schema nor a header names the measure
    // and a conversion depends on it, ask (blocking). CI symmetry is shown as a hint, never used to decide.
    const headerMeasure=measureFromHeaders(table.header,map);
    let ratio=headerMeasure==="ratio";
    if(typeof schema==="object"&&schema.ratio!==undefined)ratio=!!schema.ratio;
    else if(!headerMeasure&&["generic","contrast-nma","dose"].includes(name)&&!(table.header||[]).some(h=>/\blog\b|ln\s*\(/i.test(h))&&measureMatters(table,map,answers)){
      const hint=logSymmetricHint(table,map,answers);
      const q=question("measure:type",`Is the effect measure a ratio (OR, RR, HR: positive values, CI symmetric on the log scale) or a difference (MD, SMD, RD)?${hint?" Hint: these confidence intervals are symmetric on the log scale but not on the natural scale, which suggests a ratio. Please confirm.":""}`,["ratio","difference"]);
      if(hint)q.hint="log-symmetric";
      const a=ask(q);ratio=a==="ratio";
      if(q.choices.includes(a))steps.push({row:null,study:null,text:`Effect measure confirmed as a ${a}`,method:"measure confirmed",citation:"User confirmation",inputs:{measure:a},flags:[]});
    }
    // answers.fivenumMethod: one FIVENUM_METHODS entry or a [mean, sd] pair (metafor conv.fivenum names).
    const fivenumOption=answers.fivenumMethod?{method:answers.fivenumMethod}:{};
    const fivenumNote=answers.fivenumMethod?` using ${[].concat(answers.fivenumMethod).join(" / ")} (user-selected method)`:"";
    table.rows.forEach((row,i)=>{
      const r={study:`Study ${i+1}`,...(answers.integerScale?{integerScale:true}:{})},pending=[];
      if(ratio)r.ratio=true;
      function log(out,description) {
        out.flags.forEach(f=>flags.push({...f,row:i,study:r.study}));
        steps.push({row:i,study:r.study,text:`${r.study}: ${description} (${out.citation})`,method:out.method,citation:out.citation,inputs:out.inputs,flags:out.flags,...(out.fn?{fn:out.fn,args:out.args,result:out.result,rulesVersion:out.rulesVersion}:{})});
        return out.value;
      }
      row.forEach((cell,col)=>{
        const field=map[col];
        if(!field||field==="ignore")return;
        if(["study","treatment","t1","t2"].includes(field)||(!fields.includes(field)&&!sources.includes(field))){r[field]=cell;return;}
        const header=(table.header||[])[col]||"";
        let token=parseCell(cell,{header,decimal:answers.decimal});
        // Asked only in "ask" mode (or when no per-paste setting is given); the setting otherwise decides.
        if(token.ambiguousDecimal){
          const q=question(`decimal:${i}:${col}`,`${r.study}, ${header||field}: what does the comma in "${cell}" mean?`,["comma","thousands","list"]);
          q.labels={comma:"Decimal mark (1,23 = 1.23)",thousands:"Thousands separator (1,234 = 1234)",list:"List separator"};
          const a=ask(q);
          if(q.choices.includes(a)){
            token=parseCell(cell,{header,decimal:a});
            steps.push({row:i,study:r.study,text:`${r.study}: comma interpreted as ${commaWords[a]} by confirmation`,method:"decimal confirmed",citation:"User confirmation",inputs:{cell,comma:a},flags:[]});
          }
        }else if(token.comma==="thousands"||token.comma==="list"&&answers.decimal==="point")steps.push({row:i,study:r.study,text:`${r.study}: comma in "${cell}" read as ${commaWords[token.comma]} (decimal setting: ${answers.decimal})`,method:"decimal setting",citation:"Per-paste decimal setting",inputs:{cell,comma:token.comma},flags:[]});
        if(token.ambiguousDispersion){
          const q=question(`dispersion:${i}:${col}`,`${r.study}: is ${token.spread} an SD or SE?`,["SD","SE"]),a=ask(q);
          if(q.choices.includes(a)){
            token={...token,spans:token.spans,dispersion:a,ambiguousDispersion:false};
            steps.push({row:i,study:r.study,text:`${r.study}: dispersion confirmed as ${a}`,method:"dispersion confirmed",citation:"User confirmation",inputs:{cell,dispersion:a},flags:[]});
          }
        }
        if(token.kind==="unknown"){
          if(!token.missing&&!token.ambiguousDecimal)flags.push(flag("unparsed-cell",`${r.study}: cannot parse ${header||field}: ${cell}${token.listPair?" (two comma-separated values are not an interval; enter the CI with 'to' or a dash)":token.invalidGrouping?" (not a valid thousands grouping)":""}`,true,{row:i}));
          return;
        }
        if(token.kind==="number"){r[field]=token.value;if(["yi","est"].includes(field))r.roundingUnit=roundingUnit(cell);if(answers.integerScale&&["mean","m1i","m2i"].includes(field))r[field+"Text"]=cell;return;}
        if(token.kind==="p"){r.p=token;return;}
        if(token.kind==="percent"){pending.push({kind:"percent",field,pct:token.value});return;}
        if(token.kind==="fraction"||token.kind==="n_pct"){
          r[field]=token.num;
          const total=({xi:"ni",events:"n",cases:"n",ai:"n1i",ci:"n2i"})[field];
          if(total&&present(token.den))r[total]=token.den;
          if(token.kind==="n_pct"){r.pct=token.pct;r.pctText=cell.match(/([\d.,·⋅]+)\s*%/)?.[1];r.events=token.num;if(total)r.n=r[total];}
          return;
        }
        if(token.kind==="est_ci"||token.kind==="ci"){
          const suffix=/[12]$/.test(field)?field.slice(-1):"";
          if(suffix){r["lo"+suffix]=token.lo;r["hi"+suffix]=token.hi;if(present(token.est))r["m"+suffix+"i"]=token.est;}
          else {r.lo=token.lo;r.hi=token.hi;if(present(token.est)){r.est=token.est;r.roundingUnit=roundingUnit(cell);}}
          if(token.level)r.level=token.level;
          return;
        }
        pending.push({field,...token,...(token.kind==="mean_sd"?{meanText:cell.slice(...token.spans.mean)}:{})});
      });
      for(const q of pending){
        const suffix=/[12](?:i)?$/.test(q.field)?q.field.match(/([12])(?:i)?$/)[1]:"";
        const meanKey=suffix?"m"+suffix+"i":name==="continuous"?"m1i":"mean";
        const sdKey=suffix?"sd"+suffix+"i":name==="continuous"?"sd1i":"sd";
        const nKey=suffix?"n"+suffix+"i":name==="continuous"?"n1i":fields.includes("ni")?"ni":"n";
        if(q.kind==="percent"){
          const target=q.field==="pct"?(fields.includes("xi")?"xi":fields.includes("cases")?"cases":"events"):q.field;
          const total=({ai:"n1i",ci:"n2i",xi:"ni"})[target]||nKey;
          r[target]=log(eventsFromPercent({pct:q.pct,n:r[total]}),"Events estimated from percent");
        }else if(q.kind==="mean_sd"){
          r[meanKey]=q.mean;
          if(answers.integerScale)r[meanKey+"Text"]=q.meanText;
          if(q.dispersion==="SD")r[sdKey]=q.spread;
          if(q.dispersion==="SE")r[sdKey]=log(sdFromSE({se:q.spread,n:r[nKey]}),"SD estimated from SE");
        }else if(q.kind==="median_iqr"||q.kind==="median_range"){
          const a={median:q.median,n:r[nKey],...(q.kind==="median_iqr"?{q1:q.q1,q3:q.q3}:{min:q.min,max:q.max})};
          Object.assign(r,a);
          try{const out=fivenumChoice({...a,...fivenumOption},i,ask);log(out,`Mean and SD estimated from ${q.kind==="median_iqr"?"IQR":"range"}${fivenumNote}`);r[meanKey]=out.mean;r[sdKey]=out.sd;}
          catch(e){flags.push(flag("fivenum-invalid",e.message,true,{row:i}));}
        }
      }
      if(["generic","contrast-nma","dose"].includes(name)){
        if(!present(r.est)&&present(r.yi))r.est=r.yi;
        const negative=["est","lo","hi"].some(k=>finite(r[k])&&r[k]<0);
        const logHeader=(table.header||[]).some(h=>/\blog\b|ln\s*\(/i.test(h));
        if(ratio){
          const q=question(`scale:${i}`,`${r.study}: are ratio values on the natural or log scale${negative?" (negative values detected)":""}?`,["natural","log"]);
          r.scale=logHeader?"log":ask(q);
        }
        if(r.scale==="log")steps.push({row:i,study:r.study,text:`${r.study}: ratio values confirmed on log scale`,method:"scale confirmed",citation:"User confirmation or explicit header",inputs:{scale:"log"},flags:[]});
        const a={lo:r.lo,hi:r.hi,ratio:ratio&&r.scale!=="log",level:r.level};
        if(!present(r.est)&&present(r.lo)&&present(r.hi))r.est=log(estFromCI(a),"Estimate taken as CI midpoint");
        if(!present(r.sei)&&present(r.lo)&&present(r.hi))r.sei=log(seFromCI(a),"SE estimated from CI");
        if(!present(r.sei)&&present(r.p))r.sei=log(seFromP({est:r.est,p:r.p,ratio:a.ratio}),"SE estimated from p");
        r.yi=ratio&&r.scale!=="log"&&r.est>0?Math.log(r.est):r.est;
      }
      for(const suffix of name==="continuous"?["1","2"]:name==="arm-nma"?[""]:[]){
        const sdKey=suffix?"sd"+suffix+"i":"sd",nKey=suffix?"n"+suffix+"i":"n";
        if(!present(r[sdKey])&&present(r["se"+suffix]))r[sdKey]=log(sdFromSE({se:r["se"+suffix],n:r[nKey]}),"SD estimated from SE");
        if(!present(r[sdKey])&&present(r["lo"+suffix])&&present(r["hi"+suffix]))r[sdKey]=log(sdFromCI({lo:r["lo"+suffix],hi:r["hi"+suffix],n:r[nKey],level:r.level}),"SD estimated from mean CI");
      }
      if(present(r.median)&&!pending.some(q=>/^median_/.test(q.kind))){
        try{
          const out=fivenumChoice({min:r.min,q1:r.q1,median:r.median,q3:r.q3,max:r.max,n:r.n||r.ni||r.n1i,...fivenumOption},i,ask);
          log(out,"Mean and SD estimated from five-number summary"+fivenumNote);
          r[name==="continuous"?"m1i":"mean"]=out.mean;r[name==="continuous"?"sd1i":"sd"]=out.sd;
        }catch(e){flags.push(flag("fivenum-invalid",e.message,true,{row:i}));}
      }
      const required=name==="arm-nma"?["study","treatment","n",...(present(r.mean)?["mean","sd"]:["events"])]:fields;
      required.forEach(k=>{if(!present(r[k])||r[k]==="")flags.push(flag("missing-field",`${r.study}: the ${FIELD_LABELS[k]||k} is required; raw inputs cannot be inferred from an effect estimate`,true,{row:i,field:k}));});
      records.push(r);
    });
    flags.push(...sanity(records,schema));
    for(const f of flags.filter(f=>f.action==="swap-ci")){
      const id=`swap-ci:${f.row}`,q=question(id,`${records[f.row].study}: swap the lower and upper CI bounds?`,["swap","keep"]);
      ask(q);
    }
    for(const f of flags.filter(f=>f.action==="swap-columns"))ask(question("swap-columns:"+f.fields.join(":"),`Swap the ${FIELD_LABELS[f.fields[0]]||f.fields[0]} and ${FIELD_LABELS[f.fields[1]]||f.fields[1]} columns for all rows?`,["swap","keep"]));
    // Swap source cells/mappings and rerun conversions, never stale derived values.
    let rerun=false;const rows=table.rows.map(r=>r.slice()),nextMap={...map},nextAnswers={...answers};
    const detectionQuestions=detectionObject?mapping.questions||[]:mapping?[]:detected.questions;
    for(const q of questions){
      if(answers[q.id]!=="swap")continue;
      if(q.id.startsWith("swap-columns:")){
        const [,a,b]=q.id.split(":");
        Object.keys(nextMap).forEach(k=>{if(nextMap[k]===a)nextMap[k]=b;else if(nextMap[k]===b)nextMap[k]=a;});rerun=true;delete nextAnswers[q.id];
        Object.keys(nextAnswers).filter(k=>k.startsWith("column:")).forEach(k=>{if(nextAnswers[k]===a)nextAnswers[k]=b;else if(nextAnswers[k]===b)nextAnswers[k]=a;});
      }else if(q.id.startsWith("swap-ci:")){
        const i=+q.id.split(":")[1],l=Object.keys(map).find(k=>map[k]==="lo"),h=Object.keys(map).find(k=>map[k]==="hi");
        if(l!==undefined&&h!==undefined){[rows[i][l],rows[i][h]]=[rows[i][h],rows[i][l]];rerun=true;delete nextAnswers[q.id];}
        else {
          const col=Object.keys(map).find(k=>["yi","est","ci_bounds"].includes(map[k])&&["ci","est_ci"].includes(parseCell(rows[i][k],{header:(table.header||[])[k]}).kind));
          if(col!==undefined){
            const token=parseCell(rows[i][col],{header:(table.header||[])[col]});
            rows[i][col]=(present(token.est)?`${token.est}; `:"")+`${(token.level||.95)*100}% CI ${token.hi} to ${token.lo}`;
            rerun=true;delete nextAnswers[q.id];
          }
        }
      }
    }
    if(rerun){
      // Rerun with the detection object so unanswered column questions survive (and still block).
      const out=convert({...table,rows},{mapping:nextMap,questions:detectionQuestions},schema,nextAnswers);
      out.steps.unshift({text:"User confirmed swapping source columns or CI bounds",method:"user-confirmed swap",citation:"User confirmation",inputs:{},flags:[]});
      return out;
    }
    const unresolved=questions.filter(q=>!q.choices.includes(answers[q.id]));
    unresolved.forEach(q=>flags.push(flag("unanswered-question",q.text,true,{questionId:q.id})));
    return {records,steps,flags,questions};
  }
  // Normalise a working copy, retaining UTF-16 source boundaries for every character.
  // Tags are never evaluated. Table structure survives as tabs/newlines.
  function sourceMap(text) {
    let value="";const starts=[],ends=[];
    const re=/<\/?[a-z][^>]*>|&(?:#x[\da-f]+|#\d+|nbsp|thinsp|minus|ndash|mdash|middot|amp|lt|gt);|\u00c3[\u0082\u201a]\u00c2\u00a0|\u00c2\u00a0|\u00c3[\u0082\u201a][ \u00a0]|[\s\S]/gi;
    for(const m of text.matchAll(re)){
      let s=m[0];
      if(s[0]==="<"&&s.length>1)s=/^<\/tr\b/i.test(s)?"\n":/^<\/(?:td|th)\b|^<(?:td|th)\b[^>]*\/>/i.test(s)?"\t":"";
      else if(s[0]==="&"){
        const name=s.slice(1,-1).toLowerCase(),entities={nbsp:" ",thinsp:" ",minus:"-",ndash:"-",mdash:"-",middot:".",amp:"&",lt:"<",gt:">"};
        const code=name.startsWith("#x")?parseInt(name.slice(2),16):name[0]==="#"?parseInt(name.slice(1),10):null;
        s=code!==null&&code<=0x10ffff?String.fromCodePoint(code):entities[name]||s;
      }else if(s.length>1)s=" ";
      s=s.replace(/[\u2212\u2010-\u2015]/g,"-").replace(/[\u00b7\u22c5]/g,".").replace(/[\u00a0\u2000-\u200b\u202f]/g," ").replace(/[０-９]/g,c=>String(c.charCodeAt(0)-0xff10));
      value+=s;for(let i=0;i<s.length;i++){starts.push(m.index);ends.push(m.index+m[0].length);}
    }
    return {value,map:[...starts,text.length],span:(a,b)=>[starts[a],ends[b-1]]};
  }
  function normalize(original){const m=sourceMap(String(original));return {text:m.value,map:m.map};}
  const printedNumber=(s,decimal)=>Number(String(s).trim().replace(/[０-９]/g,c=>String(c.charCodeAt(0)-0xff10)).replace(/[\u2212\u2010-\u2015]/g,"-").replace(/[\u00b7\u22c5]/g,".").replace(/,/g,decimal==="comma"?".":""));
  function selectors(text,span){
    const [start,end]=span;
    return [{type:"TextPositionSelector",start,end},{type:"TextQuoteSelector",exact:text.slice(start,end),prefix:text.slice(Math.max(0,start-32),start),suffix:text.slice(end,end+32)}];
  }
  function anchor(text,selector){
    const p=selector.find(s=>s.type==="TextPositionSelector"),q=selector.find(s=>s.type==="TextQuoteSelector");
    if(p&&Number.isInteger(p.start)&&Number.isInteger(p.end)&&p.start>=0&&p.end>p.start&&p.end<=text.length&&(!q||text.slice(p.start,p.end)===q.exact))return [p.start,p.end];
    if(!q||!q.exact)return null;
    // Whitespace folding retains a source map; quote/context matching never picks
    // between equally plausible repeated quotations.
    const fold=s=>{let value="";const starts=[],ends=[];for(const m of s.matchAll(/\s+|[^\s]/gu)){value+=/^\s/.test(m[0])?" ":m[0];for(let i=0;i<(/^\s/.test(m[0])?1:m[0].length);i++){starts.push(m.index);ends.push(m.index+m[0].length);}}return {value,starts,ends};};
    const f=fold(text),exact=fold(q.exact).value,prefix=fold(q.prefix||"").value,suffix=fold(q.suffix||"").value,hits=[];
    for(let at=f.value.indexOf(exact);at>=0;at=f.value.indexOf(exact,at+1)){
      const before=f.value.slice(Math.max(0,at-prefix.length),at),after=f.value.slice(at+exact.length,at+exact.length+suffix.length);
      const score=(prefix&&before===prefix?1:0)+(suffix&&after===suffix?1:0);
      hits.push({span:[f.starts[at],f.ends[at+exact.length-1]],score});
    }
    hits.sort((a,b)=>b.score-a.score);
    return hits.length&&(!hits[1]||hits[0].score>hits[1].score)?hits[0].span:null;
  }
  defineRule("R-FACET-TIME","facet",/\b(?:at\s+)?(?:\d+(?:\.\d+)?[- ](?:days?|weeks?|months?|years?)|(?:day|week|month|year)\s+\d+(?:\.\d+)?)\b/gi,"Printed timepoint");
  defineRule("R-FACET-ANALYSIS","facet",/\b(?:ITT|intention[- ]to[- ]treat|per[- ]protocol|as[- ]treated)\b/gi,"Analysis population");
  defineRule("R-FACET-ADJUSTMENT","facet",/\b(?:unadjusted|adjusted)\b/gi,"Adjustment status");
  defineRule("R-FACET-PHASE","facet",/\b(?:baseline|follow[- ]up|change(?:\s+from\s+baseline)?)\b/gi,"Baseline, follow-up or change");
  defineRule("R-FACET-ARM","facet",/\b(?:in the|in|for)\s+([a-z][a-z0-9 -]{0,40}?)\s+(?:arm|group)\b/gi,"Printed arm label");
  const facetRules={timepoint:"R-FACET-TIME",analysisSet:"R-FACET-ANALYSIS",adjustment:"R-FACET-ADJUSTMENT",phase:"R-FACET-PHASE",arm:"R-FACET-ARM"};
  function facetCues(text){
    const mapped=sourceMap(text),out={};
    for(const [key,id] of Object.entries(facetRules))out[key]=[...mapped.value.matchAll(ruleRegex(id))].map(m=>{
      let value=m[0].toLowerCase().replace(/^at\s+/,"").replace(/-/g," ");
      if(key==="analysisSet")value=/itt|intention/.test(value)?"ITT":/per/.test(value)?"per-protocol":"other";
      if(key==="phase")value=value.startsWith("change")?"change":value==="baseline"?"baseline":"follow-up";
      if(key==="arm")value=m[1];
      const span=mapped.span(m.index,m.index+m[0].length);
      return {value,text:text.slice(...span),span,rule:ruleRef(id)};
    });
    return out;
  }
  function decorateCandidates(text,candidates,questions,opts){
    const cues=facetCues(text);
    const outcomeWords=[...new Set((opts.outcome||"").toLowerCase().match(/[a-z]{3,}/g)||[])].filter(w=>!["the","and","with","for","from"].includes(w));
    for(const c of candidates){
      const spans=Object.values(c.spans),start=Math.min(...spans.map(p=>p[0])),end=Math.max(...spans.map(p=>p[1]));
      c.rule=ruleRef(c.ruleId);c.rulesVersion=RULES_VERSION;c.decimal=opts.decimal||"point";
      c.selectors={};c.facets={};c.valueFacets={};c.facetEvidence={};
      // Prefer preceding cues within the current clause; permit a following cue
      // only when no earlier result intervenes.
      const nearest=(key,pos)=>{
        const possible=cues[key].filter(e=>Math.abs(e.span[0]-pos)<=150&&!/[;.!?]\s/.test(text.slice(Math.min(e.span[1],pos),Math.max(e.span[0],pos))));
        return possible.filter(e=>e.span[0]<=pos).at(-1)||possible.find(e=>!candidates.some(other=>other!==c&&Object.values(other.spans).some(p=>p[0]>pos&&p[0]<e.span[0])));
      };
      for(const key of Object.keys(facetRules)){
        const e=nearest(key,start);c.facets[key]=e?e.value:"unknown";c.facetEvidence[key]=e?[e]:[];
      }
      for(const [key,span] of Object.entries(c.spans)){
        c.selectors[key]=selectors(text,span);c.valueFacets[key]={};
        for(const facet of Object.keys(facetRules)){
          const e=nearest(facet,span[0]);c.valueFacets[key][facet]={value:e?e.value:"unknown",evidence:e?[e]:[]};
        }
      }
      if(c.kind==="counts"){
        // Arm words belong to THE number they sit next to: a printed label, else the nearest arm phrase in the
        // same clause with no other printed result between the phrase and this number (never the first cue).
        const others=candidates.flatMap(o=>Object.values(o.spans));
        c.armCues=c.values.arms.map(a=>{
          if(a.label)return {value:a.label.toLowerCase(),text:a.label,source:"printed label"};
          const from=a.span.events[0],to=a.span.n[1];
          const clear=(x,y)=>!/[;.!?]\s/.test(text.slice(x,y))&&!others.some(p=>p[0]>=x&&p[0]<y&&!(p[0]>=from&&p[0]<to));
          const before=cues.arm.filter(e=>e.span[1]<=from&&from-e.span[1]<=150&&clear(e.span[1],from)).at(-1);
          const after=cues.arm.find(e=>e.span[0]>=to&&e.span[0]-to<=150&&clear(to,e.span[0]));
          const e=before||after;
          return e?{value:e.value.toLowerCase(),text:e.text,span:e.span.slice(),rule:e.rule,source:"nearby words"}:null;
        });
        c.values.arms.forEach((a,i)=>{for(const field of ["events","n"])c.valueFacets["arms."+i+"."+field].arm=c.armCues[i]?{value:c.armCues[i].value,evidence:[c.armCues[i]]}:{value:"unknown",evidence:[]};});
        // Raw counts carry no adjustment or baseline/follow-up phase; the denominator is asked in plain words.
        c.facets.arm="unknown";c.facetEvidence.arm=[];
        for(const key of ["adjustment","phase"]){delete c.facets[key];delete c.facetEvidence[key];for(const v of Object.values(c.valueFacets))delete v[key];}
      }
      c.sanity=(c.sanity||[]).slice();
      if(c.kind==="effect_ci"){
        const v=c.values,t=k=>text.slice(...c.spans[k]);
        if(v.lo>v.hi)c.sanity.push(flag("CI_ORDER",`Found ${t("lo")} to ${t("hi")} — the lower limit is above the upper limit; check the paper`,true));
        else if(v.effect<v.lo||v.effect>v.hi)c.sanity.push(flag("ESTIMATE_OUTSIDE_CI",`Found ${t("effect")} (${t("lo")} to ${t("hi")}) — the estimate lies outside its interval; check the paper`,true));
      }
      c.flagged=c.sanity.length>0;
      c.reportedPercentages=c.kind==="counts"?c.values.arms.flatMap((a,arm)=>a.pctSpan?[{arm,value:a.pct,span:a.pctSpan,text:text.slice(...a.pctSpan),selector:selectors(text,a.pctSpan),facets:c.valueFacets["arms."+arm+".events"]}]:[]):[];
      const local=text.slice(Math.max(0,start-250),Math.min(text.length,end+70)).toLowerCase();
      c.score=0;c.reasons=[];
      const add=(score,reason)=>{c.score+=score;c.reasons.push({score,reason});};
      if(c.measure)add(3,"Named effect measure beside the estimate");
      if(/\bci\b|confidence interval/i.test(c.cue))add(2,"Confidence interval cue");
      if(c.kind==="counts"&&c.values.arms.some(a=>a.label))add(2,"Printed arm words");
      for(const word of outcomeWords){
        const at=local.lastIndexOf(word,Math.min(local.length,250));
        if(at>=0)add(1+1/(1+Math.abs(Math.min(start,250)-at)/50),"Nearby outcome word: "+word);
      }
      c.flags=consistency(c.kind==="effect_ci"?{est:c.values.effect,...c.values,ratio:["RR","OR","HR","IRR"].includes(c.measure),level:c.level,p:c.p}:c.values,opts);
      c.requiredFacets=[];
    }
    for(const key of ["timepoint","analysisSet","adjustment","phase"]){
      const choices=[...new Set(cues[key].map(e=>e.value))];
      const needing=candidates.filter(c=>c.kind!=="counts"||key==="timepoint");
      if(choices.length>1&&needing.length){
        questions.push({id:"facet:"+key,facet:key,text:"Choose the "+key+" for this result.",choices});
        needing.forEach(c=>c.requiredFacets.push({key,choices}));
      }
    }
    candidates.sort((a,b)=>(a.flagged?1:0)-(b.flagged?1:0)||b.score-a.score||Math.min(...Object.values(a.spans).map(p=>p[0]))-Math.min(...Object.values(b.spans).map(p=>p[0])));
  }
  function fivenumChoice(args,row,ask){
    const out=convertFivenum(args);
    if(!out.flags.some(f=>f.code==="fivenum-skew"))return out;
    const answer=ask(question("skew:"+row,"data look skewed; the mean/SD estimate may be unreliable. Convert anyway?",["convert anyway","keep unconverted"]));
    return answer==="convert anyway"?convertFivenum({...args,test:false}):out;
  }
  function consistency(r,opts={}){
    const warnings=[...sanityRules.asymmetry(r)];
    const p=r.p,est=present(r.est)?r.est:r.effect;
    if(p&&typeof p==="object"&&p.op!=="="&&validCI(r)&&finite(est)){
      const se=seFromCI(r).value,e=r.ratio?Math.log(est):est,pci=2*normalTail(Math.abs(e)/se);
      const violated=p.op==="<"?pci>=p.value:p.op==="≤"?pci>p.value:p.op===">"?pci<=p.value:p.op==="≥"?pci<p.value:false;
      if(violated)warnings.push(flag("P_CI_BOUND","The p-value bound is inconsistent with the confidence interval (Altman & Bland 2011)"));
    }else warnings.push(...sanityRules.p({...r,est}));
    const counts=r.arms||[r];
    for(const a of counts){
      if(finite(a.events)&&a.n>0&&finite(a.pct)){
        const digits=a.pctText!==undefined?(String(a.pctText).split(/[.,·⋅]/)[1]||"").length:(a.pctDigits||0);
        if(Math.abs(100*a.events/a.n-a.pct)>.5*10**-digits+1e-12)warnings.push(flag("PERCENT_MISMATCH","The events/total do not agree with the reported percentage at its printed precision"));
      }
    }
    const ordered=["min","q1","median","q3","max"].map(k=>r[k]).filter(finite);
    if(ordered.some((v,i)=>i&&v<ordered[i-1]))warnings.push(flag("QUARTILE_ORDER","Check quartile order: min <= q1 <= median <= q3 <= max"));
    if(opts.integerScale||r.integerScale)for(const m of [r,{mean:r.m1i,n:r.n1i,meanText:r.m1iText},{mean:r.m2i,n:r.n2i,meanText:r.m2iText}]){
      if(!finite(m.mean)||!Number.isInteger(m.n)||m.n<=0)continue;
      const unit=m.meanText!==undefined?10**-(String(m.meanText).split(/[.,·⋅]/)[1]||"").length:10**-(m.meanDigits===undefined?2:m.meanDigits);
      const lo=(m.mean-unit/2)*m.n,hi=(m.mean+unit/2)*m.n;
      if(Math.ceil(lo-1e-12)>Math.floor(hi+1e-12))warnings.push(flag("GRIM","This rounded mean is incompatible with integer-scored items and the stated sample size"));
    }
    return warnings;
  }
  const conversionFunctions={seFromCI,seFromP,estFromCI,sdFromSE,sdFromCI,eventsFromPercent,convertFivenum,designEffect,clusterCounts,clusterSE,logRatio:a=>({value:Math.log(a.effect)})};
  function replay(log){
    const equal=(a,b)=>a&&b&&typeof a==="object"&&typeof b==="object"?Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>equal(a[k],b[k])):a===b;
    const results=log.map((entry,index)=>{
      try{
        if(entry.rulesVersion!==RULES_VERSION)throw new Error("Rules version mismatch");
        if(!Object.prototype.hasOwnProperty.call(conversionFunctions,entry.fn))throw new Error("Unknown conversion");
        const out=conversionFunctions[entry.fn](entry.args),value=out.values||out.value;
        const ok=equal(value,entry.result)&&(!("output" in entry)||equal(entry.output,value));
        return {index,ok,result:value,...(!ok?{error:"Conversion result does not replay exactly"}:{})};
      }catch(e){return {index,ok:false,error:e.message};}
    });
    return {ok:results.every(r=>r.ok),results};
  }
  const numberPattern="[-+]?(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?|\\.\\d+)";
  const measurePattern="standard(?:ized|ised) mean difference|incidence rate ratio|relative risk|risk ratio|odds ratio|hazard ratio|rate ratio|mean difference|risk difference|difference in risk|difference|SMD|IRR|RR|OR|HR|MD|RD";
  function measures(s){
    s=s.toLowerCase();
    if(s==="rate ratio")return ["RR","IRR"]; // Both usages occur in reports; ask, never choose.
    if(/standard|^smd$/.test(s))return ["SMD"];
    if(/incidence|^irr$/.test(s))return ["IRR"];
    if(/hazard|^hr$/.test(s))return ["HR"];
    if(/odds|^or$/.test(s))return ["OR"];
    if(/risk difference|difference in risk|^rd$/.test(s))return ["RD"];
    if(/difference|^md$/.test(s))return ["MD"];
    return ["RR"];
  }
  const ci="(?:(?<level>\\d{2}(?:\\.\\d+)?)\\s*%\\s*)?(?:confidence\\s+interval(?:\\s*\\[CI\\])?|CI)\\s*(?:of\\s*)?[,:=\\s]*[\\[(]?\\s*";
  const bounds=`(?<lo>${numberPattern})\\s*(?:-|to|,|;)\\s*(?<hi>${numberPattern})(?![\\d.])`;
  const lead=`\\b(?<measure>${measurePattern})\\b(?:\\s*\\((?:HR|RR|OR|MD|SMD|IRR|RD)\\))?(?:\\s+(?:with|in)\\s+[^;,()[\\]\\n]{1,65}?)?\\s*(?:was|of|is)?\\s*[:,=]?\\s*(?<effect>${numberPattern})(?![\\d.])`;
  const bridge="\\s*(?:percentage points|percent|days|points|%)?\\s*[,;]?\\s*[\\[(]?\\s*(?:with\\s+(?:a\\s+)?)?";
    const pct="(?:\\s*(?:patients|participants|events)?\\s*[\\[(]\\s*(?<pct>\\d+(?:\\.\\d+)?)\\s*%\\s*[\\])])?";
  defineRule("R-EFFECT-CI","extract",new RegExp(lead+bridge+"(?:"+ci+"|[\\[(]\\s*)"+bounds,"gdi"),"re source grammar");
  defineRule("R-EFFECT-BARE","extract",new RegExp(`(?<![\\w.])(?<effect>${numberPattern})(?![\\d.%])\\s*[,;]?\\s*[\\[(]?\\s*${ci}${bounds}`,"gdi"),"reBare source grammar");
  defineRule("R-COUNTS-DIRECT","extract",new RegExp(`(?<![\\w./])(?<events>\\d+(?:,\\d{3})*)${pct}\\s*(?:of\\s+(?:the\\s+)?|/)\\s*(?<n>\\d+(?:,\\d{3})*)(?!\\d|/|\\.\\d)(?:\\s*[\\[(]\\s*(?<afterpct>\\d+(?:\\.\\d+)?)\\s*%\\s*[\\])])?`,"gd"),"Printed event/total with an optional reported percentage");
  defineRule("R-COUNTS-PERCENT","extract",new RegExp(`(?<![\\w.])(?<events>\\d+(?:,\\d{3})*)\\s*(?:patients|participants|events)?\\s*[\\[(]\\s*(?<pct>\\d+(?:\\.\\d+)?)\\s*%?\\s*[\\])]`,"gd"),"np source grammar");
  defineRule("R-MEAN-SD","mean_sd",new RegExp(`\\bmean\\s*[:=]?\\s*(?<mean>${numberPattern})\\s*(?:\\(\\s*SD\\s*[:=]?\\s*|[,;]\\s*SD\\s*[:=]?\\s*|±\\s*(?:SD\\s*)?)(?<sd>${numberPattern})`,"gdi"),"Explicit mean_sd summary");
  defineRule("R-MEDIAN-IQR","median_iqr",new RegExp(`\\bmedian\\s*[:=]?\\s*(?<median>${numberPattern})\\s*[,;]?\\s*[\\[(]?\\s*IQR\\s*[:=]?\\s*(?<q1>${numberPattern})\\s*(?:-|to|,)\\s*(?<q3>${numberPattern})`,"gdi"),"Explicit median_iqr summary");
  defineRule("R-EXTRACT-CUE-01","context",/\d,$/,"R-EXTRACT-CUE cue 1");
  defineRule("R-EXTRACT-CUE-02","context",/^\s*(?:patients|participants|controls)?\s*(?:\([^)]*\)|\[[^\]]*\])?\s*(?:in the|assigned to|allocated to|receiving)\s+([a-z][a-z -]{0,60}?)(?:\s+group|\s+(?:died|and|had)|[,;.()]|$)/i,"R-EXTRACT-CUE cue 2");
  defineRule("R-EXTRACT-CUE-03","context",/^\s*\(([a-z][a-z0-9 -]{0,40})\)/i,"R-EXTRACT-CUE cue 3");
  defineRule("R-EXTRACT-CUE-04","context",/^\s*(?:mg|ml|years|days|months)\b/i,"R-EXTRACT-CUE cue 4");
  defineRule("R-EXTRACT-CUE-05","context",/\([^)]*\)|\[[^\]]*\]/g,"R-EXTRACT-CUE cue 5");
  defineRule("R-EXTRACT-CUE-06","context",/\bn\s*=\s*(?<n>\d+(?:,\d{3})*)/gdi,"R-EXTRACT-CUE cue 6");
  defineRule("R-EXTRACT-CUE-07","context",/[\n\t;.]/,"R-EXTRACT-CUE cue 7");
  defineRule("R-EXTRACT-CUE-08","context",/[ (]+$/,"R-EXTRACT-CUE cue 8");
  defineRule("R-EXTRACT-CUE-09","context",/[^\n]+/g,"R-EXTRACT-CUE cue 9");
  defineRule("R-EXTRACT-CUE-10","context",/[^\t]+?(?=\t|$)/g,"R-EXTRACT-CUE cue 10");
  defineRule("R-EXTRACT-CUE-11","context",/\S(?:(?! {2,}).)*?(?= {2,}|$)/g,"R-EXTRACT-CUE cue 11");
  defineRule("R-EXTRACT-CUE-12","context",/\bevents?\b/i,"R-EXTRACT-CUE cue 12");
  defineRule("R-EXTRACT-CUE-13","context",/\b(?:total|n)\b/i,"R-EXTRACT-CUE cue 13");
  defineRule("R-EXTRACT-CUE-14","context",/^\d+$/,"R-EXTRACT-CUE cue 14");
  defineRule("R-EXTRACT-CUE-15","context",/^\d+$/,"R-EXTRACT-CUE cue 15");
  defineRule("R-EXTRACT-CUE-16","context",/\bSD\b/i,"R-EXTRACT-CUE cue 16");
  defineRule("R-EXTRACT-CUE-17","context",/\d,\d/,"R-EXTRACT-CUE cue 17");
  defineRule("R-COUNTS-TABLE","counts",/\bevents?\b.*\b(?:total|n)\b/i,"Two explicitly labelled event/total columns");
  defineRule("R-DECIMAL-COMMA","context",/\d,\d/,"Potential decimal comma");
  defineRule("R-DECIMAL-REPLACE","context",/(\d),(?=\d)/g,"Explicit decimal-comma setting");
  defineRule("R-THOUSANDS-GROUP","context",/(?<=(?<![\d.,])\d{1,3}(?:,\d{3})*),(?=\d{3}(?:,\d{3})*(?!\d|,\d))/g,"Grouping comma inside a valid 1-3 digit + 3-digit-group number");
  defineRule("R-THOUSANDS-NUMBERS","span",new RegExp(`(?<![\\d.,])[+-]?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?(?![\\d,])|(?<![\\d.,])${NUM}`,"g"),"Source numeric token spans, digit grouping retained");
  defineRule("R-LIST-PAIR","context",new RegExp(`^${NUM}\\s*,\\s*${NUM}$`),"Bare comma-separated pair (two values, not an interval)");
  defineRule("R-BARE-EXCLUDE","context",/(?:\bp\s*[<=>]\s*|\b(?:day|age|dose|year)\s*(?:was|is|of|=|:)?\s*)$/i,"Exclude p-values, ages and doses from bare intervals");
  defineRule("R-ARM-BEFORE","context",/([a-z][a-z -]{0,50}?)\s*(?:group)?\s*[:,]\s*$/i,"Arm label before counts");
  defineRule("R-CLAUSE","context",/;|\n|\.\s+[A-Z]/,"Separate result clauses");
  defineRule("R-P-VALUE","p",new RegExp(`\\bp\\s*(?<op>[<>=≤≥])\\s*(?<p>${numberPattern})`,"gdi"),"Exact p-value or explicitly retained bound");
  function extract(text,schema,opts={}){
    text=String(text||"");const mapped=sourceMap(text),candidates=[],questions=[];
    const decimal=opts.decimal|| (ruleRegex("R-EXTRACT-CUE-17").test(mapped.value)?"ask":"point");
    const s=decimal==="comma"?mapped.value.replace(ruleRegex("R-DECIMAL-REPLACE"),"$1."):mapped.value;
    const requested=typeof schema==="object"?schema.name||schema.schema||schema.kind:schema;
    const wantCounts=!requested||["counts","binary2x2","proportion","arm-nma","dose","dta"].includes(requested);
    const wantEffects=!requested||["effect_ci","generic","contrast-nma","dose"].includes(requested);
    const capture=(m,k)=>{const [a,b]=m.indices.groups[k];return {value:printedNumber(m.groups[k]),span:mapped.span(a,b)};};
    const push=c=>{
      const entries=c.kind==="counts"?c.values.arms.flatMap((a,i)=>[["arms."+i+".events",a.events],["arms."+i+".n",a.n]]):Object.entries(c.values);
      // A number broken by markup is not a literal source-number span.
      if(entries.some(([k,v])=>!c.spans[k]||printedNumber(text.slice(...c.spans[k]),decimal)!==v||(decimal!=="comma"&&ruleRegex("R-EXTRACT-CUE-01").test(text.slice(Math.max(0,c.spans[k][0]-2),c.spans[k][0])))))return;
      if(!candidates.some(x=>JSON.stringify([x.kind,x.measure,x.spans])===JSON.stringify([c.kind,c.measure,c.spans])))candidates.push(c);
    };
    if(wantEffects){
      for(const m of s.matchAll(ruleRegex("R-EFFECT-CI"))){
        if(m.groups.measure==="or")continue; // Ordinary English conjunction, not an OR label.
        const values={},spans={};for(const k of ["effect","lo","hi"]){const n=capture(m,k);values[k]=n.value;spans[k]=n.span;}
        for(const measure of measures(m.groups.measure))push({ruleId:"R-EFFECT-CI",kind:"effect_ci",measure,values:{...values},level:m.groups.level?+m.groups.level/100:.95,spans:{...spans},cue:text.slice(...mapped.span(m.index,m.index+m[0].length))});
      }
      // Explicit CI without a named measure. Never consume a preceding percentage or p value.
      for(const m of s.matchAll(ruleRegex("R-EFFECT-BARE"))){
        const values={},spans={};for(const k of ["effect","lo","hi"]){const n=capture(m,k);values[k]=n.value;spans[k]=n.span;}
        if(candidates.some(c=>c.spans.effect&&c.spans.effect[0]===spans.effect[0]))continue;
        if(ruleRegex("R-BARE-EXCLUDE").test(s.slice(Math.max(0,m.index-25),m.index)))continue;
        push({ruleId:"R-EFFECT-BARE",kind:"effect_ci",values,level:m.groups.level?+m.groups.level/100:.95,spans,cue:text.slice(...mapped.span(m.index,m.index+m[0].length))});
      }
    }
    if(wantCounts){
      const labelAt=(start,end)=>{
        const after=s.slice(end,end+170),before=s.slice(Math.max(0,start-90),start);
        const a=after.match(ruleRegex("R-EXTRACT-CUE-02"));
        const b=before.match(ruleRegex("R-ARM-BEFORE"));
        const c=after.match(ruleRegex("R-EXTRACT-CUE-03"));
        return (a&&a[1]||c&&c[1]||b&&b[1]||"").trim();
      };
      const pair=(arms,cue,extra={})=>{
        const spans={};arms.forEach((a,i)=>{spans["arms."+i+".events"]=a.span.events;spans["arms."+i+".n"]=a.span.n;});
        const sanity=arms.flatMap((a,arm)=>(a.sanity||[]).map(text=>flag("COUNTS_IMPOSSIBLE",text,true,{arm})));
        push({ruleId:extra.ruleId||"R-COUNTS-DIRECT",kind:"counts",values:{arms:arms.map(({sanity,...a})=>({...a}))},spans,cue,sanity,...extra});
      };
      const arms=[];
      for(const m of s.matchAll(ruleRegex("R-COUNTS-DIRECT"))){
        const e=capture(m,"events"),n=capture(m,"n");
        if(ruleRegex("R-EXTRACT-CUE-04").test(s.slice(m.index+m[0].length)))continue;
        // Impossible printed counts are SHOWN as flagged candidates (never silently skipped).
        const printed=text.slice(...e.span)+"/"+text.slice(...n.span);
        const sanity=n.value<=0?[`Found ${printed} — the total cannot be 0; check the paper`]:e.value>n.value?[`Found ${printed} — events cannot exceed the total; check the paper`]:[];
        const pctKey=m.groups.pct?"pct":m.groups.afterpct?"afterpct":null;
        arms.push({sanity,events:e.value,n:n.value,...(pctKey?{pct:+m.groups[pctKey],pctText:m.groups[pctKey],pctSpan:capture(m,pctKey).span}:{}),label:labelAt(m.index,m.index+m[0].length),span:{events:e.span,n:n.span},start:m.index,end:m.index+m[0].length});
      }
      // Separate explicit outcome clauses. Within an unsplit multi-arm clause, expose
      // every comparison in printed order rather than silently pairing adjacent arms.
      const groups=[];let group=[];
      for(const arm of arms){
        if(group.length){
          const gap=s.slice(group[group.length-1].end,arm.start).replace(ruleRegex("R-EXTRACT-CUE-05"),"");
          if(group.length>=2&&ruleRegex("R-CLAUSE").test(gap)){groups.push(group);group=[];}
        }
        group.push(arm);
      }
      if(group.length)groups.push(group);
      for(const as of groups){
        if(as.length===1)pair(as,text.slice(...mapped.span(as[0].start,as[0].end)));
        for(let i=0;i<as.length;i++)for(let j=i+1;j<as.length;j++)pair([as[i],as[j]],text.slice(...mapped.span(as[i].start,as[j].end)));
      }
      // Explicit denominators elsewhere in a report/table. Enumerate compatible assignments;
      // percentages corroborate printed counts, never reconstruct counts or denominators.
      const totals=[];
      for(const m of s.matchAll(ruleRegex("R-EXTRACT-CUE-06"))){
        const n=capture(m,"n");totals.push({n:n.value,span:n.span,label:s.slice(Math.max(0,m.index-65),m.index).split(ruleRegex("R-EXTRACT-CUE-07")).pop().replace(ruleRegex("R-EXTRACT-CUE-08"),"").trim()});
      }
      if(totals.length>=2){
        const events=[];
        for(const m of s.matchAll(ruleRegex("R-COUNTS-PERCENT"))){
          const e=capture(m,"events");
          if(arms.some(a=>a.span.events[0]===e.span[0]))continue;
          events.push({events:e.value,span:e.span,pct:+m.groups.pct,pctText:m.groups.pct,pctSpan:capture(m,"pct").span,digits:(m.groups.pct.split(".")[1]||"").length,start:m.index,end:m.index+m[0].length});
        }
        for(let i=0;i+1<events.length;i+=2){
          const es=events.slice(i,i+2);
          for(let a=0;a<totals.length;a++)for(let b=0;b<totals.length;b++){
            if(a===b)continue;
            const ts=[totals[a],totals[b]];
            if(es.some((e,j)=>e.events>ts[j].n))continue;
            const corroborated=es.every((e,j)=>Math.abs(100*e.events/ts[j].n-e.pct)<=.51*Math.pow(10,-e.digits));
            pair(es.map((e,j)=>({events:e.events,n:ts[j].n,pct:e.pct,pctText:e.pctText,pctSpan:e.pctSpan,pctDigits:e.digits,label:ts[j].label,span:{events:e.span,n:ts[j].span}})),text.slice(...mapped.span(es[0].start,es[1].end)),{ruleId:"R-COUNTS-PERCENT",assignmentRequired:true,percentagesCorroborate:corroborated});
          }
        }
      }
      // Tab/space tables with explicit events/total column names.
      const lines=[...s.matchAll(ruleRegex("R-EXTRACT-CUE-09"))];
      if(lines.length>1){
        const cells=line=>[...line[0].matchAll(ruleRegex("R-EXTRACT-CUE-10"))].flatMap(m=>{
          const parts=[...m[0].matchAll(ruleRegex("R-EXTRACT-CUE-11"))];
          return parts.map(p=>({text:p[0],start:line.index+m.index+p.index}));
        });
        const header=cells(lines[0]),ev=header.map((c,i)=>ruleRegex("R-EXTRACT-CUE-12").test(c.text)?i:-1).filter(i=>i>=0),ns=header.map((c,i)=>ruleRegex("R-EXTRACT-CUE-13").test(c.text)?i:-1).filter(i=>i>=0);
        if(ev.length===2&&ns.length===2)for(const line of lines.slice(1)){
          const cs=cells(line),as=[];
          for(let j=0;j<2;j++){
            const e=cs[ev[j]],n=cs[ns[j]];
            if(!e||!n||!ruleRegex("R-EXTRACT-CUE-14").test(e.text)||!ruleRegex("R-EXTRACT-CUE-15").test(n.text))break;
            as.push({events:+e.text,n:+n.text,label:header[ev[j]].text,span:{events:mapped.span(e.start,e.start+e.text.length),n:mapped.span(n.start,n.start+n.text.length)}});
          }
          if(as.length===2)pair(as,text.slice(...mapped.span(line.index,line.index+line[0].length)),{ruleId:"R-COUNTS-TABLE"});
        }
      }
    }
    if(!requested||["continuous","mean_sd","median_iqr"].includes(requested)){
      for(const [kind,ruleId] of [["mean_sd","R-MEAN-SD"],["median_iqr","R-MEDIAN-IQR"]])for(const m of s.matchAll(ruleRegex(ruleId))){
        const values={},spans={};for(const k of Object.keys(m.groups)){const n=capture(m,k);values[k]=n.value;spans[k]=n.span;}
        const ambiguous=kind==="mean_sd"&&!ruleRegex("R-EXTRACT-CUE-16").test(m[0]);
        push({ruleId,kind,values,spans,cue:text.slice(...mapped.span(m.index,m.index+m[0].length)),dispersion:ambiguous?null:"SD"});
        if(ambiguous)questions.push({id:"dispersion:"+m.index,text:"Is the spread a standard deviation (SD) or standard error (SE)?",choices:["SD","SE"]});
      }
    }
    const pValues=[...s.matchAll(ruleRegex("R-P-VALUE"))].map(m=>{const n=capture(m,"p");return {op:m.groups.op,value:n.value,span:n.span,text:text.slice(...n.span),selector:selectors(text,n.span),rule:ruleRef("R-P-VALUE")};});
    candidates.forEach(c=>{
      const end=Math.max(...Object.values(c.spans).map(p=>p[1]));
      const p=pValues.find(p=>p.span[0]>=end&&p.span[0]-end<80&&!candidates.some(x=>x!==c&&Object.values(x.spans).some(s=>s[0]>end&&s[0]<p.span[0])));
      if(p)c.p=p;
    });
    decorateCandidates(text,candidates,questions,{...opts,decimal});
    if(candidates.length>1)questions.push({id:"candidate",text:"Choose the result, outcome and timepoint to use. More than one candidate was found.",choices:candidates.map((c,i)=>({value:i,label:c.cue,measure:c.measure}))});
    if(candidates.some(c=>c.kind==="counts"))questions.push({id:"arms",text:"For each row, choose the printed arm and say what it is (intervention, control or other). Text order does not determine treatment.",choices:["first is treatment","second is treatment"]});
    if(candidates.some(c=>c.kind==="effect_ci"&&!c.measure))questions.push({id:"measure",text:"Which effect measure and scale does this interval describe?",choices:["RR","OR","HR","MD","SMD","IRR","RD"]});
    if(decimal==="ask")questions.push({id:"decimal",text:"Choose the decimal mark for this paste.",choices:["point","comma"]});
    return {candidates,questions,decimal,pValues,rulesVersion:RULES_VERSION};
  }
  let provenanceSerial=0;
  // Timepoint evidence for one result (or one printed arm): the cue next to the numbers first, then the rest.
  function timepointOptions(text,candidate,armIndex){
    const all=[...new Set(facetCues(String(text||"")).timepoint.map(e=>e.value))];
    const own=candidate&&(armIndex!==undefined&&candidate.valueFacets?.["arms."+armIndex+".events"]?candidate.valueFacets["arms."+armIndex+".events"].timepoint:{value:candidate.facets?.timepoint});
    const nearest=own&&own.value&&own.value!=="unknown"?own.value:null;
    return [...(nearest?[nearest]:[]),...all.filter(v=>v!==nearest)].map(value=>({value,where:value===nearest?"next":"elsewhere",label:value+(value===nearest?" — written next to these numbers":" — elsewhere in the paste")}));
  }
  // How every comma-between-digits number in a paste is read under a decimal setting (shown before extraction).
  function decimalPreview(text,decimal){
    const mapped=sourceMap(String(text||"")),out=[];
    for(const m of mapped.value.matchAll(/\d+(?:,\d+)+(?:\.\d+)?/g)){
      const span=mapped.span(m.index,m.index+m[0].length),printed=String(text).slice(...span),parts=m[0].split(",");
      const grouping=/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(m[0]),list=parts.length===2?parts.join(" and "):parts.slice(0,-1).join(", ")+" and "+parts.at(-1);
      const asComma=parts.length===2?parts.join("."):null,asOther=grouping?m[0].replace(/,/g,""):null;
      let read=null;
      if(decimal==="comma")read=asComma||"not a valid number";
      else if(decimal==="thousands")read=asOther||"not a valid thousands grouping";
      else if(decimal==="list"||decimal==="separator"||decimal==="point")read=decimal==="point"&&asOther?asOther:"two numbers, "+list;
      out.push({text:printed,span,read,
        message:read?`${printed} read as ${read} — correct?`:`${printed}: choose the decimal mark — with a decimal comma it reads ${asComma||"(not a number)"}; with a decimal point it reads ${asOther||"two numbers, "+list}`});
    }
    return out;
  }
  const SINGLE_GROUP_SCHEMAS=["proportion"];
  // Schemas whose paper-text extraction (extract + provenance rows) can fill every required app input.
  const PROVENANCE_SCHEMAS=["proportion","binary2x2","generic"];
  const DENOMINATOR_CHOICES={"ITT":"All randomised (ITT)","followed up":"Only those followed up","not stated":"Not stated"};
  const ROLE_NAMES={intervention:"Intervention",control:"Control",other:"Other"};
  // Arm words -> role. Control words are checked first ("treatment as usual" is a control).
  function armRoleOf(s){
    s=String(s||"");
    if(/\bTAU\b/.test(s)||/\b(?:placebo|usual care|treatment as usual|care as usual|controls?|sham|standard (?:of )?care|wait(?:ing)?[- ]?list|no treatment|comparator)\b/i.test(s))return "control";
    if(/\b(?:intervention|experimental|active treatment)\b/i.test(s))return "intervention";
    return null;
  }
  const normDoi=d=>String(d||"").trim().toLowerCase().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/,"");
  const normPmid=p=>String(p||"").replace(/\D/g,"");
  const normRef=r=>String(r||"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
  // DOI > PMID > normalised reference.
  function reportKey(rec,i){
    const doi=normDoi(rec.doi),pmid=normPmid(rec.pmid),ref=normRef(rec.reference);
    return doi?"doi:"+doi:pmid?"pmid:"+pmid:ref?"ref:"+ref:"row:"+i;
  }
  // Report of each row (index of its group's first row). Rows are one report when they share a DOI, or share a PMID
  // or a normalised reference with no conflicting stronger identifier (two different DOIs are two reports).
  function reportGroups(records){
    const ids=records.map(r=>({doi:normDoi(r.doi),pmid:normPmid(r.pmid),ref:normRef(r.reference)})),parent=records.map((_,i)=>i);
    const find=i=>parent[i]===i?i:(parent[i]=find(parent[i])),differ=(a,b,k)=>a[k]&&b[k]&&a[k]!==b[k];
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
      const a=ids[i],b=ids[j];
      const same=a.doi&&a.doi===b.doi||!differ(a,b,"doi")&&(a.pmid&&a.pmid===b.pmid||!differ(a,b,"pmid")&&a.ref&&a.ref===b.ref);
      if(same)parent[find(j)]=find(i);
    }
    return records.map((_,i)=>find(i));
  }
  // Printed arms a row uses: [{index, role, events, n, span}].
  function usedArms(rec){
    const c=rec.choice||{},pick=(i,role)=>{
      const ev=(rec.values||[]).find(v=>v.armIndex===i&&v.part==="events"),n=(rec.values||[]).find(v=>v.armIndex===i&&v.part==="n");
      return ev&&n?{index:i,role,events:ev.text,n:n.text,span:ev.span}:null;
    };
    if(rec.kind!=="counts")return [];
    if(c.armIndex!==undefined)return [pick(c.armIndex,c.role)].filter(Boolean);
    return [[c.treatmentIndex,"intervention"],[c.controlIndex,"control"]].filter(([i])=>i!==undefined).map(([i,r])=>pick(i,r)).filter(Boolean);
  }
  const clone=x=>JSON.parse(JSON.stringify(x));
  // Unit of randomisation (N1), structured source (N3), facets that may be stated as "not stated in source" (N5).
  const RANDOMISATION_CHOICES={individuals:"Individuals",clusters:"Clusters (e.g. practices)",crossover:"Crossover periods","not randomised":"Not randomised","not stated":"Not stated"};
  const ICC_SOURCES={"this paper":"This paper",external:"Another study (external)",assumed:"Assumed"};
  const SOURCE_TYPES=["Abstract","Table","Figure","Text","Supplement","Registry"];
  const ABSTRACT_NOTE="Abstracts often round values or differ from the full-text tables; check the full text if available.";
  const FACET_CHOICES={analysisSet:["ITT","per-protocol","other"],adjustment:["adjusted","unadjusted"],phase:["baseline","follow-up","change"]};
  const FACET_NAMES={timepoint:"Timepoint",analysisSet:"Analysis population",adjustment:"Adjustment",phase:"Type of value",randomisation:"Unit of randomisation",arm:"Arm"};
  const NOT_STATED="not stated";
  const CSV_KEYS=["id","label","reference","location","sourceType","sourceDetail","verifiedAgainst","doi","pmid","pastedText","decimal","rule","rulesVersion","candidateRank","candidateScore","facets","statements","armRole","armCue","denominator","timepoint","timepointEvidence","randomisation","design","outcomeDefinition","p","reportedPercentages","choice","values","conversions","flags","sameSourceOptIn","usedAs","confirmed","confirmedAt","confirmedBy","confirmedVia","sourceHash"];
  function parseLocation(location){
    const s=String(location||"").trim(),m=/^(abstract|table|fig(?:ure|\.)?|text|supplement(?:ary)?(?:\s+material)?|registry)\b[\s,:.-]*(.*)$/i.exec(s);
    if(m){const t=m[1].toLowerCase();return {type:t.startsWith("fig")?"Figure":t.startsWith("supp")?"Supplement":t[0].toUpperCase()+t.slice(1),detail:m[2].trim()};}
    if(/^(?:p\.|pp\.|page)\s*\d/i.test(s))return {type:"Text",detail:s};
    return {type:"",detail:s};
  }
  const clusterArgs=cl=>Object.fromEntries(["m","k","total","icc","designEffect"].filter(k=>present(cl[k])&&cl[k]!=="").map(k=>[k,+cl[k]]));
  const confirmVias=["row","bulk"];
  // Largest change in an arm's risk (absolute proportion) from rounding effective counts before a warning is shown.
  const CLUSTER_ROUNDING_TOLERANCE=0.02;
  function csvRows(text){
    const rows=[];let row=[],cell="",quoted=false;text=String(text).replace(/^﻿/,"");
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
      else if(c==='"')quoted=true;
      else if(c===","){row.push(cell);cell="";}
      else if(c==="\r"&&text[i+1]==="\n"||c==="\n"){row.push(cell);rows.push(row);row=[];cell="";if(c==="\r")i++;}
      else cell+=c;
    }
    if(cell!==""||row.length)row.push(cell),rows.push(row);
    return rows;
  }
  const provenance={
    create({pastedText="",label="",reference="",location="",source,doi="",pmid="",decimal="point"}={}){
      const src=source?clone(source):parseLocation(location);
      return {id:"entry-"+Date.now().toString(36)+"-"+(++provenanceSerial),label,reference,location:location||provenance.sourceLocation(src),source:src,doi,pmid,decimal,pastedText:String(pastedText),choice:{},values:[],conversions:[],flags:[],usedAs:"",confirmed:false,confirmedAt:null,confirmedBy:null,confirmedVia:null,sourceHash:null};
    },
    // "Table 2", "Supplement S4", "Abstract, Results paragraph".
    sourceLocation(source){
      const s=source||{},type=String(s.type||"").trim(),detail=String(s.detail||"").trim();
      return [type,detail].filter(Boolean).join(type&&detail&&/^[A-Za-z]?\d/.test(detail)?" ":", ");
    },
    fromCandidate(rec,candidate,choice={}){
      const out=clone(rec);out.choice=clone(choice);out.values=[];out.conversions=[];out.flags=[];out.confirmed=false;out.confirmedAt=null;
      out.confirmedBy=null;out.confirmedVia=null;out.sourceHash=null;delete out.confirmedAgainst;
      out.kind=candidate.kind;out.measure=choice.measure||candidate.measure;out.level=candidate.level;
      out.rule=candidate.rule;out.rulesVersion=candidate.rulesVersion;out.decimal=candidate.decimal||rec.decimal;
      out.requiredFacets=clone(candidate.requiredFacets||[]);out.facets=clone(candidate.facets||{});out.p=candidate.p?clone(candidate.p):undefined;
      out.reportedPercentages=clone(candidate.reportedPercentages||[]);
      out.flags.push(...clone(candidate.flags||[]));
      const add=(field,value,key)=>{const span=candidate.spans[key],arm=/^arms\.(\d+)\.(events|n)$/.exec(key);out.values.push({field,value,span:span&&span.slice(),text:span?out.pastedText.slice(...span):"",selector:span?selectors(out.pastedText,span):[],facets:clone(candidate.valueFacets?.[key]||{}),rule:candidate.rule,...(arm?{armIndex:+arm[1],part:arm[2]}:{})});};
      if(candidate.kind==="counts")candidate.values.arms.forEach((a,i)=>{
        const role=choice.treatmentIndex===i?"treatment":choice.controlIndex===i?"control":null;
        if(choice.armIndex!==undefined&&choice.armIndex!==i)return;
        add(choice.armIndex===i?"xi":role==="treatment"?"ai":role==="control"?"ci":"arm"+i+".events",a.events,"arms."+i+".events");
        add(choice.armIndex===i?"ni":role==="treatment"?"n1i":role==="control"?"n2i":"arm"+i+".n",a.n,"arms."+i+".n");
      });
      else Object.entries(candidate.values).forEach(([k,v])=>add(k,v,k));
      if(choice.timepoint)out.flags.push({code:"TIMEPOINT_CHOSEN",text:"Timepoint chosen: "+choice.timepoint});
      out.candidateScore=candidate.score;
      if(candidate.kind==="counts"){
        // The arm facet follows the user's role for the chosen printed arm; the printed cue is stored separately.
        const cues=candidate.armCues||[],roles={};
        if(choice.armIndex!==undefined)roles[choice.armIndex]=choice.role||"not chosen";
        else{if(choice.treatmentIndex!==undefined)roles[choice.treatmentIndex]="intervention";if(choice.controlIndex!==undefined)roles[choice.controlIndex]="control";}
        out.armCues=Object.keys(roles).map(i=>({index:+i,role:roles[i],cue:cues[i]?clone(cues[i]):null}));
        if(choice.armIndex!==undefined){out.armCue=cues[choice.armIndex]?clone(cues[choice.armIndex]):null;out.facets.arm=roles[choice.armIndex];}
        else out.facets.arm=out.armCues.length?out.armCues.map(a=>a.role+": printed arm "+(a.index+1)).join("; "):"not chosen";
        out.values.forEach(v=>{if(v.armIndex!==undefined&&roles[v.armIndex]!==undefined)v.facets.arm={value:roles[v.armIndex],evidence:cues[v.armIndex]?[clone(cues[v.armIndex])]:[]};});
        if(DENOMINATOR_CHOICES[choice.denominator])out.facets.analysisSet=choice.denominator;
        for(const f of candidate.sanity||[])if(choice.armIndex===undefined||f.arm===undefined||f.arm===choice.armIndex)out.flags.push(clone(f));
      }else for(const f of candidate.sanity||[])out.flags.push(clone(f));
      if(choice.timepoint){
        const options=timepointOptions(out.pastedText,candidate,choice.armIndex),nearest=options.find(o=>o.where==="next"),chosen=choice.timepoint;
        const where=nearest&&chosen===nearest.value?"next to the numbers":options.some(o=>o.value===chosen)?"elsewhere in the paste":chosen==="not stated"?"not stated":"typed by the user";
        out.timepointEvidence={chosen,nearest:nearest?nearest.value:null,where};
        if(nearest&&chosen!==nearest.value)out.flags.push({code:"TIMEPOINT_NOT_NEAREST",text:`The timepoint written next to these numbers is "${nearest.value}"; you chose "${chosen}". Check the paper.`,blocking:false});
      }
      // N5: a facet with no cue in the text is "unknown" until the user picks a value or "not stated" (a user statement).
      if(choice.timepoint)out.facets.timepoint=choice.timepoint;
      for(const [k,v] of Object.entries(choice.facets||{}))if(out.facets[k]==="unknown"&&typeof v==="string"&&v.trim())out.facets[k]=v.trim();
      out.statements=[];
      for(const [k,v] of [...Object.entries(out.facets),["randomisation",choice.randomisation]])if(v===NOT_STATED){
        out.statements.push({facet:k,value:"not stated in source",by:"user"});
        out.flags.push({code:"NOT_STATED_"+k.toUpperCase(),text:`${FACET_NAMES[k]||k}: not stated in the source (your statement).`,blocking:false});
      }
      provenance.applyDesign(out,candidate);
      return out;
    },
    // N1: unit of randomisation; clusters -> design-effect conversion (counts) or an explicit decline flag.
    applyDesign(out,candidate){
      const c=out.choice,unit=c.randomisation;
      out.design={randomisation:RANDOMISATION_CHOICES[unit]?unit:"not chosen"};
      if(unit==="crossover")out.flags.push({code:"CROSSOVER_DESIGN",text:"Crossover trial: these values are entered as if from parallel groups; a paired analysis is not done here (Cochrane Handbook v6.5 §23.2).",blocking:false});
      if(unit==="not randomised")out.flags.push({code:"NOT_RANDOMISED",text:"Not a randomised comparison: treat this row as non-randomised evidence.",blocking:false});
      if(unit!=="clusters")return out;
      const cl=clone(c.cluster||{}),args=clusterArgs(cl);out.design.cluster=cl;
      if(cl.action==="decline")out.flags.push({code:"CLUSTER_NOT_ADJUSTED",text:"Cluster-randomised trial not adjusted for clustering (no ICC or design effect applied); its confidence interval will be too narrow (Cochrane Handbook v6.5 §23.1.4).",blocking:false});
      if(cl.action==="already"&&out.kind!=="counts")out.flags.push({code:"CLUSTER_ANALYSIS_REPORTED",text:"Cluster-randomised trial: you stated that the reported analysis already accounts for clustering.",blocking:false});
      if(cl.action!=="adjust")return out;
      const de=designEffect(args);
      if(de.value===null){out.flags.push({code:"CLUSTER_INPUTS",text:"To adjust for clustering, give the mean cluster size (or the number of clusters and the total) and the ICC, or a design effect.",blocking:true});return out;}
      if(!ICC_SOURCES[cl.iccSource]){out.flags.push({code:"CLUSTER_INPUTS",text:"Give the source of the ICC or design effect (this paper, another study, or assumed).",blocking:true});return out;}
      out.design.designEffect=de.value;
      if(out.kind!=="counts")return out;
      const formula=present(args.designEffect)?"events / DE, total / DE (DE reported)":"events / DE, total / DE, DE = 1 + (M − 1) × ICC"+(present(args.m)?"":", M = total / clusters");
      const byArm={};for(const v of out.values)if(v.armIndex!==undefined)(byArm[v.armIndex]=byArm[v.armIndex]||{})[v.part]=v;
      for(const arm of Object.values(byArm)){
        if(!arm.events||!arm.n)continue;
        const r=clusterCounts({...args,events:arm.events.value,n:arm.n.value});
        if(!r.values){out.flags.push(...clone(r.flags));continue;}
        // DE from the Handbook (§23.1.4); rounding to whole numbers for entry is this tool's choice (the apps take counts), logged.
        const rounded={events:Math.round(r.values.events),n:Math.round(r.values.n)};
        out.conversions.push({field:arm.events.field+", "+arm.n.field,fields:{events:arm.events.field,n:arm.n.field},formula,citation:clusterSource,inputs:clone(r.inputs),output:clone(r.values),rounded,fn:"clusterCounts",args:clone(r.args),result:clone(r.values),rulesVersion:RULES_VERSION,iccSource:cl.iccSource});
        out.flags.push({code:"CLUSTER_COUNTS_ROUNDED",text:`Effective counts rounded to whole numbers for entry: ${arm.events.text} → ${+r.values.events.toFixed(2)} → ${rounded.events} events; ${arm.n.text} → ${+r.values.n.toFixed(2)} → ${rounded.n} total (DE: ${clusterSource}; rounding: this tool).`,blocking:false});
        const p0=arm.events.value/arm.n.value,p1=rounded.n>0?rounded.events/rounded.n:NaN,pct=p=>Number.isFinite(p)?(100*p).toFixed(1)+"%":"undefined";
        const cell=rounded.events===0&&arm.events.value>0?" and creates a zero cell":rounded.n>0&&rounded.events===rounded.n&&arm.events.value<arm.n.value?" and creates a cell with no non-events":"";
        if(cell||!(Math.abs(p1-p0)<=CLUSTER_ROUNDING_TOLERANCE))out.flags.push({code:"CLUSTER_ROUNDING_CHANGES_RISK",text:`Rounding the effective counts changes this arm's risk: ${arm.events.text} of ${arm.n.text} (${pct(p0)}) becomes ${rounded.events} of ${rounded.n} (${pct(p1)})${cell}. Check the effective counts before using this row.`,blocking:false});
      }
      return out;
    },
    // Values sent to the app after logged design-effect conversions, rounded for entry ({xi: 78, ni: 114});
    // {exact:true} gives the unrounded effective counts.
    adjusted(rec,{exact=false}={}){
      const out={};
      for(const c of rec.conversions||[])if(c.fn==="clusterCounts"&&c.fields&&c.output){const v=exact?c.output:c.rounded;out[c.fields.events]=v.events;out[c.fields.n]=v.n;}
      return out;
    },
    // N2: verbatim outcome definition; a span is kept only when it addresses the row's own pasted text.
    outcomeDefinition(rec,text,span){
      const t=String(text||"");
      if(!t.trim())return null;
      if(Array.isArray(span)&&rec.pastedText.slice(...span)===t)return {text:t,span:span.slice(),selector:selectors(rec.pastedText,span)};
      return {text:t};
    },
    // N4 + N6: who confirmed, how, and the SHA-256 of the row's OWN verbatim source. Each row keeps its own source:
    // the paste box (which may hold the next paper) is never hashed into a row's provenance.
    confirm(rec,{by,via="row",at}={}){
      const initials=String(by||"").trim();
      if(!initials)throw new Error("Confirmation needs the extractor's initials");
      if(!confirmVias.includes(via))throw new Error("confirmedVia must be 'row' or 'bulk'");
      rec.confirmed=true;rec.confirmedAt=at||new Date().toISOString();rec.confirmedBy=initials;rec.confirmedVia=via;
      rec.sourceHash=sha256(rec.pastedText);rec.confirmedAgainst=rec.sourceHash;
      return rec;
    },
    unconfirm(rec){rec.confirmed=false;rec.confirmedAt=null;rec.confirmedBy=null;rec.confirmedVia=null;rec.sourceHash=null;delete rec.confirmedAgainst;return rec;},
    // True only when the row's own stored source no longer matches the hash taken at confirmation.
    sourceChanged(rec){return !!(rec.confirmed&&rec.sourceHash&&sha256(String(rec.pastedText))!==rec.sourceHash);},
    // Methods sentences for design flags (cluster adjustment, crossover, non-randomised, not-stated design).
    methods(records){
      const n=code=>records.filter(r=>(r.flags||[]).some(f=>f.code===code)).length,out=[];
      const adjustedRows=records.filter(r=>(r.conversions||[]).some(c=>c.fn==="clusterCounts"||c.fn==="clusterSE")),adjusted=adjustedRows.length;
      const was=k=>k===1?"was":"were";
      // Per row: a design effect reported in the paper (or taken from elsewhere), or computed from M and the ICC, with the ICC source.
      const deWords={"this paper":"reported in the paper",external:"taken from another study",assumed:"assumed"},iccWords={"this paper":"from this paper",external:"from another study",assumed:"assumed"};
      const how=r=>{
        const cl=r.design?.cluster||r.choice?.cluster||{},de=r.design?.designEffect,who=r.label||"[no label]",num=x=>+(+x).toFixed(3);
        if(present(cl.designEffect)&&cl.designEffect!=="")return `${who}: design effect ${deWords[cl.iccSource]||"of unstated source"} (${num(cl.designEffect)})`;
        return `${who}: design effect 1 + (M − 1) × ICC = ${Number.isFinite(de)?num(de):"?"}, ICC ${iccWords[cl.iccSource]||"of unstated source"} (${num(cl.icc)})`;
      };
      if(adjusted)out.push(`Counts or standard errors from ${plural(adjusted,"row")} of cluster-randomised trials ${was(adjusted)} adjusted with a design effect (Cochrane Handbook v6.5 §23.1.4): ${adjustedRows.map(how).join("; ")}.`);
      const not=n("CLUSTER_NOT_ADJUSTED");
      if(not)out.push(`${plural(not,"row")} from a cluster-randomised trial ${was(not)} not adjusted for clustering (flag CLUSTER_NOT_ADJUSTED); ${not===1?"its confidence interval is":"their confidence intervals are"} too narrow.`);
      const rep=n("CLUSTER_ANALYSIS_REPORTED");if(rep)out.push(`For ${plural(rep,"row")} from cluster-randomised trials the reported analysis accounted for clustering (extractor's statement).`);
      const cross=n("CROSSOVER_DESIGN");if(cross)out.push(`${plural(cross,"row")} from crossover trials ${was(cross)} entered as parallel-group data.`);
      const nr=n("NOT_RANDOMISED");if(nr)out.push(`${plural(nr,"row")} ${was(nr)} not from a randomised comparison.`);
      const ns=n("NOT_STATED_RANDOMISATION");if(ns)out.push(`The unit of randomisation was not stated for ${plural(ns,"row")}.`);
      return out;
    },
    applyConversion(rec,conversionResult){
      const out=clone(rec),r=conversionResult;
      const fn=r.fn||(r.method==="log ratio"?"logRatio":/SD.*SE.*sqrt/.test(r.formula||"")?"sdFromSE":undefined);
      const output=r.output===undefined?(r.values||r.value):r.output;
      out.conversions.push({field:r.field||"",formula:r.formula||r.method,citation:r.citation,inputs:clone(r.inputs||{}),output,fn,args:clone(r.args||r.inputs||{}),result:output,rulesVersion:RULES_VERSION});
      out.flags.push(...clone(r.flags||(r.flag?[r.flag]:[])));out.confirmed=false;out.confirmedAt=null;return out;
    },
    sentence(rec){
      const names={ai:"events (treatment)",n1i:"total (treatment)",ci:"events (control)",n2i:"total (control)",effect:"effect estimate",lo:"lower confidence limit",hi:"upper confidence limit"};
      return `From ${rec.label||"[author and year missing]"} (${rec.location||"[location missing]"}), you pasted "${rec.pastedText}". We read: ${rec.values.map(v=>(names[v.field]||v.field)+" "+v.text).join("; ")||"none"}${rec.p?"; p "+rec.p.op+" "+rec.p.value+(rec.p.op!=="="?" (BOUND)":""):""}. We converted: ${rec.conversions.map(c=>c.fn==="clusterCounts"?`${c.field}: ${c.output.events} and ${c.output.n} after dividing by the design effect ${c.output.designEffect}, entered as ${c.rounded.events} and ${c.rounded.n} (${c.formula}; ${c.citation})`:`${c.field}: ${c.formula} = ${JSON.stringify(c.output)} (${c.citation})`).join("; ")||"none"}. Used as: ${rec.usedAs||"[not supplied by the app]"}.`;
    },
    // beforeConfirm: everything except the confirmation itself (used to enable "I confirm this row").
    validate(rec,{beforeConfirm=false}={}){
      const missing=[];
      if(!/[\p{L}][\p{L}'’.-]*(?:\s+.*)?\s+(?:18|19|20|21)\d{2}[a-z]?\b/u.test(String(rec.label||"").trim()))missing.push("label");
      for(const field of ["reference","location"])if(!String(rec[field]||"").trim())missing.push(field);
      if(String(rec.location||"").trim()&&!SOURCE_TYPES.includes(rec.source?.type))missing.push("source type");
      if(!beforeConfirm){
        if(!rec.confirmed)missing.push("confirmed");
        else{
          if(!String(rec.confirmedBy||"").trim()||!confirmVias.includes(rec.confirmedVia))missing.push("confirmed by");
          if(rec.sourceHash!==sha256(rec.pastedText))missing.push("source hash");
        }
      }
      const c=rec.choice||{};
      if(!RANDOMISATION_CHOICES[c.randomisation])missing.push("randomisation");
      else if(c.randomisation==="clusters"&&!["adjust","decline",...(rec.kind==="counts"?[]:["already"])].includes(c.cluster?.action))missing.push("cluster adjustment");
      for(const [k,v] of Object.entries(rec.facets||{}))if(v==="unknown"&&(k!=="arm"||rec.kind==="counts"))missing.push("unknown:"+k);
      const def=rec.outcomeDefinition;
      if(def&&(typeof def.text!=="string"||def.span!==undefined&&(!Array.isArray(def.span)||rec.pastedText.slice(...def.span)!==def.text||JSON.stringify(def.selector)!==JSON.stringify(selectors(rec.pastedText,def.span)))))missing.push("outcome definition");
      if(!rec.values||!rec.values.length)missing.push("values");
      for(const v of rec.values||[]){
        const p=v.span;
        const normalized=normalize(v.text).text;
        const literal=(rec.decimal==="comma"?/^[-+]?(?:\d+(?:,\d+)?|,\d+)$/:/^[-+]?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)$/).test(normalized);
        if(!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)||p[0]<0||p[1]<=p[0]||p[1]>rec.pastedText.length||rec.pastedText.slice(...p)!==v.text||!literal||printedNumber(v.text,rec.decimal)!==v.value)missing.push("span:"+v.field);
        if(v.selector&&JSON.stringify(v.selector)!==JSON.stringify(selectors(rec.pastedText,p)))missing.push("selector:"+v.field);
      }
      if(rec.decimal==="ask")missing.push("decimal");
      for(const v of [...(rec.p?[rec.p]:[]),...(rec.reportedPercentages||[])])
        if(!Array.isArray(v.span)||rec.pastedText.slice(...v.span)!==v.text||printedNumber(v.text,rec.decimal)!==v.value||JSON.stringify(v.selector)!==JSON.stringify(selectors(rec.pastedText,v.span)))missing.push("auxiliary source value");
      // Timepoint: one merged control (evidence-annotated options, "not stated" or typed); a non-nearest choice only warns.
      for(const f of rec.requiredFacets||[]){
        const v=rec.choice?.facets?.[f.key];
        if(f.key==="timepoint"?!(typeof v==="string"&&v.trim()):(!f.choices.includes(v)||(rec.facets[f.key]!=="unknown"&&v!==rec.facets[f.key])))missing.push("facet:"+f.key);
      }
      if(rec.kind==="counts"&&rec.choice?.armIndex!==undefined&&!ROLE_NAMES[rec.choice.role])missing.push("arm role");
      if(provenance.armIssues(rec).length&&rec.choice?.armAck!==provenance.armAckKey(rec))missing.push("arm contradiction");
      // Replay also covers what is SENT to the app for cluster counts: args = the row's printed values, rounded = round(output).
      const sent=c=>{
        const v=f=>(rec.values||[]).find(x=>x.field===f),ev=v(c.fields?.events),n=v(c.fields?.n),o=c.output||{};
        return !!(ev&&n&&c.args?.events===ev.value&&c.args?.n===n.value&&c.rounded&&c.rounded.events===Math.round(o.events)&&c.rounded.n===Math.round(o.n));
      };
      if(rec.conversions?.length&&(!replay(rec.conversions).ok||rec.conversions.some(c=>c.fn==="clusterCounts"&&!sent(c))))missing.push("conversion replay");
      if(rec.flags&&rec.flags.some(f=>f.blocking))missing.push("blocking flags");
      return missing;
    },
    // Contradictions between the chosen role and the printed cue next to the numbers, or the row label.
    armIssues(rec){
      const issues=[],single=rec.choice?.armIndex!==undefined;
      for(const a of rec.armCues||[]){
        if(!["intervention","control"].includes(a.role))continue;
        const says=a.cue&&armRoleOf(a.cue.text);
        if(says&&says!==a.role)issues.push({code:"ARM_CUE_CONTRADICTS",index:a.index,text:`The text next to these numbers says "${a.cue.text}", but you chose ${ROLE_NAMES[a.role]}.`});
        const label=single&&armRoleOf(rec.label);
        if(label&&label!==a.role)issues.push({code:"ARM_LABEL_CONTRADICTS",index:a.index,text:`The row label "${rec.label}" suggests ${ROLE_NAMES[label]}, but you chose ${ROLE_NAMES[a.role]}.`});
      }
      return issues;
    },
    armAckKey(rec){return JSON.stringify(provenance.armIssues(rec).map(i=>i.code+":"+i.text));},
    // Rows from one source that use the same printed numbers (double counting).
    sameArm(records){
      const out=[];
      for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++){
        if(records[i].pastedText!==records[j].pastedText)continue;
        const b=usedArms(records[j]),hit=usedArms(records[i]).find(a=>b.some(x=>x.span&&a.span&&x.span[0]===a.span[0]&&x.span[1]===a.span[1]));
        if(hit)out.push({rows:[i,j],text:`Rows ${i+1} and ${j+1} use the same printed numbers (${hit.events} of ${hit.n}). Choose a different printed arm for one of them.`});
      }
      return out;
    },
    // Groups (>= 2 rows) sharing a DOI, PMID, normalised reference or the same pasted text.
    sameSource(records){
      const parent=records.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i])),seen={};
      records.forEach((r,i)=>{
        const text=String(r.pastedText||"").trim();
        for(const k of [normDoi(r.doi)&&"doi:"+normDoi(r.doi),normPmid(r.pmid)&&"pmid:"+normPmid(r.pmid),normRef(r.reference)&&"ref:"+normRef(r.reference),text&&"text:"+text]){
          if(!k)continue;
          if(seen[k]===undefined)seen[k]=i;else parent[find(i)]=find(seen[k]);
        }
      });
      const groups={};records.forEach((_,i)=>(groups[find(i)]=groups[find(i)]||[]).push(i));
      return Object.values(groups).filter(g=>g.length>1);
    },
    // Distinct reports (reportGroups: DOI > PMID > normalised reference, as one union), rows, and distinct printed arms.
    summary(records){
      const keys=reportGroups(records).map(g=>"report:"+g),arms=new Set();
      records.forEach((r,i)=>usedArms(r).forEach(a=>arms.add([keys[i],a.events,a.n,(a.span||[]).join(":"),String(r.pastedText||"").length].join("|"))));
      return {reports:new Set(keys).size,rows:records.length,arms:arms.size};
    },
    summarySentence(records){
      const {reports,rows,arms}=provenance.summary(records);
      if(!rows)return "";
      if(reports===rows)return `Data were extracted from ${plural(reports,"report")}.`;
      if(arms&&records.every(r=>r.choice?.armIndex!==undefined))return `Data were extracted from ${plural(reports,"report")} (${plural(arms,"arm")}).`;
      return `Data were extracted from ${plural(reports,"report")} (${plural(rows,"row")}).`;
    },
    // One short structured line: "86 events of 125 · Intervention · outcome · timepoint · counted: not stated".
    line(rec){
      const c=rec.choice||{},den=DENOMINATOR_CHOICES[c.denominator]?(c.denominator==="ITT"?"all randomised (ITT)":c.denominator==="followed up"?"only those followed up":"not stated"):"not chosen";
      const tail=[c.outcome||"outcome: not entered",c.timepoint||"timepoint: not chosen"];
      const v=k=>(rec.values||[]).find(x=>x.field===k),design=provenance.designText(rec);
      if(rec.kind==="counts"&&c.armIndex!==undefined&&v("xi")&&v("ni"))return [`${v("xi").text} events of ${v("ni").text}`,ROLE_NAMES[c.role]||"arm: not chosen",...tail,"counted: "+den,design].join(" · ");
      if(rec.kind==="counts"&&v("ai")&&v("ci"))return [`${v("ai").text} events of ${v("n1i").text} (intervention) vs ${v("ci").text} of ${v("n2i").text} (control)`,...tail,"counted: "+den,design].join(" · ");
      if(rec.kind==="counts")return ["printed arms: not chosen",...tail,"counted: "+den,design].join(" · ");
      if(rec.kind==="effect_ci"&&v("effect")&&v("lo")&&v("hi"))return [`${rec.measure||"effect"} ${v("effect").text} (${v("lo").text} to ${v("hi").text})`,...tail,design].join(" · ");
      return [(rec.values||[]).map(x=>(FIELD_LABELS[x.field]||x.field)+" "+x.text).join(", ")||"no values",...tail,design].join(" · ");
    },
    // "randomised: individuals" / "randomised: clusters (adjusted, design effect 1.095)".
    designText(rec){
      const c=rec.choice||{},cl=c.cluster||{},de=rec.design?.designEffect,applied=(rec.conversions||[]).some(x=>x.fn==="clusterCounts"||x.fn==="clusterSE");
      if(c.randomisation==="clusters")return "randomised: clusters ("+(de&&applied?"adjusted, design effect "+(+de.toFixed(3)):de?"design effect "+(+de.toFixed(3))+" not applied":cl.action==="decline"?"not adjusted":cl.action==="already"?"analysis accounts for clustering":"adjustment not chosen")+")";
      if(c.randomisation==="not randomised")return "not randomised";
      return "randomised: "+(RANDOMISATION_CHOICES[c.randomisation]?RANDOMISATION_CHOICES[c.randomisation].toLowerCase():"not chosen");
    },
    // The clause/sentence of the paste that contains every used number.
    clause(rec){
      const t=rec.pastedText||"",spans=(rec.values||[]).map(v=>v.span).filter(Array.isArray);
      if(!spans.length)return {start:0,end:0,text:""};
      const from=Math.min(...spans.map(p=>p[0])),to=Math.max(...spans.map(p=>p[1]));
      let start=0;for(const m of t.slice(0,from).matchAll(/[.;!?]\s+|\n/g))start=m.index+m[0].length;
      const after=/[.;!?](?=\s|$)|\n/.exec(t.slice(to)),end=after?to+after.index+(after[0]==="\n"?0:1):t.length;
      return {start,end,text:t.slice(start,end)};
    },
    toCSV(records){
      const keys=CSV_KEYS;
      const cell=x=>{let s=typeof x==="object"?JSON.stringify(x):String(x===undefined?"":x);if(/^[\s\u0000-\u001f]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
      // Chosen role and the printed cue are separate columns.
      const derived=r=>({...r,armRole:r.choice?.armIndex!==undefined?r.choice.role||"not chosen":(r.armCues||[]).map(a=>a.role).join("; "),
        armCue:r.choice?.armIndex!==undefined?(r.armCue?r.armCue.text:"none next to these numbers"):(r.armCues||[]).map(a=>a.role+": "+(a.cue?a.cue.text:"none")).join("; "),
        denominator:r.choice?.denominator,timepoint:r.choice?.timepoint,
        sourceType:r.source?.type,sourceDetail:r.source?.detail,verifiedAgainst:r.source?.verifiedAgainst,randomisation:r.choice?.randomisation});
      return [keys.map(cell).join(","),...records.map(r=>{const d=derived(r);return keys.map(k=>cell(d[k])).join(",");})].join("\r\n");
    },
    // Reads a provenance CSV written by toCSV (this tool) back into records; undoes the formula-injection prefix.
    fromCSV(text){
      const [head,...rows]=csvRows(text).filter(r=>r.some(c=>c!==""));
      if(!head||!head.includes("label")||!head.includes("values"))throw new Error("Not a provenance CSV from this tool (no label/values columns)");
      const undo=s=>s.startsWith("'")&&(/^[\s\u0000-\u001f]*[=+\-@]/.test(s.slice(1))||/^[\t\r\n]/.test(s.slice(1)))?s.slice(1):s;
      const json=["facets","timepointEvidence","p","reportedPercentages","choice","values","conversions","flags","sameSourceOptIn","design","outcomeDefinition","statements"];
      return rows.map(cells=>{
        const r={};
        head.forEach((k,i)=>{
          const s=undo(cells[i]===undefined?"":cells[i]);
          if(json.includes(k)){if(s!=="")try{r[k]=JSON.parse(s);}catch(e){r[k]=s;}}
          else if(k==="confirmed")r[k]=s==="true";
          else if(k==="candidateRank"||k==="candidateScore"){if(s!=="")r[k]=+s;}
          else r[k]=s;
        });
        r.source={type:r.sourceType||"",detail:r.sourceDetail||"",...(r.verifiedAgainst?{verifiedAgainst:r.verifiedAgainst}:{})};
        for(const k of ["sourceType","sourceDetail","verifiedAgainst","armRole","armCue","denominator","timepoint","randomisation"])delete r[k];
        return r;
      });
    },
    // Second extractor: per-row differences in values, spans, facets and key choices. Read-only; never merges.
    compare(mine,theirs){
      const key=r=>normRef(r.label),used=new Set(),rows=[];
      const show=x=>x===undefined||x===null||x===""?"(none)":Array.isArray(x)?x.join("–"):typeof x==="object"?JSON.stringify(x):String(x);
      const diffRows=(a,b)=>{
        const diffs=[],add=(what,x,y)=>{if(JSON.stringify(x===undefined?null:x)!==JSON.stringify(y===undefined?null:y))diffs.push({what,mine:show(x),theirs:show(y)});};
        const va=Object.fromEntries((a.values||[]).map(v=>[v.field,v])),vb=Object.fromEntries((b.values||[]).map(v=>[v.field,v]));
        for(const f of new Set([...Object.keys(va),...Object.keys(vb)])){add("value "+f,va[f]?.value,vb[f]?.value);add("span "+f,va[f]?.span,vb[f]?.span);}
        for(const k of new Set([...Object.keys(a.facets||{}),...Object.keys(b.facets||{})]))add("facet "+k,a.facets?.[k],b.facets?.[k]);
        add("arm role",a.choice?.role,b.choice?.role);add("printed arm",a.choice?.armIndex,b.choice?.armIndex);
        add("unit of randomisation",a.choice?.randomisation,b.choice?.randomisation);add("cluster adjustment",a.design?.cluster,b.design?.cluster);
        add("outcome",a.choice?.outcome,b.choice?.outcome);add("outcome definition",a.outcomeDefinition?.text,b.outcomeDefinition?.text);
        add("location",a.location,b.location);add("measure",a.measure,b.measure);
        add("conversions",(a.conversions||[]).map(c=>c.output),(b.conversions||[]).map(c=>c.output));
        return diffs;
      };
      mine.forEach(a=>{
        const j=theirs.findIndex((b,i)=>!used.has(i)&&key(b)===key(a));
        if(j<0){rows.push({label:a.label,status:"only in this extraction",diffs:[]});return;}
        used.add(j);rows.push({label:a.label,status:"matched",diffs:diffRows(a,theirs[j])});
      });
      theirs.forEach((b,i)=>{if(!used.has(i))rows.push({label:b.label,status:"only in the other extraction",diffs:[]});});
      return {rows,differences:rows.reduce((s,r)=>s+r.diffs.length+(r.status==="matched"?0:1),0)};
    },
    toDocxParagraphs(records){return records.flatMap(r=>[provenance.sentence(r),"Reference: "+r.reference+"; DOI: "+(r.doi||"none")+"; PMID: "+(r.pmid||"none"),"User choices: "+JSON.stringify(r.choice)+"; flags: "+JSON.stringify(r.flags)+"; confirmed: "+r.confirmed+"; confirmed at: "+(r.confirmedAt||"not confirmed")]);}
  };
  const api={RANDOMISATION_CHOICES,ICC_SOURCES,SOURCE_TYPES,ABSTRACT_NOTE,FACET_CHOICES,FACET_NAMES,designEffect,clusterCounts,clusterSE,sha256,FIELD_LABELS,plural,SINGLE_GROUP_SCHEMAS,PROVENANCE_SCHEMAS,DENOMINATOR_CHOICES,ROLE_NAMES,armRoleOf,timepointOptions,decimalPreview,FIVENUM_METHODS,measureFromHeaders,normalize,anchor,selectors,RULES,RULES_VERSION,replay,consistency,parseTable,parseCell,detect,convert,extract,provenance,seFromCI,seFromP,estFromCI,sdFromSE,sdFromCI,convertFivenum,eventsFromPercent,sanity,sanityRules,SCHEMAS,fallback:null,qnorm,qt};
  global.AlmEntry=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
