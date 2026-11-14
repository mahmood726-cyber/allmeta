// Deterministic corpus. Run from any directory; paths are relative to this file.
import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
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
// Fixed large output ensures the planted 1e-6 relative defect exceeds the
// max(1, |R|) denominator tolerance regardless of random corpus ordering.
add("sdFromSE",{se:100,n:100});
writeFileSync(new URL("cases.json",import.meta.url),JSON.stringify(cases,null,2)+"\n");
const planted=structuredClone(cases);
planted[planted.length-1].js.value*=1+1e-6;
writeFileSync(new URL("cases.planted.json",import.meta.url),JSON.stringify(planted,null,2)+"\n");
console.log(`Generated ${cases.length} cases (seed 20261020); planted exactly one numerical defect.`);
