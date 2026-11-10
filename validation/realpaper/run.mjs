import {createRequire} from "node:module";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve,basename,dirname,join} from "node:path";
import {pathToFileURL} from "node:url";
const require=createRequire(import.meta.url),A=require("../../shared/alm-entry.js");
export const categories=["NOT_FOUND","WRONG_VALUE","WRONG_SPAN","WRONG_MEASURE","SPLIT_ACROSS_SENTENCES","TABLE_LAYOUT","OTHER"];
// Independent of extraction: this check must detect defects in the extractor's mapping.
export function numeric(text){
  return Number(text.replace(/[\u2212\u2010-\u2015]/g,"-").replace(/[\u00b7\u22c5]/g,".").replace(/,/g,""));
}
export function literalNumbers(text){
  // Exclude tag attributes, but keep source offsets. No entity decoding or inferred totals.
  const visible=text.replace(/<[^>]*>/g,m=>" ".repeat(m.length));
  return [...visible.matchAll(/(?<![\w.])[-+\u2212\u2010-\u2015]?(?:\d{1,3}(?:,\d{3})+(?:[.\u00b7\u22c5]\d+)?|\d+(?:[.\u00b7\u22c5]\d+)?|[.\u00b7\u22c5]\d+)(?!\w|\.\d)/gu)].map(m=>({value:numeric(m[0]),text:m[0],span:[m.index,m.index+m[0].length]}));
}
export function fields(candidate){
  return candidate.kind==="counts"?candidate.values.arms.flatMap((a,i)=>[["arms."+i+".events",a.events],["arms."+i+".n",a.n]]):Object.entries(candidate.values);
}
export function validSpans(text,candidate){
  const printed=literalNumbers(text);
  return fields(candidate).every(([key,value])=>{
    const span=candidate.spans?.[key];
    return Array.isArray(span)&&span.length===2&&span.every(Number.isInteger)&&printed.some(n=>n.span[0]===span[0]&&n.span[1]===span[1]&&n.value===value);
  });
}
function valuesMatch(c,e,kind){
  if(kind==="effect_ci")return ["effect","lo","hi"].every(k=>c.values[k]===e[k]);
  const key=a=>a.events+"/"+a.n;
  return c.values.arms.length===2&&JSON.stringify(c.values.arms.map(key).sort())===JSON.stringify([{events:e.ai,n:e.n1i},{events:e.ci,n:e.n2i}].map(key).sort());
}
export function scoreRow(row,extracted){
  const expected=row.expected,nums=literalNumbers(row.text);
  const result=extracted||A.extract(row.text,row.kind==="counts"?"binary2x2":"generic",{outcome:row.outcome});
  const keys=row.kind==="counts"?["ai","n1i","ci","n2i"]:["effect","lo","hi"];
  const absent=keys.filter(k=>!nums.some(n=>n.value===expected[k]));
  if(absent.length)return {id:row.id,status:"NOT_IN_TEXT",missing:absent,candidateCount:result.candidates.length,rank:null};
  const candidates=result.candidates.filter(c=>c.kind===row.kind);
  const sameValues=candidates.filter(c=>valuesMatch(c,expected,row.kind));
  const sameSpans=sameValues.filter(c=>validSpans(row.text,c));
  // A named measure is required to match whenever the source states a measure.
  const stated=/\b(?:RR|OR|HR|IRR|SMD|MD|RD|relative risk|risk ratio|odds ratio|hazard ratio|rate ratio|mean difference|risk difference|difference)\b/i.test(row.text);
  const correct=sameSpans.filter(c=>row.kind!=="effect_ci"||!stated||c.measure===expected.scale);
  const base={id:row.id,candidateCount:result.candidates.length,matchingCandidates:correct.length,rank:correct.length?1+result.candidates.findIndex(c=>correct.includes(c)):null};
  if(correct.length)return {...base,status:result.candidates.length>1?"AMBIGUOUS_PASS":"UNIQUE_PASS"};
  if(sameValues.length&&!sameSpans.length)return {...base,status:"WRONG_SPAN"};
  if(sameSpans.length)return {...base,status:"WRONG_MEASURE"};
  if(candidates.length)return {...base,status:"WRONG_VALUE"};
  if(/<table|\t| {2,}/i.test(row.text))return {...base,status:"TABLE_LAYOUT"};
  if(/\b[nN]\s*=\s*\d/.test(row.text)&&/[.!?]\s+[A-Z]/.test(row.text))return {...base,status:"SPLIT_ACROSS_SENTENCES"};
  return {...base,status:"NOT_FOUND"};
}
export function run(file){
  const data=JSON.parse(readFileSync(file,"utf8")),rows=Array.isArray(data)?data:data.rows;
  const results=rows.map(row=>{try{return scoreRow(row);}catch(e){return {id:row.id,status:"OTHER",error:e.message};}});
  const count=status=>results.filter(r=>r.status===status).length;
  const split=basename(file,".json"),unique=count("UNIQUE_PASS"),ambiguous=count("AMBIGUOUS_PASS"),notInText=count("NOT_IN_TEXT");
  const ranked=results.filter(r=>r.rank!==null&&r.rank!==undefined),rank1=ranked.filter(r=>r.rank===1).length;
  const summary={split,unique,ambiguous,pass:unique+ambiguous,N:rows.length-notInText,not_in_text:notInText,categories:Object.fromEntries(categories.map(c=>[c,count(c)])),ranked:ranked.length,meanRank:ranked.length?ranked.reduce((s,r)=>s+r.rank,0)/ranked.length:null,rank1,rank1Percent:ranked.length?100*rank1/ranked.length:null};
  results.forEach(r=>console.log(`${r.status} ${r.id} candidates=${r.candidateCount} rank=${r.rank??"NA"}${r.missing?" missing="+r.missing.join(","):""}`));
  console.log(`REALPAPER ${split} unique=${unique} ambiguous=${ambiguous} pass=${unique+ambiguous}/${summary.N} not_in_text=${notInText}`);
  for(const c of categories)console.log(`${c} ${summary.categories[c]}`);
  console.log(`RANK mean=${summary.meanRank===null?"NA":summary.meanRank.toFixed(4)} rank1=${rank1}/${ranked.length} percent=${summary.rank1Percent===null?"NA":summary.rank1Percent.toFixed(2)}% (correctly offered rows)`);
  writeFileSync(join(dirname(file),split+".results.json"),JSON.stringify({summary,results},null,2)+"\n");
  return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(!process.argv[2]){console.error("Usage: node run.mjs <fixtures.json>");process.exitCode=1;}
  else {const summary=run(resolve(process.argv[2]));if(summary.categories.WRONG_VALUE||summary.categories.OTHER)process.exitCode=1;}
}
