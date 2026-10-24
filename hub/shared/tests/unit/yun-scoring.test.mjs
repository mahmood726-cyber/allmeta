import test from "node:test";
import assert from "node:assert/strict";
import {scoreItem,literalNumbers} from "../../../../validation/yun/run.mjs";

// Synthetic items and texts written for this suite. No Yun article text is used here.
const binary=(ie,in_,ce,cn,extra={})=>({id:"t",pmcid:1,outcome:"death",outcome_type:"binary",intervention_events:ie,intervention_group_size:in_,comparator_events:ce,comparator_group_size:cn,...extra});
const continuous=(m1,s1,n1,m2,s2,n2)=>({id:"t",pmcid:1,outcome:"weight",outcome_type:"continuous",intervention_mean:m1,intervention_standard_deviation:s1,intervention_group_size:n1,comparator_mean:m2,comparator_standard_deviation:s2,comparator_group_size:n2});

test("binary pass ignores arm order and reports rank", () => {
  const text="Death occurred in 12/100 in the placebo group and 8/98 in the drug group.";
  const r=scoreItem(binary("8","98","12","100"),text);
  assert.equal(r.status,"PASS");assert.equal(r.rank,1);
});

test("gold incomplete is excluded, not scored", () => {
  assert.equal(scoreItem(binary("","98","12","100",{is_data_complete:"FALSE"}),"x").status,"GOLD_INCOMPLETE");
  assert.equal(scoreItem(binary("NR","98","12","100"),"x").status,"GOLD_INCOMPLETE");
});

test("planted wrong span and wrong value never pass", () => {
  const text="Death occurred in 12/100 in the placebo group and 8/98 in the drug group.";
  const real=scoreItem(binary("8","98","12","100"),text,undefined);
  assert.equal(real.status,"PASS");
  const c={kind:"counts",values:{arms:[{events:8,n:98},{events:12,n:100}]},spans:{"arms.0.events":[0,1],"arms.0.n":[50,52],"arms.1.events":[18,20],"arms.1.n":[21,24]}};
  assert.equal(scoreItem(binary("8","98","12","100"),text,{candidates:[c]}).status,"MISS");
  const wrong={...c,values:{arms:[{events:8,n:98},{events:13,n:100}]}};
  assert.equal(scoreItem(binary("8","98","12","100"),text,{candidates:[wrong]}).status,"MISS");
});

test("confusable counts only differing candidates ranked above gold", () => {
  const text="Death occurred in 3/40 versus 5/41. Mortality was 8/98 versus 12/100.";
  const r=scoreItem(binary("8","98","12","100"),text);
  assert.equal(r.status,"PASS");assert.equal(r.rank-1,r.confusable.length);
});

test("percent-only miss is categorised", () => {
  const r=scoreItem(binary("16","200","24","200"),"Death: 8% with drug versus 12% with placebo (n = 200 each).");
  assert.equal(r.status,"MISS");assert.equal(r.category,"PERCENT_ONLY");
});

test("continuous pass needs two distinct mean_sd candidates", () => {
  const text="Weight: drug mean 70.1 (SD 9.2); placebo mean 72.4 (SD 10.0).";
  const r=scoreItem(continuous("72.4","10","50","70.1","9.2","50"),text);
  assert.equal(r.status,"PASS");assert.equal(r.nPrinted,"none");
  const same=scoreItem(continuous("70.1","9.2","50","70.1","9.2","50"),text);
  assert.equal(same.status,"MISS");
});

test("table layout miss is categorised; p-value brackets do not hide numbers", () => {
  const text="Outcome      Drug         Placebo      p\nWeight       70.1±9.2     72.4±10.0    <0.05 (>0.05)\nHeight       1±2          3±4          <0.05 (>0.05)";
  assert.ok(literalNumbers(text).some(n=>n.value===72.4));
  const r=scoreItem(continuous("70.1","9.2","50","72.4","10","50"),text);
  assert.equal(r.status,"MISS");assert.equal(r.category,"IN_TABLE_LAYOUT");
});
