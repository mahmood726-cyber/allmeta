// FU8 (STATUS.md): impossible counts in free text must be SHOWN as flagged candidates with a reason, never skipped and
// never offered unflagged, on EVERY counts path of AlmEntry.extract (printed a/b, events with percentages + "n =" totals
// elsewhere, and events/total tables). The a/b path was fixed in U3 (alm-entry-ux.test.mjs); these cover the other paths.
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),A=require("../../../../shared/alm-entry.js"),P=A.provenance;
const arms=c=>c.values.arms.map(a=>a.events+"/"+a.n);
const view=out=>out.candidates.filter(c=>c.kind==="counts").map(c=>({arms:arms(c),flagged:c.flagged,sanity:c.sanity.map(s=>s.text)}));
const EXCEED=p=>`Found ${p} — events cannot exceed the total; check the paper`;
const PCT_OK="Intervention (n = 125) and control (n = 133). Continued: 86 (68.8%) vs 78 (58.6%).";
const PCT_BAD=PCT_OK.replace("86 (68.8%)","186 (148.8%)");
const TABLE=(e,n)=>`Study\tEvents A\tTotal A\tEvents B\tTotal B\nPRI-SMA\t${e}\t${n}\t78\t133`;

test("FU8 percentages + totals: valid paste is unchanged (both assignments offered, unflagged)",()=>{
  assert.deepEqual(view(A.extract(PCT_OK,"proportion")),[
    {arms:["86/125","78/133"],flagged:false,sanity:[]},
    {arms:["86/133","78/125"],flagged:false,sanity:[]}]);
});
test("FU8 percentages + totals: 186 events with totals 125/133 is SHOWN flagged, not dropped",()=>{
  const out=A.extract(PCT_BAD,"proportion"),bad=out.candidates.filter(c=>c.kind==="counts"&&c.values.arms.some(a=>a.events===186));
  assert.ok(bad.length>0,"186 offered: "+JSON.stringify(view(out)));
  assert.ok(bad.every(c=>c.flagged===true));
  const inOrder=bad.find(c=>arms(c)[0]==="186/125");
  assert.ok(inOrder&&inOrder.sanity.some(s=>s.text===EXCEED("186/125")&&s.blocking===true&&s.code==="COUNTS_IMPOSSIBLE"),JSON.stringify(view(out)));
  assert.equal(out.candidates.at(-1).flagged,true);
  const r=P.fromCandidate(P.create({pastedText:PCT_BAD}),inOrder,{armIndex:0,role:"intervention"});
  assert.ok(r.flags.some(f=>f.blocking&&/cannot exceed the total/.test(f.text)),"flag carried into provenance as blocking");
});
test("FU8 percentages + totals: both arms impossible is SHOWN flagged",()=>{
  const out=A.extract(PCT_OK.replace("86 (68.8%) vs 78 (58.6%)","186 (148.8%) vs 178 (133.8%)"),"proportion");
  const c=out.candidates.filter(c=>c.kind==="counts");
  assert.ok(c.length>0,"offered");assert.ok(c.every(x=>x.flagged));
});
test("FU8 table: valid row is unflagged",()=>{
  assert.deepEqual(view(A.extract(TABLE(86,125),"proportion")),[{arms:["86/125","78/133"],flagged:false,sanity:[]}]);
});
test("FU8 table: 186 events of 125 is flagged with the reason (never offered as a clean candidate)",()=>{
  assert.deepEqual(view(A.extract(TABLE(186,125),"proportion")),[{arms:["186/125","78/133"],flagged:true,sanity:[EXCEED("186/125")]}]);
});
test("FU8 table: a zero total is flagged",()=>{
  assert.deepEqual(view(A.extract(TABLE(3,0),"proportion")),[{arms:["3/0","78/133"],flagged:true,sanity:["Found 3/0 — the total cannot be 0; check the paper"]}]);
});
