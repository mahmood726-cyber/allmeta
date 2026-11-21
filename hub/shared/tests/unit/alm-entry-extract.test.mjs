import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {validSpans,scoreRow,literalNumbers} from "../../../../validation/realpaper/run.mjs";
const A=createRequire(import.meta.url)("../../../../shared/alm-entry.js");

// Synthetic examples written for this suite. No dev paper text is used here.
const effects=[
  ["RR 0.72, 95% CI 0.51-0.94","RR",.72,.51,.94],
  ["Risk ratio 0·72 (95% confidence interval 0·51–0·94)","RR",.72,.51,.94],
  ["Odds ratio: 1.24 [95% CI: 1.02 to 1.61]","OR",1.24,1.02,1.61],
  ["HR = 0.83; CI: [0.64; 1.07]","HR",.83,.64,1.07],
  ["Mean difference −2.4 (95% CI −3.8 to −1.0)","MD",-2.4,-3.8,-1],
  ["SMD -0.44 (90% CI -0.71 to -0.17)","SMD",-.44,-.71,-.17],
  ["IRR 1.42 (99% CI 1.11–1.83)","IRR",1.42,1.11,1.83],
  ["RD 0.04; 95% confidence interval [CI], 0.01 to 0.09","RD",.04,.01,.09],
  ["Hazard ratio (HR) of 0.83 (0.64, 1.07)","HR",.83,.64,1.07],
  ["Adjusted odds ratio, 1.24 [1.02, 1.61]","OR",1.24,1.02,1.61],
  ["Relative risk 0.72 (0.51 to 0.94); P < .001","RR",.72,.51,.94],
  ["🧪 Results: HR\u00a00.83,\u00a095% CI\u00a00.64—1.07","HR",.83,.64,1.07],
  ["HR\u00c2\u00a00.83; 95% CI 0.64-1.07","HR",.83,.64,1.07],
  ["HR\u00c3\u0082 0.83; 95% CI 0.64-1.07","HR",.83,.64,1.07],
  ["HR\u00c3\u0082\u00c2\u00a00.83; 95% CI 0.64-1.07","HR",.83,.64,1.07],
  ["HR\u00c3\u201a 0.83; 95% CI 0.64-1.07","HR",.83,.64,1.07],
  ["HR\u00c3\u201a\u00c2\u00a00.83; 95% CI 0.64-1.07","HR",.83,.64,1.07],
  ["Difference, -4.20 percentage points [95% CI, -6.40 to -2.00]","MD",-4.2,-6.4,-2],
  ["An HR of 0.83 with a 95% CI of (0.64–1.07)","HR",.83,.64,1.07],
  ["Hazard ratio with compound A was 0.83 (95% CI 0.64 to 1.07)","HR",.83,.64,1.07],
  ["Hazard ratio in the XQ72 group, 0.83; 95% CI 0.64-1.07","HR",.83,.64,1.07],
  ["Incidence rate ratio 1.42 [95% CI, 1.11, 1.83]","IRR",1.42,1.11,1.83],
  ["Standardised mean difference -0.44; 95% CI -0.71 to -0.17","SMD",-.44,-.71,-.17],
  ["Risk difference 0.04 [95% CI 0.01–0.09]","RD",.04,.01,.09],
  ["P=.02; OR 1.24 (95% CI 1.02 to 1.61); dose 50 mg","OR",1.24,1.02,1.61],
  ["In 2021, patients aged 55 years received 20 mg: RR .72 (95% CI .51-.94)","RR",.72,.51,.94],
  ["<table-wrap><table><tr><td>RR</td><td>0.72</td><td>95% CI 0.51–0.94</td></tr></table></table-wrap>","RR",.72,.51,.94],
  ["<p>OR <bold>1.24</bold> (95% CI <italic>1.02</italic> to 1.61)</p>","OR",1.24,1.02,1.61],
  ["RR 0.7200; 95% CI 0.5100-0.9400","RR",.72,.51,.94],
  ["HR 0.83,\t95% confidence interval\t0.64–1.07","HR",.83,.64,1.07],
  ["OR 1.24; CI 1.02; 1.61","OR",1.24,1.02,1.61],
  ["RR 0.72 (0.51–0.94)","RR",.72,.51,.94]
];
for(const [text,measure,e,l,h] of effects)test("effect extraction: "+text,()=>{
  const cs=A.extract(text,"generic").candidates;
  const c=cs.find(c=>c.measure===measure&&c.values.effect===e&&c.values.lo===l&&c.values.hi===h);
  assert.ok(c,JSON.stringify(cs));assert.equal(validSpans(text,c),true);
});
const counts=[
  ["7 of 84 versus 11 of 86",7,84,11,86],
  ["7/84 vs. 11/86.",7,84,11,86],
  ["7 of the 84 patients and 11 of the 86 controls",7,84,11,86],
  ["7 (8.3%) of 84 patients vs 11 (12.8%) of 86 controls",7,84,11,86],
  ["7 patients [8.3%] of 84 and 11 patients [12.8%] of 86",7,84,11,86],
  ["7/84 (8.3%) in the amber group versus 11/86 (12.8%) in the blue group",7,84,11,86],
  ["🧬 There were 0 of 84 versus 3 of 86 events.",0,84,3,86],
  ["At 18 months: 70 of 1,084 versus 110 of 1,086.",70,1084,110,1086],
  ["Group A (n=84), Group B (n=86). Rash: 7 (8.3%) vs 11 (12.8%).",7,84,11,86],
  ["Amber (N=84) ... Blue (N=86) ... Headache 7 (8) 11 (13)",7,84,11,86],
  ["Outcome\tAmber events\tAmber total\tBlue events\tBlue total\nRash\t7\t84\t11\t86",7,84,11,86],
  ["Outcome  Amber events  Amber total  Blue events  Blue total\nRash  7  84  11  86",7,84,11,86],
  ["<table-wrap><table><tr><th/><th>Amber (n=84)</th><th>Blue (n=86)</th></tr><tr><td>Rash</td><td>7 (8.3)</td><td>11 (12.8)</td></tr></table></table-wrap>",7,84,11,86],
  ["7\u00a0of\u00a084 versus 11\u2009of\u200986",7,84,11,86],
  ["7\u00c2\u00a0of 84 and 11 of 86",7,84,11,86],
  ["7/84 in the placebo group and 11/86 in the active group",7,84,11,86]
];
for(const [text,a,n,b,m] of counts)test("count extraction: "+text,()=>{
  const out=A.extract(text,"binary2x2");
  const c=out.candidates.find(c=>JSON.stringify(c.values.arms.map(x=>[x.events,x.n]))===JSON.stringify([[a,n],[b,m]]));
  assert.ok(c,JSON.stringify(out));assert.ok(validSpans(text,c));assert.ok(out.questions.some(q=>q.id==="arms"));
});
for(const text of [
  "P = 0.04; p < 0.001; 95% power.",
  "In 2017, 65-year-old patients received 40 mg for 28 days.",
  "Visits were 03/04/2022 and 04/05/2022.",
  "Dosage was 2/5 mg in the morning and 3/7 mg at night.",
  "7 patients (8.3%) and 11 patients (12.8%) reported rash.",
  "Age 42 (SD 8) and weight 75 kg.",
  "RR 0,72; 95% CI 0,51–0,94",
  "The interval ends here: HR 0.83 [95% CI 0.64",
  "There was 95% confidence that the study had sufficient power."
  ,"The mean age was 42 (95% CI 39 to 45)."
  ,"Dose was 10 or 20 (10-30) mg."
])test("do not infer results: "+text,()=>assert.equal(A.extract(text).candidates.length,0));
test("all effect measures and timepoints remain candidates",()=>{
  const text="At 4 weeks RR 0.72 [0.51, 0.94]; at 9 weeks OR 1.24 [1.02, 1.61].";
  const out=A.extract(text,"generic");assert.equal(out.candidates.length,2);assert.ok(out.questions.some(q=>q.id==="candidate"));
});
test("multiple count outcomes preserve printed order",()=>{
  const text="Rash: 7/84 vs 11/86; nausea: 4/84 vs 8/86.";
  const out=A.extract(text,"counts");assert.equal(out.candidates.length,2);assert.deepEqual(out.candidates[1].values.arms.map(a=>a.events),[4,8]);
});
test("four printed arms expose all six comparisons without assigning treatment",()=>{
  const out=A.extract("Amber 7/84, Blue 11/86, Cyan 4/80 and Red 8/81.","counts");
  assert.equal(out.candidates.length,6);assert.ok(out.candidates.some(c=>c.values.arms[0].events===7&&c.values.arms[1].events===8));
});
test("nearby labels never determine the treatment",()=>{
  const c=A.extract("7/84 in the placebo group and 11/86 in the amber group","counts").candidates[0];
  assert.deepEqual(c.values.arms.map(a=>a.label),["placebo","amber"]);assert.equal(c.values.arms[0].treatment,undefined);
});
test("rate ratio exposes both scale interpretations",()=>{
  const out=A.extract("Rate ratio 0.72; 95% CI 0.51-0.94","generic");
  assert.deepEqual(out.candidates.map(c=>c.measure),["RR","IRR"]);assert.ok(out.questions.length);
});
test("CI without a measure asks for its meaning",()=>{
  const out=A.extract("The estimate was 0.72; 95% CI 0.51 to 0.94","generic");
  assert.equal(out.candidates.length,1);assert.ok(out.questions.some(q=>q.id==="measure"));
});
for(const [text,kind,values] of [
  ["Mean 8.4 (SD 2.3)","mean_sd",{mean:8.4,sd:2.3}],
  ["Mean 8.4 ± 2.3","mean_sd",{mean:8.4,sd:2.3}],
  ["Median 9 (IQR 5–14)","median_iqr",{median:9,q1:5,q3:14}],
  ["Median 9, IQR 5 to 14","median_iqr",{median:9,q1:5,q3:14}]
])test("continuous summary: "+text,()=>{
  const out=A.extract(text,"continuous");assert.deepEqual(out.candidates[0].values,values);assert.equal(out.candidates[0].kind,kind);assert.ok(validSpans(text,out.candidates[0]));
  if(text.includes("±"))assert.ok(out.questions.some(q=>q.id.startsWith("dispersion")));
});
test("literal precheck does not match a substring or tag attribute",()=>{
  assert.deepEqual(literalNumbers('<tr id="57">157 and 4.20.</tr>').map(x=>x.value),[157,4.2]);
});
test("precheck reports missing denominators separately",()=>{
  const r=scoreRow({id:"synthetic",kind:"counts",text:"7 (8.3%) vs 11 (12.8%)",expected:{ai:7,n1i:84,ci:11,n2i:86}});
  assert.equal(r.status,"NOT_IN_TEXT");assert.deepEqual(r.missing,["n1i","n2i"]);
});
test("PLANTED DEFECT: off-by-one source span fails independent check",()=>{
  const text="RR 0.72 (95% CI 0.51-0.94)",out=A.extract(text,"generic"),c=structuredClone(out.candidates[0]);
  assert.ok(validSpans(text,c));c.spans.lo[0]++;assert.equal(validSpans(text,c),false);
  assert.equal(scoreRow({id:"span",kind:"effect_ci",text,expected:{effect:.72,lo:.51,hi:.94,scale:"RR"}},{candidates:[c]}).status,"WRONG_SPAN");
});
test("PLANTED DEFECT: wrong numeric estimate and scale get distinct failures",()=>{
  const text="RR 0.72 (95% CI 0.51-0.94)",c=A.extract(text,"generic").candidates[0];
  const row={id:"wrong",kind:"effect_ci",text,expected:{effect:.72,lo:.51,hi:.94,scale:"RR"}};
  assert.equal(scoreRow(row,{candidates:[{...c,values:{...c.values,effect:.73}}]}).status,"WRONG_VALUE");
  assert.equal(scoreRow(row,{candidates:[{...c,measure:"OR"}]}).status,"WRONG_MEASURE");
});
