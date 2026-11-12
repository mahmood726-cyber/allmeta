"use strict";
if(!process.execArgv.some(a=>a.startsWith('--max-old-space-size'))){
 const child=require('child_process').spawnSync(process.execPath,['--max-old-space-size=128',__filename,...process.argv.slice(2)],{stdio:'inherit'});
 if(child.error)throw child.error;process.exit(child.status===null?1:child.status);
}
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert');
const page=path.resolve(process.argv[2]||'allmeta/mapriors/index.html');
const loader=path.resolve('validation/harness/load_app.js');
const mod=new Module(loader,module); mod.filename=loader;mod.paths=module.paths;
mod._compile(fs.readFileSync(loader,'utf8').replace("const page = path.resolve(__dirname, '../../allmeta/mapriors/index.html');",'const page = '+JSON.stringify(page)+';'),loader);
const app=mod.exports,E=app.MAPEngine;
let passed=0,total=0;
function close(a,b,t=1e-10){assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t*Math.max(Math.abs(b),1e-12),`${a} != ${b} (tol ${t})`);}
function test(name,f){total++;try{assert.ok(E,'MAPEngine missing');f();passed++;console.log('PASS '+name);}catch(e){console.log('FAIL '+name+': '+e.message);}}
const normal={family:'normal',data:[{y:0,se:1}],tauScale:.5,betaMean:0,betaSD:10,sigma:1};
test('T1 D1 independent 2001 x 2001 trapezoid beta/tau variance',()=>{
 let z=0,m=0,m2=0,t2=0;
 for(let i=0;i<=2000;i++){let t=i*5/2000,wt=i===0||i===2000?.5:1;
 for(let j=0;j<=2000;j++){let b=-20+j*.02,w=wt*(j===0||j===2000?.5:1)*Math.exp(-b*b/200-2*t*t-b*b/(2*(1+t*t)))/Math.sqrt(1+t*t);z+=w;m+=w*b;m2+=w*b*b;t2+=w*t*t;}}
 const r=E.gMAP(normal);close(r.predictive.sd**2,(m2+t2)/z-(m/z)**2,1e-6);
 assert.ok(r.convergence.converged);close(r.predictive.mean,0,1e-3);
});
test('T2 D1 AS independent beta/tau grid and 4001-point theta trapezoids',()=>{
 const check=require('./independent_binary');const data=[0,1,3,0,0,0,1,0].map((r,i)=>({r,n:[43,12,20,16,6,17,16,14][i]}));
 const independent=check(data);const result=E.gMAP({family:'binomial',data,tauScale:1,betaMean:0,betaSD:2});close(result.predictive.mean,independent,1e-6);assert.ok(result.convergence.converged);
});
test('T3 D2 unit-information robustification',()=>{
 // Requirement = RBesT 1.12-0 robustify.betaMix: mixbeta(c(1, mean, n + 1), param = "mn"), i.e. Beta(1,1) at
 // mean 0.5, n = 1 (R smoke 2026-10-31: beta_robust component 2 a = b = 1). The earlier Beta(0.5,0.5) expectation
 // asserted the page's own convention, not RBesT's.
 const b=E.robustify({family:'beta',comps:[{w:1,a:10,b:30}]},.2,.5);
 close(b.comps[0].w,.8);close(b.comps[1].w,.2);close(b.comps[1].a,1);close(b.comps[1].b,1);
 const b2=E.robustify({family:'beta',comps:[{w:1,a:10,b:30}]},.2,.25,3);close(b2.comps[1].a,1);close(b2.comps[1].b,3);
 const n=E.robustify({family:'normal',comps:[{w:1,m:2,s:3}],sigma:4},.2,2,4,4);close(n.comps[1].m,2);close(n.comps[1].s,2);
});
test('T4 D3 mixture quantile inversion',()=>{
 for(const mix of [{family:'beta',comps:[{w:.8,a:10,b:30},{w:.2,a:.5,b:.5}]},{family:'normal',comps:[{w:.8,m:2,s:.3},{w:.2,m:-1,s:4}],sigma:1}])for(const p of [.025,.5,.975])close(E.pmix(mix,E.qmix(mix,p)),p,1e-12);
});
test('T5 D4 moment ESS and conjugate postmix identities',()=>{
 let b={family:'beta',comps:[{w:1,a:10,b:30}]};close(E.ess(b,'moment'),40);
 let n={family:'normal',comps:[{w:1,m:2,s:3}],sigma:4};close(E.ess(n,'moment'),16/9);
 b={family:'beta',comps:[{w:.4,a:1,b:1},{w:.6,a:2,b:1}]};
 const mean=.4*.5+.6*2/3,variance=.4/3+.6*.5-mean*mean;close(E.ess(b,'moment'),mean*(1-mean)/variance-1);
 let post=E.postmix(b,{r:1,n:2});close(post.comps[0].a,2);close(post.comps[0].b,2);close(post.comps[1].a,3);close(post.comps[1].b,2);close(post.comps[0].w,.4);
 const unequal=E.postmix(b,{r:2,n:2});close(unequal.comps[0].w,4/13);close(unequal.comps[1].w,9/13);close(unequal.comps[0].a,3);close(unequal.comps[1].a,4);
 n={family:'normal',comps:[{w:.3,m:0,s:1},{w:.7,m:2,s:2}],sigma:3};post=E.postmix(n,{m:1,n:9,sigma:3});close(post.comps[0].m,.5);close(post.comps[0].s,Math.sqrt(.5));close(post.comps[1].m,1.2);
 let a=.3*Math.exp(-.25)/Math.sqrt(2),c=.7*Math.exp(-.1)/Math.sqrt(5);close(post.comps[0].w,a/(a+c));
});
test('T6 reproducible generated R settings',()=>{
 const b=E.exportR({family:'binomial',data:[{r:1,n:10}],tauScale:.7,betaMean:-1,betaSD:3},.2,.1);
 assert.ok(b.includes('cbind(r, n - r) ~ 1 | study'));assert.ok(b.includes('tau.prior = 0.7'));assert.ok(b.includes('c(-1, 3)'));assert.ok(b.includes('weight = 0.2, mean = 0.5'));
 const n=E.exportR({...normal,tauScale:.8,betaMean:2,betaSD:7},.2,1.3);assert.ok(n.includes('cbind(y, y.se) ~ 1 | study'));assert.ok(n.includes('weight = 0.2, mean = 1.3, sigma = 1'));
});

test('T7 double-precision normal / beta numerical identities',()=>{
 close(E.normalCDF(1),.8413447460685429,1e-15);close(E.normalCDF(-8),6.220960574271784e-16,1e-14);close(E.normalQuantile(.975),1.959963984540054,1e-15);
 for(const p of [1e-10,.001,.1,.5,.9,.999,1-1e-10])close(E.normalCDF(E.normalQuantile(p)),p,2e-14);
 close(E.incompleteBeta(.3,1,1),.3,1e-14);close(E.incompleteBeta(.3,2,1),.09,1e-14);close(E.betaQuantile(.3,1,1),.3,1e-14);
});
test('T8 k=1 and zero/all-event binomial symmetry',()=>{
 const o={family:'binomial',data:[{r:0,n:50}],tauScale:1,betaMean:0,betaSD:2};
 const a=E.gMAP(o),b=E.gMAP({...o,data:[{r:50,n:50}]});assert.ok(Math.abs(a.predictive.mean+b.predictive.mean-1)<1e-8);assert.ok(Math.abs(a.predictive.sd-b.predictive.sd)<1e-8);assert.ok(a.convergence.converged&&b.convergence.converged);assert.ok(a.predictive.mean>0&&b.predictive.mean<1);
});
test('T9 fitted mixture moments, AIC and live UI path',()=>{
 const model=E.gMAP(normal),mix=E.fitMixture(model),sm=E.summary(mix);assert.ok(Math.abs(sm.mean-model.predictive.mean)<1e-12);close(sm.sd,model.predictive.sd,5e-3);assert.ok(mix.fit.K>=1&&mix.fit.K<=4);assert.equal(mix.fit.candidates.length,4);
 const ids=new Set([...fs.readFileSync(page,"utf8").matchAll(/id="([^"]+)"/g)].map(m=>m[1]));const elements=new Map();app.document.getElementById=id=>{assert.ok(ids.has(id),"Unknown DOM ID "+id);if(!elements.has(id))elements.set(id,{value:'',style:{},innerHTML:'',textContent:'',setAttribute(){},scrollIntoView(){}});return elements.get(id);};
 app.document.getElementById('engineMode').value='model';app.document.getElementById('endpointType').value='continuous';app.document.getElementById('wSlider').value='20';app.document.getElementById('confLevel').value='.95';
 for(const name of ['renderPowerPrior','renderCommensuratePrior','renderComparisonTable','renderSampleSize','configureOCSliders','animReset','renderBorrowingHeatmap','runAutoConflictDetection','announce'])app[name]=()=>{};
 const vm=require('vm');vm.runInContext('studies=[{trial:"single",mean:0,sd:1,n:1}];',app);app.applyEngineResult(model,mix,normal,.2,.95);
 assert.ok(elements.get('metricsGrid').innerHTML.includes('RBesT-model posterior'));assert.ok(elements.get('essContent').innerHTML.includes('Moment'));assert.ok(elements.get('densityLegend').innerHTML.includes('components'));
 vm.runInContext('engineCache={key:JSON.stringify(engineSettings()),result:mapResult.model,mix:mapResult.mixture};',app);app.runMAP();assert.equal(vm.runInContext('mapResult.w_vague',app),.2);
});
test('T10 D4 Morita ESS = RBesT 1.12-0 finite-sample definition (s = 100 baseline, predictive expected information)',()=>{
 // R values: validation/evidence/R_smoke_api.json (RBesT 1.12-0, 2026-10-31). PREREG Morita tolerance 1e-4 x max(1,|R|):
 // RBesT locates the mode with optimise(tol = eps^0.25), the page with an exact search.
 const beta=(...c)=>({family:'beta',comps:c.map(([w,a,b])=>({w,a,b}))}),norm=(...c)=>({family:'normal',sigma:2,comps:c.map(([w,m,s])=>({w,m,s}))});
 const t=(x,r)=>assert.ok(Math.abs(x-r)<=1e-4*Math.max(1,Math.abs(r)),`${x} vs R ${r}`);
 t(E.ess(beta([1,10,30]),'morita'),39.990368937358902);t(E.ess(beta([.7,10,30],[.3,3,3]),'morita'),31.0708770010677);
 t(E.ess(norm([1,0,1]),'morita'),3.96);t(E.ess(norm([.8,0,1],[.2,1,3]),'morita'),3.73168155869655);
});
test('T11 D4 ELIR on the response scale (independent scipy quad, epsrel 1e-13)',()=>{
 // RBesT ess.betaMix elir = integral of dmix * (-d2 log dmix / dp2) * p(1-p) dp. Independent values: scipy.integrate.quad.
 close(E.ess({family:'beta',comps:[{w:.7,a:10,b:30},{w:.3,a:3,b:3}]},'elir'),22.637871661093087,1e-9);
 close(E.ess({family:'normal',sigma:2,comps:[{w:.8,m:0,s:1},{w:.2,m:1,s:3}]},'elir'),2.6145630576689007,1e-9);
 close(E.ess({family:'beta',comps:[{w:1,a:10,b:30}]},'elir'),40,1e-9);
});
test('T12 D4 ELIR keeps the near-boundary tail (component a = 1 + eps; mpmath whole-line quadrature, dps 30)',()=>{
 // MAP mixtures from RBesT 1.12-0 automixfit (validation/reference/P1.json, bin_k3_p0.20_s1.5.json). A component at
 // the constrain_gt1 floor decays like exp((a-1) logit p): P1 has 0.536 below logit -35 and 0.0199 below logit -700
 // (beyond double precision of p), bin_k3_p0.20_s1.5 has 0.0052 below -700. Values: elir_whole.py over (-inf, inf).
 const m={family:'beta',comps:[{w:0.824298358074023,a:1.18480684995884,b:155.399097711833},{w:0.125738130707861,a:2.33685793864902,b:64.9370851184699},{w:0.0348697160538972,a:2.10975627102983,b:14.1965506442341},{w:0.0150937951642185,a:1.00000001,b:1.31571656257033}]};
 close(E.ess(m,'elir'),108.7291596590999,1e-9);
 close(E.ess({family:'beta',comps:[{w:0.576043960354339,a:1.27569562792631,b:5.06315135609074},{w:0.423956039645655,a:1.00666284361273,b:1.28450570774891}]},'elir'),3.5129665397881295,1e-9);
});
test('T13 D4 ELIR resolves narrow components next to wide ones (corpus mixtures; mpmath 40-digit quadrature)',()=>{
 // From validation/reference (RBesT 1.12-0 automixfit + robustify): crohn robust w=0.1, bin_k10_p0.50_s0.0 MAP,
 // cont_k10_m5_s0.0 robust w=0.5. Independent values: arbiter.py (mpmath quad with component breakpoints).
 const N=(sigma,...c)=>({family:'normal',sigma,comps:c.map(([w,m,s])=>({w,m,s}))}),B=(...c)=>({family:'beta',comps:c.map(([w,a,b])=>({w,a,b}))});
 close(E.ess(N(88,[0.378124539097322,-54.9454015308954,15.902857751074],[0.330212840986381,-46.7391869149888,6.92268835955703],[0.106521916807001,-53.3344432377319,40.7812754219796],[0.0851407031092956,-34.9151582460433,15.6272816831559],[0.1,-49.8489695263743,88]),'elir'),35.370673159592215,1e-9);
 close(E.ess(B([0.826021711113513,321.777763886293,321.957211956551],[0.17397828888649,58.0791386117595,58.1312091074745]),'elir'),458.4742573127825,1e-9);
 close(E.ess(N(1,[0.200314490546545,5.02880775353515,0.053347053455209],[0.184733432260364,4.9861778058814,0.0426701298050324],[0.064303224925225,5.00275335899124,0.143020768365798],[0.050648852267866,4.92839072756179,0.0532488633832323],[0.5,4.99953462302813,1]),'elir'),92.32844675901578,1e-9);
});
test('T14 B2 MAP mixture = RBesT 1.12-0 automixfit (default 4000 draws, AIC k = 6, beta a,b > 1, R parity)',()=>{
 // Requirement = RBesT 1.12-0 automixfit() on gMAP draws (source: automixfit, EM_bmm_ab, gMAP formals): Nc = 1..4
 // chosen by AIC(k = 6); EM_bmm_ab constrain_gt1 = TRUE (every a, b > 1); gMAP default draws 4 chains x (6000 - 2000)
 // / thin 4 = 4000. Parity: bin_k1_p0.05_s0.0 (r = 5, n = 100), RBesT automixfit on the oracle's 80,000 draws ->
 // robustify(w = 0.2, mean = 0.5) Morita ESS 9.03176304229849 (validation/reference, RBesT 1.12-0); PREREG B2 10 %.
 const model=E.gMAP({family:'binomial',data:[{r:5,n:100}],tauScale:1,betaMean:0,betaSD:2});
 const mix=E.fitMixture(model);assert.equal(mix.fit.draws,4000,'default draws');
 for(const c of mix.comps)assert.ok(c.a>1&&c.b>1,'constrain_gt1 violated: a='+c.a+' b='+c.b);
 for(const c of mix.fit.candidates)close(c.aic,-2*c.logLikelihood+6*(3*c.K-1),1e-12);
 const big=E.fitMixture(model,{draws:80000});for(const c of big.comps)assert.ok(c.a>1&&c.b>1,'constrain_gt1 violated (80000)');
 const ess=E.ess(E.robustify(big,.2,.5),'morita');assert.ok(Math.abs(ess/9.03176304229849-1)<=.10,'Morita '+ess+' vs R 9.0318');
});
test('T15 B2 normal MAP mixture = RBesT automixfit (EM_msmm start, EM_mnmm), R parity on cont_k10_m0_s0.2',()=>{
 // cont_k10_m0_s0.2: y_i = 0.2 qnorm((i - 0.5)/10), se = 1/sqrt(50), tau ~ HN(0.5), beta ~ N(0, 10), sigma = 1.
 // RBesT automixfit on the oracle's 80,000 draws -> robustify(0.2, MAP mean, sigma 1) Morita 68.8807253024347.
 const data=Array.from({length:10},(_,i)=>({y:.2*E.normalQuantile((i+.5)/10),se:1/Math.sqrt(50)}));
 const model=E.gMAP({family:'normal',data,tauScale:.5,betaMean:0,betaSD:10,sigma:1}),mix=E.fitMixture(model,{draws:80000});
 for(const c of mix.fit.candidates)close(c.aic,-2*c.logLikelihood+6*(3*c.K-1),1e-12);
 const sm=E.summary(mix),ess=E.ess(E.robustify(mix,.2,sm.mean,1,1),'morita');assert.ok(Math.abs(ess/68.8807253024347-1)<=.10,'Morita '+ess+' vs R 68.88');
});
test('T16 B2 automixfit start uses RBesT draw indices x[ind + k - 1], k = 1..Nc (normal parity cont_k1_m5_s0.2)',()=>{
 // RBesT EM_bmm_ab / EM_msmm: knnInit mu[k] = mean(x[ind + k - 1]) for k in seq(Nc), ind = seq(1, N - Nc, length = 50).
 // cont_k1_m5_s0.2: y = 5, se = 1/sqrt(50), tau ~ HN(0.5), beta ~ N(0, 10), sigma 1; RBesT automixfit on the oracle's
 // 80,000 draws -> robustify(0.2, MAP mean, sigma 1) Morita 14.554318424481 (validation/reference); PREREG B2 10 %.
 const model=E.gMAP({family:'normal',data:[{y:5,se:1/Math.sqrt(50)}],tauScale:.5,betaMean:0,betaSD:10,sigma:1}),mix=E.fitMixture(model,{draws:80000});
 const ess=E.ess(E.robustify(mix,.2,E.summary(mix).mean,1,1),'morita');assert.ok(Math.abs(ess/14.554318424481-1)<=.10,'Morita '+ess+' vs R 14.554');
});
test('T17 B2 normal parity cont_k10_m5_s0.2 (R automixfit Morita 71.8077405764314)',()=>{
 const data=Array.from({length:10},(_,i)=>({y:5+.2*E.normalQuantile((i+.5)/10),se:1/Math.sqrt(50)}));
 const model=E.gMAP({family:'normal',data,tauScale:.5,betaMean:0,betaSD:10,sigma:1}),mix=E.fitMixture(model,{draws:80000});
 const ess=E.ess(E.robustify(mix,.2,E.summary(mix).mean,1,1),'morita');assert.ok(Math.abs(ess/71.8077405764314-1)<=.10,'Morita '+ess+' vs R 71.81');
});
console.log(`${passed}/${total} PASS; page=${page}`);process.exitCode=passed===total?0:1;
