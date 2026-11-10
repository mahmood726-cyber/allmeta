// Independent grammar examples: expected tokens are authored, never obtained
// by calling the implementation under test.
import {writeFileSync} from "node:fs";
const fixtures=[];
const add=(text,expected,ctx={})=>fixtures.push({text,ctx,expected});
for(const [literal,value] of [["0",0],["12",12],["-0.50",-.5],["−0.50",-.5],["–0.50",-.5],["—0.50",-.5],["‐0.50",-.5],["1·23",1.23],["1⋅23",1.23],[".001",.001],["+4",4],["1e-9",1e-9],["2E6",2e6],["123456789",123456789]]){
  for(const surround of [""," ","\u00a0","\u2009"])add(surround+literal+surround,{kind:"number",value});
}
for(const v of [0,1,8.2,50,100]){
  add(`${v}%`,{kind:"percent",value:v});
  add(`${v} %`,{kind:"percent",value:v});
  add(`${v}\u202f%`,{kind:"percent",value:v});
}
for(const op of ["=","<",">","≤","≥"])for(const prefix of ["p","P ",""]){
  add(`${prefix}${op} 0.001`,{kind:"p",op,value:.001});
}
add("<.001",{kind:"p",op:"<",value:.001});
add("0.03",{kind:"p",op:"=",value:.03},{header:"p"});
for(const brackets of [["(",")"],["[","]"],["{","}"]])for(const space of [""," "]){
  add(`12 ${brackets[0]}${space}8.0%${space}${brackets[1]}`,{kind:"n_pct",num:12,pct:8});
  add(`12/150 ${brackets[0]}${space}8.0%${space}${brackets[1]}`,{kind:"n_pct",num:12,den:150,pct:8});
}
for(const [num,den] of [[12,150],[0,100],[5,10],[99,100]])for(const gap of [""," "])add(`${num}${gap}/${gap}${den}`,{kind:"fraction",num,den});
for(const brackets of [["(",")"],["[","]"],["{","}"]])for(const separator of ["-","–","—","−"," to ",", "]){
  add(`1.23 ${brackets[0]}0.98${separator}1.54${brackets[1]}`,{kind:"est_ci",est:1.23,lo:.98,hi:1.54});
  add(`-0.50 ${brackets[0]}-0.91${separator}-0.09${brackets[1]}`,{kind:"est_ci",est:-.5,lo:-.91,hi:-.09});
}
for(const level of [90,95,99]){
  add(`1.23; ${level}% CI 0.98 to 1.54`,{kind:"est_ci",est:1.23,lo:.98,hi:1.54,level:level/100});
  add(`${level}% CI -2 to -1`,{kind:"ci",lo:-2,hi:-1,level:level/100});
}
for(const text of ["4.5 (1.2)","4.5 [1.2]","4.5 {1.2}","4.5 ± 1.2","4.5 +/- 1.2","mean 4.5 (1.2)"]){
  add(text,{kind:"mean_sd",mean:4.5,spread:1.2,dispersion:null,ambiguousDispersion:true});
  add(text,{kind:"mean_sd",mean:4.5,spread:1.2,dispersion:"SD",ambiguousDispersion:false},{header:"Mean (SD)"});
  add(text,{kind:"mean_sd",mean:4.5,spread:1.2,dispersion:"SE",ambiguousDispersion:false},{header:"Mean (SE)"});
}
add("4.5 (1.2) SD",{kind:"mean_sd",mean:4.5,spread:1.2,dispersion:"SD",ambiguousDispersion:false});
add("4.5 ± 1.2 SE",{kind:"mean_sd",mean:4.5,spread:1.2,dispersion:"SE",ambiguousDispersion:false});
for(const sep of ["-","–","—"," to "]){
  add(`median 4 (IQR 2${sep}7)`,{kind:"median_iqr",median:4,q1:2,q3:7});
  add(`4 [2${sep}7]`,{kind:"median_iqr",median:4,q1:2,q3:7},{header:"median (IQR)"});
  add(`4 (1${sep}12)`,{kind:"median_range",median:4,min:1,max:12},{header:"median (range)"});
  add(`median 4, range 1${sep}12`,{kind:"median_range",median:4,min:1,max:12});
}
for(const text of ["1,23","-0,50","4,5 (1,2)","1.23 [0.98,1.54]","12,150"]){
  add(text,{kind:"unknown",raw:text,ambiguousDecimal:true});
}
add("1,23",{kind:"number",value:1.23},{decimal:"comma"});
add("4,5 (1,2)",{kind:"mean_sd",mean:4.5,spread:1.2,dispersion:"SD",ambiguousDispersion:false},{decimal:"comma",header:"SD"});
add("1.23 [0.98,1.54]",{kind:"est_ci",est:1.23,lo:.98,hi:1.54},{decimal:"separator"});
for(const text of ["","NA","N/A","NR","not reported","-"])add(text,{kind:"unknown",raw:text,missing:true});
for(const text of ["unreported value","study alpha","not a number","12 apples"])add(text,{kind:"unknown",raw:text});
// Fixtures with context from Excel/RevMan/Covidence and PDF table headers.
for(const header of ["Experimental Total","Control Total","Total","Sample size","Number of participants","Covidence N","n"]){
  add("150",{kind:"number",value:150},{header});
}
writeFileSync(new URL("entry-cells.json",import.meta.url),JSON.stringify(fixtures,null,2)+"\n");
console.log(`Wrote ${fixtures.length} independently specified cell fixtures.`);
