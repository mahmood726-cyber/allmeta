import {createRequire} from "node:module";
import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {numeric,fields} from "../realpaper/run.mjs";
const require=createRequire(import.meta.url),A=require("../../shared/alm-entry.js");
const here=dirname(fileURLToPath(import.meta.url));
// Same token grammar as validation/realpaper, but only real tags (<name ...>, </name>) are blanked:
// in these markdown tables "<0.05 (>0.05)" is a p-value, and /<[^>]*>/ would swallow whole table rows.
export function literalNumbers(text){
  const visible=text.replace(/<\/?[A-Za-z][^<>]*>/g,m=>" ".repeat(m.length));
  return [...visible.matchAll(/(?<![\w.])[-+−‐-―]?(?:\d{1,3}(?:,\d{3})+(?:[.·⋅]\d+)?|\d+(?:[.·⋅]\d+)?|[.·⋅]\d+)(?!\w|\.\d)/gu)].map(m=>({value:numeric(m[0]),text:m[0],span:[m.index,m.index+m[0].length]}));
}
export function validSpans(text,candidate){
  const printed=literalNumbers(text);
  return fields(candidate).every(([key,value])=>{
    const span=candidate.spans?.[key];
    return Array.isArray(span)&&span.length===2&&span.every(Number.isInteger)&&printed.some(n=>n.span[0]===span[0]&&n.span[1]===span[1]&&n.value===value);
  });
}
// Scoring rules: SCORING.md (frozen). Nothing here reads gold values before extraction has returned.
export const MISS=["PERCENT_ONLY","SD_SE_AMBIGUOUS","NOT_FOUND","IN_TABLE_LAYOUT","SPLIT_ACROSS_SENTENCES","OTHER"];
const BINARY=["intervention_events","intervention_group_size","comparator_events","comparator_group_size"];
const CONTINUOUS=["intervention_mean","intervention_standard_deviation","intervention_group_size","comparator_mean","comparator_standard_deviation","comparator_group_size"];
const num=s=>{const t=String(s??"").trim();return t===""?NaN:Number(t);};
export function gold(item){
  const keys=item.outcome_type==="binary"?BINARY:CONTINUOUS,v=Object.fromEntries(keys.map(k=>[k,num(item[k])]));
  if(!keys.every(k=>Number.isFinite(v[k])))return null;
  return item.outcome_type==="binary"
    ?{type:"binary",arms:[{events:v.intervention_events,n:v.intervention_group_size},{events:v.comparator_events,n:v.comparator_group_size}]}
    :{type:"continuous",arms:[{mean:v.intervention_mean,sd:v.intervention_standard_deviation,n:v.intervention_group_size},{mean:v.comparator_mean,sd:v.comparator_standard_deviation,n:v.comparator_group_size}]};
}
const armKey=a=>a.events+"/"+a.n;
const sameArms=(c,g)=>c.kind==="counts"&&c.values.arms.length===2&&JSON.stringify(c.values.arms.map(armKey).sort())===JSON.stringify(g.arms.map(armKey).sort());
const sameMeanSD=(c,a)=>c.kind==="mean_sd"&&c.values.mean===a.mean&&c.values.sd===a.sd;
const tokens=s=>new Set(String(s??"").toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]);
const cueText=c=>typeof c==="string"?c:c?.text??c?.value??"";
// Assignment uses names and returned cues only, never gold numbers or lower-ranked candidates.
export function assignedArms(item,candidate){
  if(!candidate)return [];
  const arms=candidate.kind==="counts"?candidate.values.arms:
    candidate.kind==="mean_sd"?(candidate.values.arms||[candidate.values]):[];
  if(!arms.length||arms.length>2)return [];
  const names=[tokens(item.intervention),tokens(item.comparator)];
  const overlap=(i,j)=>{
    const cues=[arms[i].label,cueText(arms[i].cue),cueText(candidate.armCues?.[i])];
    if(candidate.kind==="mean_sd"&&arms.length===1)cues.push(candidate.label,candidate.cue,...(candidate.facetEvidence?.arm||[]).map(cueText));
    return [...tokens(cues.filter(Boolean).join(" "))].filter(t=>names[j].has(t)).length;
  };
  if(arms.length===1)return overlap(0,1)>overlap(0,0)?[undefined,arms[0]]:[arms[0]];
  const printed=overlap(0,0)+overlap(1,1),swapped=overlap(0,1)+overlap(1,0);
  return swapped>printed?[arms[1],arms[0]]:arms;
}
export function automatedScore(item,candidate){
  const g=gold(item);
  if(!g)return {pcExact:null,perValue:{correct:0,total:0}};
  const arms=assignedArms(item,candidate),keys=g.type==="binary"?["events","n"]:["mean","sd","n"];
  const correct=g.arms.reduce((sum,a,i)=>sum+keys.filter(k=>arms[i]?.[k]===a[k]).length,0);
  const total=2*keys.length;
  return {pcExact:correct===total,perValue:{correct,total}};
}
const isTableLine=l=>/[|\t]/.test(l)||/\S {2,}\S.* {2,}\S/.test(l);
function lineOf(text,pos){const a=text.lastIndexOf("\n",pos-1)+1,b=text.indexOf("\n",pos);return text.slice(a,b<0?text.length:b);}
function sentences(text){return text.split(/(?<=[.;!?])\s+(?=[A-Z(])|\n/);}
function missCategory(text,g,candidates){
  const nums=literalNumbers(text),printed=v=>nums.some(n=>n.value===v),at=v=>nums.filter(n=>n.value===v).map(n=>n.span[0]);
  const pair=g.type==="binary"?a=>[a.events,a.n]:a=>[a.mean,a.sd];
  if(g.type==="binary"&&g.arms.some(a=>!printed(a.events)&&a.n>0&&[...text.matchAll(/(?<![\d.])(\d+(?:\.(\d+))?)\s*%/g)].some(m=>Math.abs(100*a.events/a.n-+m[1])<=.5*10**-((m[2]||"").length)+1e-9)))return "PERCENT_ONLY";
  if(g.type==="continuous"&&g.arms.every(a=>printed(a.mean))&&(g.arms.some(a=>!printed(a.sd))&&/\b(?:SE|SEM|standard error)\b/i.test(text)||candidates.some(c=>c.kind==="mean_sd"&&g.arms.some(a=>c.values.mean===a.mean&&c.values.sd!==a.sd))))return "SD_SE_AMBIGUOUS";
  if(g.arms.some(a=>pair(a).some(v=>!printed(v))))return "NOT_FOUND";
  if(g.arms.some(a=>at(pair(a)[0]).every(p=>isTableLine(lineOf(text,p)))))return "IN_TABLE_LAYOUT";
  const sents=sentences(text).map(s=>literalNumbers(s).map(n=>n.value));
  if(g.arms.some(a=>!sents.some(vs=>pair(a).every(v=>vs.includes(v)))))return "SPLIT_ACROSS_SENTENCES";
  return "OTHER";
}
function confusableCategory(c,g){
  if(c.kind==="median_iqr")return "MEDIAN_IQR";
  if(c.kind==="mean_sd")return g.arms.some(a=>a.mean===c.values.mean)?"SAME_MEAN_OTHER_SD":"OTHER_MEAN_SD";
  const keys=g.arms.map(armKey),shared=(c.values.arms||[]).filter(a=>keys.includes(armKey(a))).length;
  return shared===1?"ONE_ARM_GOLD":"OTHER_COUNTS";
}
// Score one item. `extracted` lets tests plant a result; otherwise the real extractor runs on the whole text.
export function scoreItem(item,text,extracted){
  const g=gold(item),base={id:item.id,pmcid:item.pmcid,type:item.outcome_type,...automatedScore(item)};
  if(!g)return {...base,status:"GOLD_INCOMPLETE",isDataComplete:item.is_data_complete};
  if(text===null||text===undefined)return {...base,status:"NO_TEXT"};
  const result=extracted||A.extract(text,g.type==="binary"?"binary2x2":"continuous",{outcome:item.outcome});
  const cs=result.candidates,count=cs.length;
  Object.assign(base,automatedScore(item,cs[0]));
  let rank=null,goldIdx=[],sdQuestion=false;
  if(g.type==="binary"){
    const i=cs.findIndex(c=>sameArms(c,g)&&validSpans(text,c));
    if(i>=0){rank=i+1;goldIdx=[i];}
  }else{
    const ok=a=>cs.map((c,i)=>sameMeanSD(c,a)&&validSpans(text,c)?i:-1).filter(i=>i>=0);
    const [x,y]=g.arms.map(ok);let best=null;
    for(const i of x)for(const j of y){
      if(i===j||JSON.stringify(cs[i].spans)===JSON.stringify(cs[j].spans))continue;
      if(!best||Math.max(i,j)<Math.max(...best))best=[i,j];
    }
    if(best){rank=Math.max(...best)+1;goldIdx=best;sdQuestion=best.some(i=>cs[i].dispersion!=="SD");}
  }
  const nums=literalNumbers(text),nPrinted=g.arms.filter(a=>nums.some(n=>n.value===a.n)).length;
  const extra=g.type==="continuous"?{nPrinted:nPrinted===2?"both":nPrinted?"one":"none"}:{};
  if(rank===null)return {...base,status:"MISS",category:missCategory(text,g,cs),candidateCount:count,rank:null,...extra};
  const above=cs.slice(0,rank-1).filter((c,i)=>!goldIdx.includes(i)&&(g.type==="binary"?!sameArms(c,g):!g.arms.some(a=>sameMeanSD(c,a))));
  return {...base,status:"PASS",candidateCount:count,rank,sdQuestion,confusable:above.map(c=>confusableCategory(c,g)),...extra};
}
export function run(split,{texts=join(here,"texts"),data=join(here,"data","annotated_rct_dataset.json"),licences=join(here,"licences.json"),out=null,log=console.log}={}){
  const items=JSON.parse(readFileSync(data,"utf8")).filter(x=>x.split===split);
  if(!items.length)throw new Error("No items for split "+split);
  const lic=JSON.parse(readFileSync(licences,"utf8")),group=x=>lic["PMC"+x.pmcid]==="cc by"?"cc by":"other";
  const cache=new Map(),textOf=pmcid=>{
    if(!cache.has(pmcid)){const f=join(texts,"PMC"+pmcid+".md");cache.set(pmcid,existsSync(f)?readFileSync(f,"utf8"):null);}
    return cache.get(pmcid);
  };
  const results=items.map(item=>{
    try{return {...scoreItem(item,textOf(item.pmcid)),licence:group(item)};}
    catch(e){return {id:item.id,pmcid:item.pmcid,type:item.outcome_type,...automatedScore(item),status:gold(item)?"ERROR":"GOLD_INCOMPLETE",error:e.message,licence:group(item)};}
  });
  for(const r of results){
    const bits=[r.status,"id="+r.id,"PMC"+r.pmcid,r.type,"lic="+(r.licence==="cc by"?"ccby":"other")];
    if(r.status==="PASS"||r.status==="MISS")bits.push("candidates="+r.candidateCount,"rank="+(r.rank??"NA"));
    if(r.category)bits.push("category="+r.category);
    if(r.confusable&&r.confusable.length)bits.push("confusable="+r.confusable.length+"("+[...new Set(r.confusable)].join(",")+")");
    if(r.sdQuestion)bits.push("sd_question");
    if(r.nPrinted)bits.push("n_printed="+r.nPrinted);
    if(r.status==="GOLD_INCOMPLETE")bits.push("is_data_complete="+r.isDataComplete);
    if(r.error)bits.push("error="+r.error);
    if(r.status!=="GOLD_INCOMPLETE")bits.push("pc_exact="+(r.pcExact?"PASS":"FAIL"),"per_value="+r.perValue.correct+"/"+r.perValue.total);
    log(bits.join(" "));
  }
  const summarise=rs=>{
    const eligible=rs.filter(r=>r.status!=="GOLD_INCOMPLETE");
    const ev=rs.filter(r=>r.status==="PASS"||r.status==="MISS"),pass=ev.filter(r=>r.status==="PASS");
    const of=t=>({pass:pass.filter(r=>r.type===t).length,N:eligible.filter(r=>r.type===t).length});
    const pcExact={},perValue={};
    for(const t of ["binary","continuous"]){
      const typed=eligible.filter(r=>r.type===t);
      pcExact[t]={pass:typed.filter(r=>r.pcExact).length,N:typed.length};
      perValue[t]={correct:typed.reduce((sum,r)=>sum+r.perValue.correct,0),total:typed.reduce((sum,r)=>sum+r.perValue.total,0)};
    }
    const cats={};for(const r of ev)if(r.category)cats[r.category]=(cats[r.category]||0)+1;
    const conf={};for(const r of pass)for(const c of r.confusable)conf[c]=(conf[c]||0)+1;
    return {binary:of("binary"),continuous:of("continuous"),pcExact,perValue,
      goldIncomplete:rs.filter(r=>r.status==="GOLD_INCOMPLETE").length,
      goldIncompleteFlagFalse:rs.filter(r=>r.status==="GOLD_INCOMPLETE"&&r.isDataComplete==="FALSE").length,
      noText:rs.filter(r=>r.status==="NO_TEXT").length,errors:rs.filter(r=>r.status==="ERROR").length,
      rank1:pass.length?100*pass.filter(r=>r.rank===1).length/pass.length:null,
      meanRank:pass.length?pass.reduce((s,r)=>s+r.rank,0)/pass.length:null,
      medianCandidates:ev.length?[...ev.map(r=>r.candidateCount)].sort((a,b)=>a-b)[Math.floor((ev.length-1)/2)]:null,
      confusableItems:pass.filter(r=>r.confusable.length).length,confusableCandidates:pass.reduce((s,r)=>s+r.confusable.length,0),
      sdQuestion:pass.filter(r=>r.sdQuestion).length,categories:Object.fromEntries(MISS.map(c=>[c,cats[c]||0])),confusableCategories:conf};
  };
  const fmt=v=>v===null?"NA":v.toFixed(v===Math.round(v)?0:2);
  const s=summarise(results);
  log(`YUN ${split} PC-EXACT binary=${s.pcExact.binary.pass}/${s.pcExact.binary.N} continuous=${s.pcExact.continuous.pass}/${s.pcExact.continuous.N} gold_incomplete=${s.goldIncomplete}`);
  log(`YUN ${split} RECALL binary=${s.binary.pass}/${s.binary.N} continuous=${s.continuous.pass}/${s.continuous.N} gold_incomplete=${s.goldIncomplete} rank1=${s.rank1===null?"NA":s.rank1.toFixed(1)}% mean_rank=${s.meanRank===null?"NA":s.meanRank.toFixed(2)} confusable=${s.confusableItems}`);
  log(`YUN ${split} PER-VALUE binary=${s.perValue.binary.correct}/${s.perValue.binary.total} continuous=${s.perValue.continuous.correct}/${s.perValue.continuous.total}`);
  log("YUN NOTE: only PC-EXACT is comparable to Yun et al. 2024 GPT-4 per-comparison exact match (65.5% binary / 48.7% continuous, TEST split)");
  log(`MISS ${MISS.map(c=>c+"="+s.categories[c]).join(" ")}`);
  log(`CONFUSABLE items=${s.confusableItems} candidates=${s.confusableCandidates} ${Object.entries(s.confusableCategories).map(([k,v])=>k+"="+v).join(" ")}`.trim());
  log(`NOTES no_text=${s.noText} errors=${s.errors} gold_incomplete_flag_false=${s.goldIncompleteFlagFalse} sd_question=${s.sdQuestion} continuous_with_n=0/${s.continuous.N} (continuous mode offers no group sizes) median_candidates=${fmt(s.medianCandidates)} rules=${A.RULES_VERSION}`);
  const byLicence={};
  for(const l of ["cc by","other"]){
    const b=summarise(results.filter(r=>r.licence===l));byLicence[l]=b;
    log(`LICENCE ${l==="cc by"?"ccby":"other"} PC-EXACT binary=${b.pcExact.binary.pass}/${b.pcExact.binary.N} continuous=${b.pcExact.continuous.pass}/${b.pcExact.continuous.N} RECALL binary=${b.binary.pass}/${b.binary.N} continuous=${b.continuous.pass}/${b.continuous.N} PER-VALUE binary=${b.perValue.binary.correct}/${b.perValue.binary.total} continuous=${b.perValue.continuous.correct}/${b.perValue.continuous.total} gold_incomplete=${b.goldIncomplete} no_text=${b.noText}`);
  }
  if(out)writeFileSync(out,JSON.stringify({split,rulesVersion:A.RULES_VERSION,summary:s,byLicence,results},null,2)+"\n");
  return {summary:s,byLicence,results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),split=args.find(a=>!a.startsWith("--")&&args[args.indexOf(a)-1]!=="--texts"&&args[args.indexOf(a)-1]!=="--out");
  const opt=k=>{const i=args.indexOf(k);return i>=0?resolve(args[i+1]):undefined;};
  if(!split||!["DEV","TEST"].includes(split)){console.error("Usage: node validation/yun/run.mjs <DEV|TEST> [--texts dir] [--out results.json]");process.exitCode=2;}
  else{
    const r=run(split,{...(opt("--texts")?{texts:opt("--texts")}:{}),out:opt("--out")||null});
    if(r.summary.errors)process.exitCode=1;
  }
}
