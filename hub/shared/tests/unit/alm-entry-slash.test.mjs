// Printed slash counts ("a/b") in free text get the SAME context guards as worded counts (alm-entry-phrasings.test.mjs):
// a slash count followed by a non-participant unit ("2/3 trials", "4/12 studies") or preceded by a page/figure/table/
// grade/phase reference ("page 3/12", "Table 2/4", "grade 3/4") is not events of a total and is not offered. A slash count
// of participants is never suppressed: an impossible one ("186/125") is still offered flagged and blocking (FU8).
// Synthetic strings only; no dev or held-out text.
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {validSpans} from "../../../../validation/realpaper/run.mjs";
const require=createRequire(import.meta.url),A=require("../../../../shared/alm-entry.js");
const counts=out=>out.candidates.filter(c=>c.kind==="counts");
const arms=c=>c.values.arms.map(a=>a.events+"/"+a.n);
const view=out=>counts(out).map(c=>({arms:arms(c),flagged:c.flagged,sanity:c.sanity.map(s=>s.text)}));
const EXCEED=p=>`Found ${p} — events cannot exceed the total; check the paper`;

// --- False positives: none of these is events of a total ---
for(const text of [
  "2/3 trials",
  "2/3 trials were positive",
  "4/12 studies",
  "2/3 included trials reported mortality",
  "1/4 centres closed early",
  "3/10 sites",
  "5/20 RCTs",
  "see page 3/12",
  "p. 3/12",
  "Figure 2/5",
  "Fig. 2/5",
  "Table 2/4",
  "Supplementary Table 1/4",
  "a phase 2/3 trial",
  "grade 3/4 neutropenia",
  "stage 3/4 disease",
  "Item 4/10 of the questionnaire"
])test("slash, not a count: "+text,()=>{
  for(const schema of ["proportion","binary2x2"])assert.deepEqual(view(A.extract(text,schema)),[],schema+": no counts candidate");
});
test("slash: a reference and a non-participant count around real counts leave only the real pair",()=>{
  const text="Grade 3/4 neutropenia: 12/100 vs 15/98 (Table 2/4)",out=A.extract(text,"binary2x2");
  assert.deepEqual(view(out),[{arms:["12/100","15/98"],flagged:false,sanity:[]}]);
});
test("slash: '2/3 trials' does not pair with a real count",()=>{
  const out=A.extract("Mortality was reported by 2/3 trials: 12/100 vs 15/98","binary2x2");
  assert.deepEqual(view(out),[{arms:["12/100","15/98"],flagged:false,sanity:[]}]);
});

// --- Real slash counts: unchanged ---
test("slash, real count: '86/125 patients'",()=>{
  const text="86/125 patients",c=counts(A.extract(text,"proportion"));
  assert.deepEqual(c.map(arms),[["86/125"]]);assert.equal(c[0].flagged,false);assert.equal(validSpans(text,c[0]),true);
  assert.equal(c[0].rule,"R-COUNTS-DIRECT@1");
});
test("slash, real count: '86/125 (68.8%)'",()=>{
  const c=counts(A.extract("86/125 (68.8%)","proportion"));
  assert.deepEqual(c.map(arms),[["86/125"]]);assert.equal(c[0].values.arms[0].pct,68.8);assert.equal(c[0].flagged,false);
});
for(const [text,want] of [
  ["11/86 vs 7/84",["11/86","7/84"]],
  ["Rash: 11/86 (12.8%) vs 7/84 (8.3%)",["11/86","7/84"]],
  ["Intervention 86/125 randomised patients; control 78/133",["86/125","78/133"]],
  ["Death\t12/100\t15/98",["12/100","15/98"]],
  ["Outcome\tDrug\tPlacebo\nDeath\t12/100\t15/98\nStroke\t3/100\t4/98",["12/100","15/98"]],
  ["Response 86/125 participants vs 78/133 participants",["86/125","78/133"]],
  ["Of the 4 centres, events were 12/100 vs 15/98",["12/100","15/98"]]
])test("slash, real pair unchanged: "+JSON.stringify(text),()=>{
  const out=A.extract(text,"binary2x2"),c=counts(out).find(c=>JSON.stringify(arms(c))===JSON.stringify(want));
  assert.ok(c,"offered: "+JSON.stringify(view(out)));
  assert.equal(c.flagged,false);assert.equal(validSpans(text,c),true);
});
test("slash, table rows: every row's pair is offered",()=>{
  const out=A.extract("Outcome\tDrug\tPlacebo\nDeath\t12/100\t15/98\nStroke\t3/100\t4/98","binary2x2"),got=counts(out).map(c=>arms(c).join());
  assert.ok(got.includes("12/100,15/98")&&got.includes("3/100,4/98"),JSON.stringify(got));
});

// --- FU8: an impossible slash count of participants is still offered flagged (never suppressed by the guards) ---
for(const text of ["186/125","186/125 patients","186/125 (148.8%)"])test("slash, impossible count still offered flagged: "+text,()=>{
  assert.deepEqual(view(A.extract(text,"proportion")),[{arms:["186/125"],flagged:true,sanity:[EXCEED("186/125")]}]);
});
