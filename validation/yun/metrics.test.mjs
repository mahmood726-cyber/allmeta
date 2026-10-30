import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {automatedScore,assignedArms,scoreItem,run,literalNumbers} from "./run.mjs";

// Synthetic fixtures only; no benchmark annotations or article files are opened.
const item={id:"synthetic",pmcid:1,split:"DEV",outcome:"death",outcome_type:"binary",
  intervention:"Drug A",comparator:"Placebo",intervention_events:8,intervention_group_size:98,
  comparator_events:12,comparator_group_size:100};
const candidate=()=>({kind:"counts",values:{arms:[{events:8,n:98,label:"DRUG-A"},{events:12,n:100,label:"placebo"}]}});

test("PC-EXACT requires every number; PER-VALUE counts numbers",()=>{
  const c=candidate();
  assert.deepEqual(automatedScore(item,c),{pcExact:true,perValue:{correct:4,total:4}});
  c.values.arms[0].events=9;
  assert.deepEqual(automatedScore(item,c),{pcExact:false,perValue:{correct:3,total:4}});
});

test("PC-EXACT rejects numbers assigned to the wrong labelled arms",()=>{
  const c=candidate();
  [c.values.arms[0].label,c.values.arms[1].label]=[c.values.arms[1].label,c.values.arms[0].label];
  assert.deepEqual(automatedScore(item,c),{pcExact:false,perValue:{correct:0,total:4}});
  // Planted defect: matching the arm multiset ignores labels and falsely passes.
  const ignoresAssignment=(i,result)=>{
    const key=a=>`${a.events}/${a.n}`;
    return result.values.arms.map(key).sort().join()===
      [{events:i.intervention_events,n:i.intervention_group_size},{events:i.comparator_events,n:i.comparator_group_size}].map(key).sort().join();
  };
  const swappedArmGate=scorer=>scorer(item,c)===false;
  assert.equal(swappedArmGate((i,x)=>automatedScore(i,x).pcExact),true);
  assert.equal(swappedArmGate(ignoresAssignment),false,"the planted scorer must fail the gate");
});

test("label/cue overlap assigns reversed printed arms without consulting gold",()=>{
  const c=candidate();c.values.arms.reverse();
  assert.equal(automatedScore(item,c).pcExact,true);
  c.armCues=c.values.arms.map(a=>({text:a.label}));
  c.values.arms.forEach(a=>delete a.label);
  assert.equal(automatedScore(item,c).pcExact,true);
  assert.deepEqual(assignedArms({...item,intervention_events:999},c),assignedArms(item,c));
});

test("ties and no overlap retain printed order",()=>{
  for(const label of ["unrelated","Drug A Placebo",""]){
    const c=candidate();c.values.arms.forEach(a=>a.label=label);
    assert.equal(automatedScore(item,c).pcExact,true);
    c.values.arms.reverse();
    assert.equal(automatedScore(item,c).pcExact,false);
  }
});

test("no candidate and missing text fail with all gold numbers in the denominator",()=>{
  const absent=scoreItem(item,"No results.",{candidates:[]});
  assert.equal(absent.pcExact,false);
  assert.deepEqual(absent.perValue,{correct:0,total:4});
  const missing=scoreItem(item,null);
  assert.equal(missing.status,"NO_TEXT");
  assert.deepEqual(missing.perValue,{correct:0,total:4});
  assert.equal(missing.pcExact,false);
});

test("only rank 1 supplies the automated answer even when recall finds gold later",()=>{
  const text="Death: 3/40 versus 5/41. Death: 8/98 versus 12/100.";
  const nums=literalNumbers(text);
  const make=offset=>({kind:"counts",values:{arms:[{events:nums[offset].value,n:nums[offset+1].value},
    {events:nums[offset+2].value,n:nums[offset+3].value}]},spans:Object.fromEntries(
      ["arms.0.events","arms.0.n","arms.1.events","arms.1.n"].map((key,i)=>[key,nums[offset+i].span]))});
  const r=scoreItem(item,text,{candidates:[make(0),make(4)]});
  assert.equal(r.status,"PASS");
  assert.ok(r.rank>1);
  assert.equal(r.pcExact,false);
  assert.deepEqual(r.perValue,{correct:0,total:4});
});

test("continuous denominators include both group sizes; rank 2 cannot complete rank 1",()=>{
  const ci={...item,outcome_type:"continuous",intervention_mean:70,intervention_standard_deviation:9,
    intervention_group_size:50,comparator_mean:72,comparator_standard_deviation:10,comparator_group_size:51};
  const c={kind:"mean_sd",values:{mean:70,sd:9},cue:"Drug A"};
  assert.deepEqual(automatedScore(ci,c),{pcExact:false,perValue:{correct:2,total:6}});
  const r=scoreItem(ci,"Drug A mean 70 (SD 9); Placebo mean 72 (SD 10).");
  assert.equal(r.status,"PASS");
  assert.equal(r.pcExact,false);
  assert.deepEqual(r.perValue,{correct:2,total:6});
  const full={kind:"mean_sd",values:{arms:[{mean:70,sd:9,n:50,label:"Drug A"},{mean:72,sd:10,n:51,label:"Placebo"}]}};
  assert.equal(automatedScore(ci,full).pcExact,true);
  full.values.arms[1].n=52;
  assert.deepEqual(automatedScore(ci,full),{pcExact:false,perValue:{correct:5,total:6}});
  assert.deepEqual(automatedScore(ci,{...c,values:{mean:72,sd:10},cue:"PLACEBO"}),{pcExact:false,perValue:{correct:2,total:6}});
});

test("runner excludes only incomplete gold, reports all three metrics and licence denominators",()=>{
  const dir=mkdtempSync(join(tmpdir(),"yun-metrics-"));
  try{
    const data=join(dir,"data.json"),licences=join(dir,"licences.json"),out=join(dir,"results.json");
    writeFileSync(data,JSON.stringify([item,{...item,id:"missing",pmcid:2},{...item,id:"empty",intervention_events:""}]));
    writeFileSync(licences,JSON.stringify({PMC1:"cc by",PMC2:"other"}));
    writeFileSync(join(dir,"PMC1.md"),"Death occurred in 8/98 in the Drug A group and 12/100 in the placebo group.");
    const lines=[],r=run("DEV",{data,licences,texts:dir,out,log:l=>lines.push(l)});
    assert.deepEqual(r.summary.pcExact.binary,{pass:1,N:2});
    assert.deepEqual(r.summary.perValue.binary,{correct:4,total:8});
    assert.deepEqual(r.summary.binary,{pass:1,N:2});
    assert.equal(r.summary.goldIncomplete,1);
    assert.equal(r.summary.noText,1);
    assert.deepEqual(r.byLicence.other.pcExact.binary,{pass:0,N:1});
    const summary=lines.filter(l=>l.startsWith("YUN "));
    assert.match(summary[0],/^YUN DEV PC-EXACT binary=1\/2 continuous=0\/0/);
    assert.match(summary[1],/^YUN DEV RECALL binary=1\/2/);
    assert.equal(summary[2],"YUN DEV PER-VALUE binary=4/8 continuous=0/0");
    assert.equal(summary[3],"YUN NOTE: only PC-EXACT is comparable to Yun et al. 2024 GPT-4 per-comparison exact match (65.5% binary / 48.7% continuous, TEST split)");
  }finally{rmSync(dir,{recursive:true,force:true});}
});
