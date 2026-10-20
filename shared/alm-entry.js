/* Smart entry: local rules and explicit, provenance-bearing conversions.
 * Five-number formulas ported from metafor 5.2.1 conv.fivenum.
 * No statistical engine or app wiring lives in this module. */
(function (global) {
  "use strict";
  const finite = x => typeof x === "number" && Number.isFinite(x);
  const present = x => x !== undefined && x !== null && !Number.isNaN(x);
  const flag = (code, text, blocking = false, extra = {}) => ({code, text, blocking, ...extra});
  const handbook = "Cochrane Handbook v6.5 §6.5.2.2";
  function result(value, method, citation, inputs, flags = []) {
    return {value: finite(value) ? value : null, method, citation, inputs: {...inputs}, flags};
  }
  function invalid(inputs, text) {
    return result(null, "not converted", handbook, inputs, [flag("invalid-input", text, true)]);
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
    if(!validCI(a))return invalid(a,"CI bounds, level or ratio scale are invalid");
    const lo=a.ratio?Math.log(a.lo):a.lo,hi=a.ratio?Math.log(a.hi):a.hi;
    return result((hi-lo)/(2*qnorm(1-(1-levelOf(a))/2)),"SE from CI",handbook,a);
  }
  function seFromP(a) {
    const token=typeof a.p==="string"?parseCell(a.p,{header:"p"}):a.p;
    const p=typeof token==="object" && token ? token.value : token;
    if(token && typeof token==="object" && token.op && token.op!=="=")
      return result(null,"not converted","Cochrane Handbook v6.5 §6.3.2",a,[flag("p-inequality","A p-value inequality cannot be converted to an SE",true)]);
    if(!finite(a.est)||!finite(p)||p<=0||p>=1||(a.ratio&&a.est<=0))return invalid(a,"An exact p in (0,1) and a valid estimate are required");
    return result(Math.abs(a.ratio?Math.log(a.est):a.est)/(-qnorm(p/2)),"SE from p","Cochrane Handbook v6.5 §6.3.2",a);
  }
  function estFromCI(a) {
    if(!validCI(a))return invalid(a,"CI bounds or ratio scale are invalid");
    const v=a.ratio?Math.exp((Math.log(a.lo)+Math.log(a.hi))/2):a.lo/2+a.hi/2;
    return result(v,"CI midpoint","Cochrane Handbook v6.5 §6.3.1",a,[flag("ci-midpoint","estimate taken as CI midpoint")]);
  }
  function sdFromSE(a) {
    if(!finite(a.se)||a.se<0||!finite(a.n)||a.n<=0)return invalid(a,"SE must be nonnegative and n positive");
    return result(a.se*Math.sqrt(a.n),"SD from SE",handbook,a);
  }
  function sdFromCI(a) {
    if(!validCI(a)||!finite(a.n)||a.n<=1)return invalid(a,"Valid CI and n > 1 are required");
    const small=a.n<60,p=1-(1-levelOf(a))/2;
    return result(Math.sqrt(a.n)*(a.hi-a.lo)/(2*(small?qt(p,a.n-1):qnorm(p))),small?"SD from CI (t, n-1 df)":"SD from CI (normal)",handbook,a);
  }
  function eventsFromPercent(a) {
    if(!finite(a.pct)||a.pct<0||a.pct>100||!finite(a.n)||a.n<=0)return invalid(a,"Percent must be in [0,100] and n positive");
    const raw=a.pct/100*a.n,v=Math.round(raw);
    return result(v,"events from percent","Arithmetic: percent × n / 100",a,Math.abs(raw-v)>.05?[flag("rounded-events","non-integer events (rounded %)")]:[]);
  }
  const meanMethods=["luo/wan/shi","hozo2005","wan2014","bland2015","luo2016","walter2007"];
  const sdMethods=["luo/wan/shi","hozo2005","wan2014","bland2015","shi2020","walter2007"];
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
      return {values,...values,method:methods,citation:methods.map((m,i)=>m==="luo/wan/shi"?(i?(scenario===3?"Shi 2020":"Wan 2014"):"Luo 2018"):({hozo2005:"Hozo 2005",wan2014:"Wan 2014",bland2015:"Bland 2015",luo2016:"Luo 2018",shi2020:"Shi 2020",walter2007:"Walter 2007"})[m]).join("; "),inputs:{...a},flags,scenario};
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
    if(a.test!==false && tval>=crit){flags.push(flag("fivenum-skew","Five-number symmetry test rejected estimation",true));return finish();}
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
  const norm=s=>String(s===null||s===undefined?"":s).replace(/[\u2212\u2010-\u2014]/g,"-").replace(/(\d)[·⋅](?=\d)/g,"$1.").replace(/[\u00a0\u2009\u202f]/g," ").trim();
  function parseCell(str,ctx={}) {
    let s=norm(str),header=String(ctx.header||"").toLowerCase();
    if(/\d,\d/.test(s)){
      if(ctx.decimal==="comma")s=s.replace(/(\d),(?=\d)/g,"$1.");
      else if(ctx.decimal!=="separator")return {kind:"unknown",raw:s,ambiguousDecimal:true};
    }
    let m;
    if(!s||/^(?:NA|N\/A|NR|not reported|-)$/i.test(s))return {kind:"unknown",raw:s,missing:true};
    if((m=s.match(new RegExp(`^(?:p\\s*)?([<>=≤≥]+)\\s*(${NUM})$`,"i"))))return {kind:"p",op:m[1],value:+m[2]};
    if((m=s.match(new RegExp(`^(${NUM})(?:\\s*\\/\\s*(${NUM}))?\\s*[([{]\\s*(${NUM})\\s*%\\s*[)\\]}]$`))))return {kind:"n_pct",num:+m[1],...(m[2]?{den:+m[2]}:{}),pct:+m[3]};
    if((m=s.match(new RegExp(`^(${NUM})\\s*%$`))))return {kind:"percent",value:+m[1]};
    if((m=s.match(new RegExp(`^(${NUM})\\s*\\/\\s*(${NUM})$`))))return {kind:"fraction",num:+m[1],den:+m[2]};
    if((m=s.match(new RegExp(`^${NUM}$`))))return {kind:/^p(?:[ -]?value)?$/.test(header)?"p":"number",value:+m[0],...(/^p(?:[ -]?value)?$/.test(header)?{op:"="}:{})};
    const levelMatch=s.match(/(\d+(?:\.\d+)?)\s*%\s*CI/i);
    const level=levelMatch?+levelMatch[1]/100:undefined;
    const isIQR=/iqr|interquartile/i.test(s+" "+header),isRange=/range/i.test(s+" "+header);
    let clean=s.replace(/\d+(?:\.\d+)?\s*%\s*CI/ig,"").replace(/\b(?:median|mean|IQR|range|CI)\b/ig,"").replace(/[;:]/g," ").trim();
    if((m=clean.match(new RegExp(`^(${NUM})\\s*(?:[, ]*[(\\[{]\\s*|,\\s*|\\s+)${RANGE}\\s*[)\\]}]?$`,"i")))){
      if(isIQR)return {kind:"median_iqr",median:+m[1],q1:+m[2],q3:+m[3]};
      if(isRange)return {kind:"median_range",median:+m[1],min:+m[2],max:+m[3]};
      return {kind:"est_ci",est:+m[1],lo:+m[2],hi:+m[3],...(level?{level}:{})};
    }
    if((m=clean.match(new RegExp(`^${RANGE}$`,"i"))))return {kind:"ci",lo:+m[1],hi:+m[2],...(level?{level}:{})};
    const statedDispersion=s.match(/\b(SD|SE)\b/i);
    const dispersionText=s.replace(/\b(?:SD|SE)\b/ig,"").trim();
    if((m=dispersionText.match(new RegExp(`^(?:mean\\s*)?(${NUM})\\s*(?:±|\\+/-|[(\\[{])\\s*(${NUM})\\s*(?:[)\\]}])?\\s*$`,"i")))){
      const dispersion=((statedDispersion&&statedDispersion[1])||(/\bse\b|standard error/.test(header)?"SE":/\bsd\b|standard deviation/.test(header)?"SD":"")).toUpperCase();
      return {kind:"mean_sd",mean:+m[1],spread:+m[2],dispersion:dispersion||null,ambiguousDispersion:!dispersion};
    }
    return {kind:"unknown",raw:s};
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
  function detect(table,schema) {
    const mapping={},confidence={},questions=[],used=new Set(),width=Math.max(0,(table.header||[]).length,...table.rows.map(r=>r.length));
    const choices=["ignore",...new Set([...schemaFields(schema),...sources])];
    for(let col=0;col<width;col++){
      const h=table.header&&table.header[col];let field=h?headerField(h,schema):null,score=field?1:0;
      if(field&&field!=="ignore"&&used.has(field)){field=null;score=0;}
      if(!field){
        const vals=table.rows.map(r=>parseCell(r[col]));
        const next=table.rows.map(r=>parseCell(r[col+1]));
        if(vals.length&&vals.every((v,i)=>v.kind==="number"&&Number.isInteger(v.value)&&v.value>=0&&next[i].kind==="number"&&v.value<=next[i].value)){
          field=schemaFields(schema).includes("xi")?"xi":"events";score=.55;
        }
      }
      mapping[col]=field||"ignore";confidence[col]=score;
      if(field&&field!=="ignore")used.add(field);
      if(score<.85)questions.push(question("column:"+col,`Choose the meaning of column ${col+1}${h?` (${h})`:""}`,choices));
    }
    return {mapping,confidence,questions};
  }

  // Exported rules permit an independent planted-defect test of the gate.
  const sanityRules = {
    events:(r)=>[["xi","ni"],["events","n"],["cases","n"],["ai","n1i"],["ci","n2i"]].flatMap(([e,n])=>finite(r[e])&&((finite(r[n])&&r[e]>r[n])||r[e]<0)?[flag("events-bounds",`${e} must be between 0 and ${n}`,true,{field:e})]:[]),
    sample:r=>["ni","n","n1i","n2i"].filter(k=>finite(r[k])&&r[k]<=0).map(k=>flag("sample-size",`${k} must be positive`,true,{field:k})),
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
      if(r.study&&seen.has(r.study))flags.push(flag("duplicate-study","Duplicate study label",false,{row,study:r.study}));
      if(r.study)seen.add(r.study);
    });
    for(const [e,n] of [["xi","ni"],["events","n"],["cases","n"],["ai","n1i"],["ci","n2i"]]){
      if(records.length&&records.every(r=>finite(r[e])&&finite(r[n])&&r[e]>r[n]))flags.push(flag("swapped-columns",`Every ${e} exceeds ${n}; swap these columns`,false,{action:"swap-columns",fields:[e,n]}));
    }
    return flags;
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
    const ratioHeader=(table.header||[]).some(h=>/\b(?:OR|RR|HR)\b|odds ratio|risk ratio|hazard ratio/i.test(h));
    const ratio=typeof schema==="object"&&schema.ratio!==undefined?schema.ratio:ratioHeader;
    table.rows.forEach((row,i)=>{
      const r={study:`Study ${i+1}`},pending=[];
      if(ratio)r.ratio=true;
      function log(out,description) {
        out.flags.forEach(f=>flags.push({...f,row:i,study:r.study}));
        steps.push({row:i,study:r.study,text:`${r.study}: ${description} (${out.citation})`,method:out.method,citation:out.citation,inputs:out.inputs,flags:out.flags});
        return out.value;
      }
      row.forEach((cell,col)=>{
        const field=map[col];
        if(!field||field==="ignore")return;
        if(["study","treatment","t1","t2"].includes(field)||(!fields.includes(field)&&!sources.includes(field))){r[field]=cell;return;}
        const header=(table.header||[])[col]||"";
        let token=parseCell(cell,{header});
        if(token.ambiguousDecimal){
          const q=question(`decimal:${i}:${col}`,`${r.study}, ${header||field}: interpret comma as decimal separator?`,["comma","separator"]),a=ask(q);
          if(q.choices.includes(a)){
            token=parseCell(cell,{header,decimal:a});
            steps.push({row:i,study:r.study,text:`${r.study}: comma interpreted as ${a==="comma"?"a decimal mark":"a separator"} by confirmation`,method:"decimal confirmed",citation:"User confirmation",inputs:{cell},flags:[]});
          }
        }
        if(token.ambiguousDispersion){
          const q=question(`dispersion:${i}:${col}`,`${r.study}: is ${token.spread} an SD or SE?`,["SD","SE"]),a=ask(q);
          if(q.choices.includes(a)){
            token={...token,dispersion:a,ambiguousDispersion:false};
            steps.push({row:i,study:r.study,text:`${r.study}: dispersion confirmed as ${a}`,method:"dispersion confirmed",citation:"User confirmation",inputs:{cell,dispersion:a},flags:[]});
          }
        }
        if(token.kind==="unknown"){
          if(!token.missing&&!token.ambiguousDecimal)flags.push(flag("unparsed-cell",`${r.study}: cannot parse ${header||field}: ${cell}`,true,{row:i}));
          return;
        }
        if(token.kind==="number"){r[field]=token.value;if(["yi","est"].includes(field))r.roundingUnit=roundingUnit(cell);return;}
        if(token.kind==="p"){r.p=token;return;}
        if(token.kind==="percent"){pending.push({kind:"percent",field,pct:token.value});return;}
        if(token.kind==="fraction"||token.kind==="n_pct"){
          r[field]=token.num;
          const total=({xi:"ni",events:"n",cases:"n",ai:"n1i",ci:"n2i"})[field];
          if(total&&present(token.den))r[total]=token.den;
          return;
        }
        if(token.kind==="est_ci"||token.kind==="ci"){
          const suffix=/[12]$/.test(field)?field.slice(-1):"";
          if(suffix){r["lo"+suffix]=token.lo;r["hi"+suffix]=token.hi;if(present(token.est))r["m"+suffix+"i"]=token.est;}
          else {r.lo=token.lo;r.hi=token.hi;if(present(token.est)){r.est=token.est;r.roundingUnit=roundingUnit(cell);}}
          if(token.level)r.level=token.level;
          return;
        }
        pending.push({field,...token});
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
          if(q.dispersion==="SD")r[sdKey]=q.spread;
          if(q.dispersion==="SE")r[sdKey]=log(sdFromSE({se:q.spread,n:r[nKey]}),"SD estimated from SE");
        }else if(q.kind==="median_iqr"||q.kind==="median_range"){
          const a={median:q.median,n:r[nKey],...(q.kind==="median_iqr"?{q1:q.q1,q3:q.q3}:{min:q.min,max:q.max})};
          Object.assign(r,a);
          try{const out=convertFivenum(a);log(out,`Mean and SD estimated from ${q.kind==="median_iqr"?"IQR":"range"}`);r[meanKey]=out.mean;r[sdKey]=out.sd;}
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
          const out=convertFivenum({min:r.min,q1:r.q1,median:r.median,q3:r.q3,max:r.max,n:r.n||r.ni||r.n1i});
          log(out,"Mean and SD estimated from five-number summary");
          r[name==="continuous"?"m1i":"mean"]=out.mean;r[name==="continuous"?"sd1i":"sd"]=out.sd;
        }catch(e){flags.push(flag("fivenum-invalid",e.message,true,{row:i}));}
      }
      const required=name==="arm-nma"?["study","treatment","n",...(present(r.mean)?["mean","sd"]:["events"])]:fields;
      required.forEach(k=>{if(!present(r[k])||r[k]==="")flags.push(flag("missing-field",`${r.study}: ${k} is required; raw inputs cannot be inferred from an effect estimate`,true,{row:i,field:k}));});
      records.push(r);
    });
    flags.push(...sanity(records,schema));
    for(const f of flags.filter(f=>f.action==="swap-ci")){
      const id=`swap-ci:${f.row}`,q=question(id,`${records[f.row].study}: swap the lower and upper CI bounds?`,["swap","keep"]);
      ask(q);
    }
    for(const f of flags.filter(f=>f.action==="swap-columns"))ask(question("swap-columns:"+f.fields.join(":"),`Swap ${f.fields[0]} and ${f.fields[1]} for all rows?`,["swap","keep"]));
    // Swap source cells/mappings and rerun conversions, never stale derived values.
    let rerun=false;const rows=table.rows.map(r=>r.slice()),nextMap={...map},nextAnswers={...answers};
    for(const q of questions){
      if(answers[q.id]!=="swap")continue;
      if(q.id.startsWith("swap-columns:")){
        const [,a,b]=q.id.split(":");
        Object.keys(nextMap).forEach(k=>{if(nextMap[k]===a)nextMap[k]=b;else if(nextMap[k]===b)nextMap[k]=a;});rerun=true;delete nextAnswers[q.id];
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
      const out=convert({...table,rows},nextMap,schema,nextAnswers);
      out.steps.unshift({text:"User confirmed swapping source columns or CI bounds",method:"user-confirmed swap",citation:"User confirmation",inputs:{},flags:[]});
      return out;
    }
    const unresolved=questions.filter(q=>!q.choices.includes(answers[q.id]));
    unresolved.forEach(q=>flags.push(flag("unanswered-question",q.text,true,{questionId:q.id})));
    return {records,steps,flags,questions};
  }
  const api={parseTable,parseCell,detect,convert,seFromCI,seFromP,estFromCI,sdFromSE,sdFromCI,convertFivenum,eventsFromPercent,sanity,sanityRules,SCHEMAS,fallback:null,qnorm,qt};
  global.AlmEntry=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
