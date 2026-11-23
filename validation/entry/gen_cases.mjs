// Deterministic corpus. Run from any directory; paths are relative to this file.
import {createRequire} from "node:module";
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
const require=createRequire(import.meta.url),A=require("../../shared/alm-entry.js");
let seed=20261020;
function random(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
const cases=[];
function add(fn,args){cases.push({id:String(cases.length+1).padStart(6,"0"),fn,args,js:A[fn](args)});}
const ns=[2,3,5,10,25,59,60,61,100,500,5000],levels=[.90,.95,.99];
const mean=["luo/wan/shi","hozo2005","wan2014","bland2015","luo2016","walter2007"];
const sd=["luo/wan/shi","hozo2005","wan2014","bland2015","shi2020","walter2007"];
// Cartesian product includes methods unavailable in a scenario: nulls must
// match R NA, never be silently filled by another method.
for(const m of mean)for(const s of sd)for(const scenario of [1,2,3])for(const n of ns)for(const magnitude of [1e-9,1,1e9]){
  const mid=(2+random())*magnitude,width=(.3+random())*magnitude;
  const args={median:mid,n,method:[m,s]};
  if(scenario!==2)Object.assign(args,{min:mid-2*width,max:mid+2*width});
  if(scenario!==1)Object.assign(args,{q1:mid-width,q3:mid+width});
  add("convertFivenum",args);
}
for(const n of ns)for(const scenario of [1,2,3])for(const transf of [true,false]){
  const args={median:Math.exp(2),n,dist:"lnorm",transf};
  if(scenario!==2)Object.assign(args,{min:Math.exp(1),max:Math.exp(3)});
  if(scenario!==1)Object.assign(args,{q1:Math.exp(1.5),q3:Math.exp(2.5)});
  add("convertFivenum",args);
}
// Non-symmetric and rejected cases exercise the actual default test branch.
for(const n of ns)for(const test of [true,false])for(const scenario of [1,2,3]){
  const args={median:2,n,test};
  if(scenario!==2)Object.assign(args,{min:1,max:10});
  if(scenario!==1)Object.assign(args,{q1:1.5,q3:9});
  add("convertFivenum",args);
}
for(const args of [
  {min:1,median:2,max:3},{q1:1,median:2,q3:3},{min:1,q1:2,median:3,q3:4,max:5},
  {min:1,max:3,n:10},{q1:1,q3:3,n:10},{min:1,q1:2,q3:4,max:5,n:10},
  {min:1,q1:2,median:3,max:5,n:25},{median:2,n:25},
  {min:2,median:2,max:2,n:10},{min:1,median:2,max:3,n:15,method:"hozo2005"},
  {min:1,median:2,max:3,n:70,method:"hozo2005"},{min:1,median:2,max:3,n:71,method:"hozo2005"}
])add("convertFivenum",args);
for(const n of ns)for(const level of levels)for(const magnitude of [1e-12,1e-6,1,1e6,1e12])for(let repeat=0;repeat<3;repeat++){
  const center=(random()-.5)*magnitude,width=(.1+random())*magnitude;
  const lo=center-width,hi=center+width;
  add("seFromCI",{est:center,lo,hi,level,ratio:false});
  add("estFromCI",{lo,hi,ratio:false});
  add("sdFromCI",{lo,hi,n,level});
  add("sdFromSE",{se:width,n});
  add("eventsFromPercent",{pct:100*random(),n});
  add("seFromP",{est:center||magnitude,p:[.00001,.01,.2,.8][repeat%4],ratio:false});
  const logCenter=(random()-.5)*10,logWidth=.01+random()*2,ratioArgs={est:Math.exp(logCenter),lo:Math.exp(logCenter-logWidth),hi:Math.exp(logCenter+logWidth),ratio:true,level};
  add("seFromCI",ratioArgs);add("estFromCI",ratioArgs);
  add("seFromP",{est:Math.exp(logCenter),p:[1e-16,.02,.5][repeat],ratio:true});
}
// Cluster-randomised trials (Cochrane Handbook v6.5 §23.1.4): DE = 1 + (M - 1) * ICC with M given or total / clusters,
// or a reported DE; events and totals divided by DE, an SE multiplied by sqrt(DE).
for(const m of [1,1.5,2,5.7,10,25,60,500])for(const icc of [0,1e-4,.005,.02,.05,.2,.5,1]){
  add("designEffect",{m,icc});
  const n=Math.max(1,Math.round(m*(2+random()*40))),events=Math.floor(random()*(n+1));
  add("clusterCounts",{events,n,m,icc});
  add("clusterSE",{se:(.01+random())*[1e-6,1,1e3][Math.floor(random()*3)],m,icc});
}
for(const k of [2,5,12,45,91,400])for(const icc of [.01,.05,.3]){
  const total=k*Math.round(2+random()*30);
  add("designEffect",{k,total,icc});
  add("clusterCounts",{events:Math.floor(random()*(total+1)),n:total,k,total,icc});
}
for(const designEffect of [1,1.02,1.5,2.75,10])add("clusterCounts",{events:86,n:125,designEffect}),add("clusterSE",{se:.25,designEffect});
// Fixed tiny output (about 5.1e-13): a 1e-6 relative error is about 5e-19 absolute, which the former
// max(1, |R|) comparator could never detect. cases.planted-tiny.json must FAIL the relative gate.
add("seFromCI",{lo:1e-12,hi:3e-12,level:.95,ratio:false});
const tinyIndex=cases.length-1;
// Fixed large output for the original planted copy.
add("sdFromSE",{se:100,n:100});
const write=(name,corpus)=>writeFileSync(new URL(name,import.meta.url),JSON.stringify(corpus,null,2)+"\n");
write("cases.json",cases);
const planted=structuredClone(cases);
planted[planted.length-1].js.value*=1+1e-6;
write("cases.planted.json",planted);
const plantedTiny=structuredClone(cases);
plantedTiny[tinyIndex].js.value*=1+1e-6;
write("cases.planted-tiny.json",plantedTiny);
// Planted FORMULA defect: outputs recomputed by a copy of alm-entry.js with one coefficient changed
// (Luo 2018 IQR weight 0.7 + 0.39/n -> 0.7 + 0.40/n), so the gate is shown to catch an error that
// propagates through A[fn], not only an edited stored number. cases.planted-formula.json must FAIL.
const entryPath=fileURLToPath(new URL("../../shared/alm-entry.js",import.meta.url));
const source=readFileSync(entryPath,"utf8"),perturbed=source.replace("weight=.7+.39/n","weight=.7+.40/n");
if(perturbed===source)throw new Error("planted formula coefficient not found in alm-entry.js");
const sandbox={module:{exports:{}},require:createRequire(entryPath),TextEncoder};
vm.runInNewContext(perturbed,sandbox,{filename:"alm-entry.planted-formula.js"});
const B=sandbox.module.exports;
write("cases.planted-formula.json",cases.map(c=>({...c,js:JSON.parse(JSON.stringify(B[c.fn](structuredClone(c.args))))})));
// Planted DESIGN-EFFECT defect: DE = 1 + (M - 1) * ICC perturbed to 1 + M * ICC in a copy of alm-entry.js.
// cases.planted-de.json must FAIL.
const perturbedDE=source.replace("1+(m-1)*a.icc","1+m*a.icc");
if(perturbedDE===source)throw new Error("planted design-effect formula not found in alm-entry.js");
const sandboxDE={module:{exports:{}},require:createRequire(entryPath),TextEncoder};
vm.runInNewContext(perturbedDE,sandboxDE,{filename:"alm-entry.planted-de.js"});
const D=sandboxDE.module.exports;
write("cases.planted-de.json",cases.map(c=>({...c,js:JSON.parse(JSON.stringify(D[c.fn](structuredClone(c.args))))})));
console.log(`Generated ${cases.length} cases (seed 20261020); planted copies: one stored value (large), one stored value (1e-12 scale), one formula coefficient, one design-effect formula.`);
