import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const A=createRequire(import.meta.url)("../../../../shared/alm-entry.js");
let seed=0x41f13;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const integer=(min,max)=>min+Math.floor(random()*(max-min+1));
const styles=[
  ...["-","‐","‑","‒","–","—","―"].map(d=>({kind:"ci",format:(e,l,h)=>`${e} (${l}${d}${h})`})),
  {kind:"ci",format:(e,l,h)=>`${e} [${l}, ${h}]`},
  {kind:"ci",format:(e,l,h)=>`${e} (${l} to ${h})`},
  {kind:"ci",format:(e,l,h)=>`${e}; 95% CI ${l} to ${h}`},
  {kind:"ci",format:(e,l,h)=>`${e} (${l}–${h})`.replaceAll("-","−")},
  ...["·","⋅"].map(dot=>({kind:"ci",format:(e,l,h)=>`${e} (${l}–${h})`.replaceAll(".",dot)})),
  {kind:"ci",format:(e,l,h)=>`${e} (${l}–${h})`.replace(/\d/g,d=>String.fromCharCode(0xff10+Number(d)))},
  {kind:"ci",decimal:"comma",format:(e,l,h)=>`${e} (${l} to ${h})`.replaceAll(".",",")},
  {kind:"ci",format:(e,l,h)=>`${e}\u00c2\u00a0(${l}\u2009to\u202f${h})`},
  {kind:"fraction"},{kind:"n_pct"},{kind:"of"},{kind:"mean_sd"},
  {kind:"median_iqr"},{kind:"median_range"},{kind:"p",op:"="},{kind:"p",op:"<"},
  {kind:"percent"},{kind:"number",decimal:"comma"}
];
function checkSpans(text,values,spans,decimal){
  for(const [key,value] of Object.entries(values)){
    const span=spans[key];assert.ok(span,`missing span ${key}: ${text}`);
    assert.ok(Number.isInteger(span[0])&&span[1]>span[0]&&span[1]<=text.length);
    const printed=text.slice(...span);
    const parsed=Number(printed.replace(/[０-９]/g,d=>String(d.charCodeAt(0)-0xff10)).replace(/[−‐‑‒–—―]/g,"-").replace(/[·⋅]/g,".").replaceAll(",",decimal==="comma"?".":","));
    assert.equal(parsed,value,`${key}: ${printed} in ${text}`);
  }
}
function verify(i,style){
  const e=integer(-900,900)/10,lo=Number((e-integer(1,80)/10).toFixed(1)),hi=Number((e+integer(1,80)/10).toFixed(1));
  const n=integer(20,900),events=integer(0,n),pct=Number((100*events/n).toFixed(1)),mean=integer(-100,900)/10,sd=integer(1,100)/10;
  let text,expected,extractText,expectedValues,schema="generic";
  const context={decimal:style.decimal};
  switch(style.kind){
    case "ci":text=style.format(e,lo,hi);expected={kind:"est_ci",est:e,lo,hi,...(text.includes("95%")?{level:.95}:{})};extractText="MD "+text;expectedValues={effect:e,lo,hi};break;
    case "fraction":text=`${events}/${n}`;expected={kind:"fraction",num:events,den:n};extractText=text;schema="proportion";expectedValues={"arms.0.events":events,"arms.0.n":n};break;
    case "n_pct":text=`${events}/${n} (${pct}%)`;expected={kind:"n_pct",num:events,den:n,pct};extractText=text;schema="proportion";expectedValues={"arms.0.events":events,"arms.0.n":n};break;
    case "of":extractText=`${events} of ${n}`;schema="proportion";expectedValues={"arms.0.events":events,"arms.0.n":n};break;
    case "mean_sd":text=`${mean} ± ${sd}`;context.header="SD";expected={kind:"mean_sd",mean,spread:sd,dispersion:"SD",ambiguousDispersion:false};extractText="Mean "+text;schema="continuous";expectedValues={mean,sd};break;
    case "median_iqr":text=`median ${e} (IQR ${lo}–${hi})`;expected={kind:"median_iqr",median:e,q1:lo,q3:hi};extractText=text;schema="continuous";expectedValues={median:e,q1:lo,q3:hi};break;
    case "median_range":text=`median ${e}, range ${lo} to ${hi}`;expected={kind:"median_range",median:e,min:lo,max:hi};break;
    case "p":text=`p ${style.op} ${integer(1,999)/1000}`;expected={kind:"p",op:style.op,value:Number(text.split(" ").at(-1))};break;
    case "percent":text=`${pct}%`;expected={kind:"percent",value:pct};break;
    case "number":text=String(mean).replace(".",",");expected={kind:"number",value:mean};break;
  }
  if(text){
    const parsed=A.parseCell(text,context);assert.deepEqual(parsed,expected,`case ${i}: ${text}`);
    const numeric=Object.fromEntries(Object.entries(expected).filter(([k,v])=>typeof v==="number"&&k!=="level"));
    checkSpans(text,numeric,parsed.spans,style.decimal);
    assert.ok(A.RULES.some(r=>`${r.id}@${r.version}`===parsed.rule));
  }
  if(extractText){
    const c=A.extract(extractText,schema,{decimal:style.decimal||"point"}).candidates[0];assert.ok(c,`case ${i}: ${extractText}`);
    if(c.kind!=="counts")assert.deepEqual(c.values,expectedValues);
    else assert.deepEqual(c.values.arms.map(a=>[a.events,a.n]),[[events,n]]);
    checkSpans(extractText,expectedValues,c.spans,style.decimal);
    for(const [key,span] of Object.entries(c.spans))assert.deepEqual(A.anchor(extractText,c.selectors[key]),span);
  }
}
test("seeded round trips cover every supported cell style and original spans",()=>{
  let passed=0;
  const total=styles.length*100;
  for(let i=0;i<total;i++){verify(i,styles[i%styles.length]);passed++;}
  console.log(`ROUNDTRIP ${passed}/${total}`);assert.equal(passed,total);assert.ok(total>=2000);
});
test("PLANTED DEFECT: round-trip oracle rejects a changed value and a shifted span",()=>{
  assert.throws(()=>checkSpans("−1·25",{value:-1.26},{value:[0,5]}));
  assert.throws(()=>checkSpans("−1·25",{value:-1.25},{value:[1,5]}));
});
