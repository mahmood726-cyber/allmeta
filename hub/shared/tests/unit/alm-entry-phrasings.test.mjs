// Trial-report count phrasings in free text: "86 out of 125", "86 (n = 125)", alongside the already-recognised
// "86 of 125 patients" and "86/125 (68.8%)". New phrasings go through the SAME shared count check as every other counts
// path (FU8): an impossible count ("186 out of 125") is offered flagged and blocking, never dropped, never corrected.
// Words that make "a of b" something other than events of a total (trials, centres, page/figure/table references,
// ages, ranges, years, means) must not produce a counts candidate. Synthetic strings only; no dev or held-out text.
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {validSpans} from "../../../../validation/realpaper/run.mjs";
const require=createRequire(import.meta.url),A=require("../../../../shared/alm-entry.js"),P=A.provenance;
const counts=out=>out.candidates.filter(c=>c.kind==="counts");
const arms=c=>c.values.arms.map(a=>a.events+"/"+a.n);
const view=out=>counts(out).map(c=>({arms:arms(c),flagged:c.flagged,sanity:c.sanity.map(s=>s.text)}));
const EXCEED=p=>`Found ${p} — events cannot exceed the total; check the paper`;

// --- New phrasings are recognised (single arm for proportion, both arms for binary2x2) ---
for(const [text,want] of [
  ["86 out of 125","86/125"],
  ["86 out of 125 patients","86/125"],
  ["86 out of the 125 participants","86/125"],
  ["Remission: 86 out of 125.","86/125"],
  ["86 (n = 125)","86/125"],
  ["86 (N=125)","86/125"],
  ["Responders 86 (n = 1,125)","86/1125"]
])test("phrasing recognised (proportion): "+text,()=>{
  const out=A.extract(text,"proportion"),c=counts(out).find(c=>arms(c).join()===want);
  assert.ok(c,"offered: "+JSON.stringify(view(out)));
  assert.equal(c.flagged,false);assert.deepEqual(c.sanity,[]);
  assert.equal(validSpans(text,c),true,"literal source spans");
});
for(const [text,want] of [
  ["86 out of 125 versus 78 out of 133",["86/125","78/133"]],
  ["86 out of 125 patients in the intervention group and 78 out of 133 in the control group",["86/125","78/133"]],
  ["86 (n = 125) vs 78 (n = 133)",["86/125","78/133"]],
  ["Intervention 86 (n=125); control 78 (n=133)",["86/125","78/133"]],
  ["86 out of 125 vs 78/133",["86/125","78/133"]]
])test("phrasing recognised (binary2x2 pair): "+text,()=>{
  const out=A.extract(text,"binary2x2"),c=counts(out).find(c=>JSON.stringify(arms(c))===JSON.stringify(want));
  assert.ok(c,"offered: "+JSON.stringify(view(out)));
  assert.equal(c.flagged,false);assert.equal(validSpans(text,c),true);
  assert.ok(out.questions.some(q=>q.id==="arms"),"arm question still asked");
});
test("new phrasings carry their own versioned rule reference",()=>{
  assert.equal(counts(A.extract("86 out of 125","proportion"))[0].rule,"R-COUNTS-OUT-OF@1");
  assert.equal(counts(A.extract("86 (n = 125)","proportion"))[0].rule,"R-COUNTS-N-EQUALS@1");
});

// --- Already-recognised phrasings: exactly the same candidates as before ---
test("unchanged: '86 of 125 patients' and '86/125 (68.8%)'",()=>{
  assert.deepEqual(view(A.extract("86 of 125 patients","proportion")),[{arms:["86/125"],flagged:false,sanity:[]}]);
  const c=counts(A.extract("86/125 (68.8%)","proportion"));
  assert.equal(c.length,1);assert.deepEqual(arms(c[0]),["86/125"]);assert.equal(c[0].values.arms[0].pct,68.8);
  assert.equal(c[0].rule,"R-COUNTS-DIRECT@1");
});
test("a total already printed as 'a of b' is not re-read as a second '(n = b)' arm",()=>{
  assert.deepEqual(view(A.extract("86 of 125 (n = 125)","proportion")),[{arms:["86/125"],flagged:false,sanity:[]}]);
});
for(const [text,want] of [
  ["In the placebo group 11 of 86 patients had a rash",["11/86"]],
  ["At week 12, 7 of 84 patients responded",["7/84"]],
  ["7 of 84 in both groups",["7/84"]],
  ["Rash occurred in 7 of 84 participants",["7/84"]]
])test("guards do not touch a real count: "+text,()=>{
  assert.deepEqual(counts(A.extract(text,"proportion")).map(arms),[want]);
});

// --- Impossible counts on the new phrasings: offered flagged + blocking (same shared check), never dropped ---
test("'186 out of 125' is offered flagged with the shared reason",()=>{
  assert.deepEqual(view(A.extract("186 out of 125","proportion")),[{arms:["186/125"],flagged:true,sanity:[EXCEED("186/125")]}]);
});
test("'186 (n = 125)' is offered flagged with the shared reason",()=>{
  assert.deepEqual(view(A.extract("186 (n = 125)","proportion")),[{arms:["186/125"],flagged:true,sanity:[EXCEED("186/125")]}]);
});
test("'3 out of 0' is flagged: the total cannot be 0",()=>{
  assert.deepEqual(view(A.extract("3 out of 0","proportion")),[{arms:["3/0"],flagged:true,sanity:["Found 3/0 — the total cannot be 0; check the paper"]}]);
});
test("impossible arm in a pair: flagged, blocking, ranked last, carried into provenance",()=>{
  const text="186 out of 125 versus 78 out of 133",out=A.extract(text,"binary2x2"),c=counts(out);
  const bad=c.find(x=>arms(x).join()==="186/125,78/133");
  assert.ok(bad,JSON.stringify(view(out)));assert.equal(bad.flagged,true);
  assert.ok(bad.sanity.some(s=>s.code==="COUNTS_IMPOSSIBLE"&&s.blocking===true&&s.text===EXCEED("186/125")));
  assert.equal(out.candidates.at(-1).flagged,true);
  const r=P.fromCandidate(P.create({pastedText:text}),bad,{armIndex:0,role:"intervention"});
  assert.ok(r.flags.some(f=>f.blocking&&/cannot exceed the total/.test(f.text)),"blocking in provenance");
});

// --- False positives: none of these is events of a total ---
for(const text of [
  "2 of 3 trials",
  "2 out of 3 trials were positive",
  "2 of 3 included trials reported mortality",
  "1 of the 4 centres",
  "1 out of the 4 sites closed early",
  "see page 3 of 12",
  "p. 3 of 12",
  "Figure 2 of 5",
  "Fig. 2 out of 5",
  "Table 1 of 4",
  "Supplementary Table 1 of 4",
  "68.8% of patients",
  "68.8% (n = 125)",
  "aged 18 of 65",
  "patients aged 18 (n = 125)",
  "aged 18 to 65 (n = 125)",
  "range 18-65 (n = 125)",
  "Smith 2019 (n = 125)",
  "Jones et al. 2018 (n=84) and Lee 2020 (n=90)",
  "from 2016 out of 2020",
  "mean 54 (n = 125)",
  "median 12 (n = 40)"
])test("not a count: "+text,()=>{
  const out=A.extract(text,"proportion");
  assert.deepEqual(view(out),[],"no counts candidate");
});
