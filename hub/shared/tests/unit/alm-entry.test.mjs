import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url),A=require("../../../../shared/alm-entry.js");
const fixtures=JSON.parse(readFileSync(new URL("fixtures/entry-cells.json",import.meta.url),"utf8"));
const close=(a,b,tol=1e-12)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test("at least 150 independently specified parser fixtures",()=>assert.ok(fixtures.length>=150));
fixtures.forEach((f,i)=>test(`cell fixture ${i+1}: ${f.text}`,()=>assert.deepEqual(A.parseCell(f.text,f.ctx),f.expected)));
test("Excel TSV priority and header",()=>{
  const t=A.parseTable("Study\tEvents\tTotal\nA\t12\t150\nB\t3\t50");
  assert.equal(t.delimiter,"\t");assert.deepEqual(t.header,["Study","Events","Total"]);assert.equal(t.rows.length,2);
});
test("Covidence TSV handles quoted newlines and escaped quotes",()=>{
  const t=A.parseTable('Study\tEvents\tTotal\n"Smith ""trial""\n2020"\t12\t150');
  assert.equal(t.rows[0][0],'Smith "trial"\n2020');assert.equal(t.rows.length,1);
});
test("semicolon before comma and decimal ambiguity retained",()=>{
  const t=A.parseTable("Study;Mean;SD\nA;4,5;1,2");assert.equal(t.delimiter,";");assert.equal(t.rows[0][1],"4,5");
});
test("RFC CSV preserves embedded comma",()=>{
  const t=A.parseTable('Study, Events, Total\n"Smith, 2020", 12, 150');assert.equal(t.delimiter,",");assert.equal(t.rows[0][0],"Smith, 2020");
});
test("PDF multiple spaces",()=>{
  const t=A.parseTable("Study  Events  Total\nSmith  12  150");assert.equal(t.delimiter,"spaces");assert.deepEqual(t.rows[0],["Smith","12","150"]);
});
test("decimal-comma single column is never split silently",()=>{
  const t=A.parseTable("1,23\n2,34");assert.equal(t.delimiter,null);assert.ok(t.notes.some(s=>/ambiguous/.test(s)));assert.equal(t.rows[0][0],"1,23");
});
test("numeric CSV requests explicit separator interpretation",()=>{
  const t=A.parseTable("1,2\n3,4");const o=A.convert(t,null,"proportion");
  assert.ok(o.questions.some(q=>q.id==="table:delimiter"));assert.ok(o.flags.some(f=>f.blocking));
});
test("confirmed CSV preserves quoted commas and maps headers",()=>{
  const t=A.parseTable('Study,Events,Total\n"Smith, 2020",2,20');
  const o=A.convert(t,null,"proportion",{"table:delimiter":"columns"});
  assert.equal(o.records[0].study,"Smith, 2020");assert.equal(o.records[0].xi,2);assert.ok(!o.flags.some(f=>f.blocking));
});
test("tab-separated decimal comma does not become a CSV",()=>assert.equal(A.parseTable("A\t1,23\t2").delimiter,"\t"));
test("unclosed quotes are reported",()=>assert.ok(A.parseTable('"unterminated').notes.includes("Unclosed quoted field")));
test("ragged rows block",()=>assert.ok(A.convert(A.parseTable("Study\tEvents\tTotal\nA\t2"),{0:"study",1:"xi",2:"ni"},"proportion").flags.some(f=>f.code==="table-shape")));
test("blank lines ignored",()=>assert.deepEqual(A.parseTable("\n1\t2\n\n3\t4\n").rows,[["1","2"],["3","4"]]));
test("RevMan binary headers",()=>{
  const t=A.parseTable("Study or subgroup\tExperimental Events\tExperimental Total\tControl Events\tControl Total\tWeight\nA\t1\t10\t2\t20\t5%");
  assert.deepEqual(A.detect(t,"binary2x2").mapping,{0:"study",1:"ai",2:"n1i",3:"ci",4:"n2i",5:"ignore"});
});
test("Covidence group headers",()=>{
  const t=A.parseTable("Study ID\tIntervention Mean\tIntervention SD\tIntervention Total\tComparator Mean\tComparator SD\tComparator Total\nA\t1\t2\t10\t3\t4\t20");
  assert.deepEqual(A.detect(t,"continuous").mapping,{0:"study",1:"m1i",2:"sd1i",3:"n1i",4:"m2i",5:"sd2i",6:"n2i"});
});
test("generic CI headers",()=>{
  const t=A.parseTable("Study\tOR\tLL\tUL\tP value\nA\t2\t1\t4\t0.05");
  assert.deepEqual(A.detect(t,"generic").mapping,{0:"study",1:"yi",2:"lo",3:"hi",4:"p"});
});
test("RevMan risk ratio compound column",()=>{
  const t=A.parseTable("Study\tRisk Ratio M-H, Random, 95% CI\nA\t2 (1-4)");
  assert.equal(A.detect(t,"generic").mapping[1],"yi");
});
test("DTA header synonyms",()=>{
  const t=A.parseTable("Study\tTrue positives\tFalse positives\tFalse negatives\tTrue negatives\nA\t10\t2\t3\t20");
  assert.deepEqual(A.detect(t,"dta").mapping,{0:"study",1:"tp",2:"fp",3:"fn",4:"tn"});
});
test("correlation header synonyms",()=>assert.equal(A.detect(A.parseTable("Study\tPearson r\tN\nA\t.5\t20"),"correlation").mapping[1],"ri"));
test("unknown columns ask choices",()=>{
  const d=A.detect(A.parseTable("Study\tMystery\nA\t2"),"generic");
  assert.ok(d.questions.find(q=>q.id==="column:1").choices.includes("sei"));
});
test("content heuristic has low confidence and asks",()=>{
  const d=A.detect(A.parseTable("2\t20\n3\t30"),"proportion");
  assert.equal(d.mapping[0],"xi");assert.ok(d.confidence[0]<.85);assert.ok(d.questions.some(q=>q.id==="column:0"));
});
test("duplicate header meanings are not guessed",()=>{
  const d=A.detect(A.parseTable("Mean\tSD\tTotal\tMean\tSD\tTotal\n1\t2\t10\t2\t3\t20"),"continuous");
  assert.ok(d.questions.some(q=>q.id==="column:3"));
});
test("AS241 central quantile",()=>close(A.qnorm(.75),.6744897501960817,1e-15));
test("AS241 near tail",()=>close(A.qnorm(.975),1.959963984540054,1e-15));
test("AS241 far tail",()=>close(A.qnorm(1e-100),-21.273453560965322,1e-15));
test("normal boundaries",()=>{assert.equal(A.qnorm(0),-Infinity);assert.equal(A.qnorm(1),Infinity);assert.ok(Number.isNaN(A.qnorm(-1)));});
// R 4.6.0 qt reference values (not a rounded printed table).
for(const [df,p,value] of [[1,.975,12.706204736174694],[2,.975,4.302652729749464],[4,.975,2.7764451051977987],[9,.975,2.2621571627982049],[24,.975,2.0638985616280205],[58,.975,2.0017174841452356],[59,.995,2.6617587521629673]]){
  test(`qt df=${df} p=${p}`,()=>close(A.qt(p,df),value,1e-12));
}
test("SE from difference CI",()=>close(A.seFromCI({lo:-1.96,hi:1.96}).value,1.000018375572322));
test("SE from ratio CI",()=>close(A.seFromCI({lo:1,hi:4,ratio:true}).value,Math.log(4)/(2*A.qnorm(.975))));
test("ratio midpoint geometric",()=>assert.equal(A.estFromCI({lo:1,hi:9,ratio:true}).value,3));
test("difference midpoint warning",()=>assert.equal(A.estFromCI({lo:-2,hi:4}).flags[0].code,"ci-midpoint"));
test("SE from exact p",()=>close(A.seFromP({est:2,p:.05}).value,2/1.959963984540054));
test("SE from tiny p uses lower-tail quantile",()=>assert.ok(A.seFromP({est:2,p:1e-100}).value>0));
test("p inequality refused",()=>{const o=A.seFromP({est:2,p:"P < 0.001"});assert.equal(o.value,null);assert.ok(o.flags[0].blocking);});
test("p object inequality refused",()=>assert.equal(A.seFromP({est:2,p:{op:">",value:.05}}).value,null));
test("SD from SE",()=>assert.equal(A.sdFromSE({se:2,n:25}).value,10));
test("SD CI switches at 60",()=>{
  assert.match(A.sdFromCI({lo:1,hi:3,n:59}).method,/\(t/);assert.match(A.sdFromCI({lo:1,hi:3,n:60}).method,/normal/);
});
test("events rounding warning",()=>{const o=A.eventsFromPercent({pct:8.2,n:31});assert.equal(o.value,3);assert.equal(o.flags[0].code,"rounded-events");});
test("events exact no warning",()=>assert.deepEqual(A.eventsFromPercent({pct:8,n:150}).flags,[]));
test("events upward tie",()=>assert.equal(A.eventsFromPercent({pct:25,n:10}).value,3));
for(const [fn,args] of [["seFromCI",{lo:2,hi:1}],["seFromCI",{lo:-1,hi:2,ratio:true}],["seFromCI",{lo:1,hi:2,level:1}],["seFromP",{est:1,p:0}],["sdFromSE",{se:-1,n:2}],["sdFromCI",{lo:1,hi:2,n:1}],["eventsFromPercent",{pct:101,n:10}]]){
  test(`${fn} rejects invalid ${JSON.stringify(args)}`,()=>assert.ok(A[fn](args).flags.some(f=>f.blocking)));
}
test("five-number default citation range",()=>assert.equal(A.convertFivenum({min:1,median:5,max:9,n:25}).citation,"Luo 2018; Wan 2014"));
test("five-number default citation all five",()=>assert.equal(A.convertFivenum({min:1,q1:3,median:5,q3:7,max:9,n:25}).citation,"Luo 2018; Shi 2020"));
test("n under five excluded even Hozo",()=>assert.deepEqual(A.convertFivenum({min:1,median:5,max:9,n:3,method:"hozo2005"}).values,{mean:null,sd:null}));
test("unsupported scenario keeps missing output",()=>assert.deepEqual(A.convertFivenum({q1:1,median:2,q3:3,n:25,method:"bland2015"}).values,{mean:null,sd:null}));
test("partial summary matches no scenario",()=>assert.equal(A.convertFivenum({min:1,q1:2,median:3,max:5,n:25}).scenario,0));
test("symmetry test rejects skewed range",()=>assert.ok(A.convertFivenum({min:1,median:2,max:10,n:100}).flags.some(f=>f.code==="fivenum-skew")));
test("test false enables skewed estimate",()=>assert.ok(A.convertFivenum({min:1,median:2,max:10,n:100,test:false}).mean>2));
test("missing n still permits Wan mean",()=>assert.equal(A.convertFivenum({min:1,median:2,max:3,method:"wan2014"}).mean,2));
test("missing median still permits Wan range SD",()=>assert.ok(A.convertFivenum({min:1,max:3,n:10,method:"wan2014"}).sd>0));
test("invalid five-number ordering throws",()=>assert.throws(()=>A.convertFivenum({q1:4,median:2,q3:3,n:25}),/must hold/));
for(const method of ["qe","bc","mln","blue"])test(`${method} unavailable`,()=>assert.throws(()=>A.convertFivenum({min:1,median:2,max:3,n:25,method}),/method not available in allmeta/));
test("log-normal closed-form backtransform",()=>{const o=A.convertFivenum({min:1,median:Math.E,max:Math.exp(2),n:25,dist:"lnorm"});assert.ok(o.mean>Math.E);assert.ok(o.sd>0);});
test("log-normal nonpositive refused",()=>assert.throws(()=>A.convertFivenum({min:0,median:2,max:4,n:25,dist:"lnorm"}),/positive/));
test("Hozo mean cutoff 25",()=>{
  assert.equal(A.convertFivenum({min:1,median:4,max:9,n:25,method:"hozo2005",test:false}).mean,4.5);
  assert.equal(A.convertFivenum({min:1,median:4,max:9,n:26,method:"hozo2005",test:false}).mean,4);
});
test("Hozo SD cutoffs 15 and 70",()=>{
  const get=n=>A.convertFivenum({min:1,median:5,max:9,n,method:"hozo2005"}).sd;
  close(get(15),8/Math.sqrt(12));assert.equal(get(16),2);assert.equal(get(70),2);close(get(71),8/6);
});
test("Walter expected range reference n=5 (R default integrate)",()=>close(A.convertFivenum({min:1,median:2,max:3,n:5,method:"walter2007"}).sd,2/2.3259289471847371,1e-12));
const checks=[
  ["events-bounds",{xi:11,ni:10},{xi:10,ni:10}],
  ["events-bounds",{xi:-1,ni:10},{xi:0,ni:10}],
  ["sample-size",{ni:0},{ni:1}],
  ["ci-order",{lo:3,hi:2},{lo:2,hi:3}],
  ["estimate-outside",{est:3.06,lo:1,hi:3,roundingUnit:.1},{est:3.04,lo:1,hi:3,roundingUnit:.1}],
  ["negative-sd",{sd:-1},{sd:0}],
  ["quartile-order",{q1:3,q3:2},{q1:2,q3:3}],
  ["extreme-order",{min:3,q1:2},{min:1,q1:2}],
  ["extreme-order",{q3:4,max:3},{q3:2,max:3}],
  ["median-outside",{q1:2,median:1,q3:4},{q1:2,median:3,q3:4}],
  ["ratio-positive",{ratio:true,est:0},{ratio:true,est:1}],
  ["ci-asymmetric",{est:2,lo:1,hi:5},{est:3,lo:1,hi:5}],
  ["ci-asymmetric",{ratio:true,est:2,lo:1,hi:5},{ratio:true,est:2,lo:1,hi:4}],
  ["ratio-log-scale",{ratio:true,est:-1},{ratio:true,est:1}],
  ["p-ci-inconsistent",{est:2,lo:1,hi:3,p:.5},{est:0,lo:-1,hi:1,p:.99}],
  ["noninteger-count",{xi:1.2,ni:10},{xi:1,ni:10}],
  ["negative-count",{tp:-1},{tp:0}]
];
checks.forEach(([code,bad,good],i)=>{
  test(`sanity ${code} fires ${i}`,()=>assert.ok(A.sanity([bad],"generic").some(f=>f.code===code)));
  test(`sanity ${code} does not fire ${i}`,()=>assert.ok(!A.sanity([good],"generic").some(f=>f.code===code)));
});
test("duplicate study fires",()=>assert.ok(A.sanity([{study:"A"},{study:"A"}]).some(f=>f.code==="duplicate-study")));
test("distinct labels no duplicate",()=>assert.ok(!A.sanity([{study:"A"},{study:"B"}]).some(f=>f.code==="duplicate-study")));
test("whole column swap fires",()=>assert.ok(A.sanity([{xi:20,ni:2},{xi:30,ni:3}]).some(f=>f.code==="swapped-columns")));
test("one invalid row does not suggest whole column swap",()=>assert.ok(!A.sanity([{xi:20,ni:2},{xi:3,ni:30}]).some(f=>f.code==="swapped-columns")));
test("PLANTED DEFECT: blocking events gate depends on its rule",()=>{
  const input=[{study:"Bad",xi:-1,ni:10}],rule=A.sanityRules.events;
  assert.ok(A.sanity(input).some(f=>f.blocking));
  try{A.sanityRules.events=()=>[];assert.ok(!A.sanity(input).some(f=>f.blocking));}
  finally{A.sanityRules.events=rule;}
  assert.ok(A.sanity(input).some(f=>f.blocking));
});
test("decimal comma raises blocking question",()=>{
  const o=A.convert(A.parseTable("Study\tMean\tSD\tTotal\nA\t4,5\t1\t20"),{0:"study",1:"mean",2:"sd",3:"n"},"arm-nma");
  assert.ok(o.questions.some(q=>q.id==="decimal:0:1"));assert.ok(o.flags.some(f=>f.questionId==="decimal:0:1"));
});
test("decimal comma answer applied",()=>{
  const o=A.convert(A.parseTable("Study\tTreatment\tMean\tSD\tTotal\nA\tDrug\t4,5\t1\t20"),{0:"study",1:"treatment",2:"mean",3:"sd",4:"n"},"arm-nma",{"decimal:0:2":"comma"});
  assert.equal(o.records[0].mean,4.5);assert.ok(!o.flags.some(f=>f.blocking));
});
test("SD vs SE ambiguity and answer",()=>{
  const t=A.parseTable("Study\tTreatment\tSummary\tTotal\nA\tDrug\t4.5 (1.2)\t25"),m={0:"study",1:"treatment",2:"summary",3:"n"};
  const o=A.convert(t,m,"arm-nma");assert.ok(o.questions.some(q=>q.id==="dispersion:0:2"));
  const fixed=A.convert(t,m,"arm-nma",{"dispersion:0:2":"SE"});
  assert.equal(fixed.records[0].sd,6);assert.ok(fixed.steps.some(s=>/SD estimated from SE/.test(s.text)));assert.ok(!fixed.flags.some(f=>f.blocking));
});
test("ratio scale question and log answer",()=>{
  const t=A.parseTable("Study\tOR\tLower\tUpper\nA\t-0.5\t-1\t0"),m=A.detect(t,"generic");
  assert.ok(A.convert(t,m,"generic").questions.some(q=>q.id==="scale:0"));
  const o=A.convert(t,m,"generic",{"scale:0":"log"});
  assert.equal(o.records[0].yi,-.5);assert.ok(!o.flags.some(f=>f.blocking));
});
test("positive ratio on natural scale logs estimate",()=>{
  const t=A.parseTable("Study\tRR\tLower\tUpper\nA\t2\t1\t4");
  const o=A.convert(t,A.detect(t,"generic"),"generic",{"scale:0":"natural"});
  close(o.records[0].yi,Math.log(2));assert.ok(!o.flags.some(f=>f.blocking));
});
test("ratio below one is valid after logging internally",()=>{
  const t=A.parseTable("Study\tRR\tLower\tUpper\nA\t0.5\t0.25\t1");
  const o=A.convert(t,A.detect(t,"generic"),"generic",{"scale:0":"natural"});
  close(o.records[0].yi,Math.log(.5));assert.ok(!o.flags.some(f=>f.blocking));
});
test("ratio equal to one is valid after logging internally",()=>{
  const t=A.parseTable("Study\tRR\tLower\tUpper\nA\t1\t0.5\t2");
  const o=A.convert(t,A.detect(t,"generic"),"generic",{"scale:0":"natural"});
  assert.equal(o.records[0].yi,0);assert.ok(!o.flags.some(f=>f.blocking));
});
test("SD or SE inside parentheses is explicit",()=>{
  assert.equal(A.parseCell("4.5 (SD 1.2)").dispersion,"SD");
  assert.equal(A.parseCell("4.5 (1.2 SE)").dispersion,"SE");
});
test("low-confidence column answer applies",()=>{
  const t=A.parseTable("Study\tMystery\tTotal\nA\t2\t20"),d=A.detect(t,"proportion");
  assert.ok(A.convert(t,d,"proportion").questions.some(q=>q.id==="column:1"));
  const o=A.convert(t,d,"proportion",{"column:1":"xi"});assert.equal(o.records[0].xi,2);assert.ok(!o.flags.some(f=>f.blocking));
});
test("percentage table conversion",()=>{
  const t=A.parseTable("Study\tEvents\tTotal\nA\t8%\t150");
  const o=A.convert(t,A.detect(t,"proportion"),"proportion");assert.equal(o.records[0].xi,12);
});
test("fraction table conversion",()=>{
  const o=A.convert(A.parseTable("Study\tEvents\nA\t12/150"),{0:"study",1:"xi"},"proportion");
  assert.equal(o.records[0].ni,150);assert.ok(!o.flags.some(f=>f.blocking));
});
test("raw counts never invented from effect CI",()=>{
  const t=A.parseTable("Study\tRR\nA\t2 (1-4)");
  const o=A.convert(t,A.detect(t,"binary2x2"),"binary2x2");assert.ok(o.flags.some(f=>f.code==="missing-field"));assert.equal(o.records[0].ai,undefined);
});
test("CI-only derives effect and SE",()=>{
  const t=A.parseTable("Study\tLower\tUpper\nA\t1\t3"),o=A.convert(t,A.detect(t,"generic"),"generic");
  assert.equal(o.records[0].yi,2);assert.ok(o.records[0].sei>0);assert.equal(o.steps.length,2);
});
test("swap columns requires explicit answer and recomputes",()=>{
  const t=A.parseTable("Study\tEvents\tTotal\nA\t20\t2"),d=A.detect(t,"proportion");
  const o=A.convert(t,d,"proportion");assert.ok(o.questions.some(q=>q.id==="swap-columns:xi:ni"));
  const fixed=A.convert(t,d,"proportion",{"swap-columns:xi:ni":"swap"});assert.equal(fixed.records[0].xi,2);assert.ok(!fixed.flags.some(f=>f.blocking));
});
test("swap CI bounds recomputes SE",()=>{
  const t=A.parseTable("Study\tLower\tUpper\nA\t3\t1"),d=A.detect(t,"generic");
  // No header names the measure, so it is stated explicitly (REVIEW_179 P1).
  const o=A.convert(t,d,"generic",{"swap-ci:0":"swap","measure:type":"difference"});assert.equal(o.records[0].yi,2);assert.ok(o.records[0].sei>0);assert.ok(!o.flags.some(f=>f.blocking));
});
test("swap compound CI bounds recomputes SE",()=>{
  const t=A.parseTable("Study\tEstimate\nA\t2 (3-1)"),d=A.detect(t,"generic");
  const o=A.convert(t,d,"generic",{"swap-ci:0":"swap","measure:type":"difference"});assert.equal(o.records[0].yi,2);assert.ok(o.records[0].sei>0);assert.ok(!o.flags.some(f=>f.blocking));
});
test("mean SE header conversion continuous",()=>{
  const t=A.parseTable("Study\tExperimental Mean (SE)\tExperimental Total\tControl Mean (SD)\tControl Total\nA\t4.5 (1.2)\t25\t3 (2)\t30");
  const o=A.convert(t,A.detect(t,"continuous"),"continuous");assert.equal(o.records[0].sd1i,6);assert.equal(o.records[0].sd2i,2);assert.ok(!o.flags.some(f=>f.blocking));
});
test("phase 2 fallback stays null",()=>assert.equal(A.fallback,null));
test("all target schemas supplied",()=>assert.deepEqual(Object.keys(A.SCHEMAS).sort(),["generic","binary2x2","continuous","proportion","correlation","dta","arm-nma","contrast-nma","dose"].sort()));
test("each converter retains provenance and flags",()=>{
  const o=A.sdFromSE({se:2,n:25});assert.equal(o.method,"SD from SE");assert.match(o.citation,/Cochrane/);assert.deepEqual(o.inputs,{se:2,n:25});assert.ok(Array.isArray(o.flags));
});
