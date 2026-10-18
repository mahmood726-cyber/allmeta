'use strict';
// Constructed mathematical counterexamples, not clinical study data.
const fprConstant = [50, 60, 70, 80, 85, 90].map(tp => ({ tp, fn: 100 - tp, fp: 10, tn: 90 }));
const seConstant = [5, 10, 15, 20, 25, 30].map(fp => ({ tp: 80, fn: 20, fp, tn: 100 - fp }));
const sConstant = [50, 60, 70, 80, 85, 90].map(tp => ({ tp, fn: 100 - tp, fp: 100 - tp, tn: tp }));
const identical = Array.from({ length: 6 }, () => ({ tp: 80, fn: 20, fp: 10, tn: 90 }));
const ordinary = [[80,12,20,88],[75,15,25,85],[90,8,10,92],[70,18,30,82],[85,10,15,90],[78,14,22,86]]
  .map(([tp,fp,fn,tn]) => ({tp,fp,fn,tn}));
const zeroCell = [[50,5,10,80],[40,0,8,75],[60,8,12,90],[30,4,15,70]]
  .map(([tp,fp,fn,tn]) => ({tp,fp,fn,tn}));
function ordinaryCorpus() {
  let seed = 20261018;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const cases = [];
  for (const correctionControl of ['all','single','none']) {
    for (let i=0; i<1000; i++) {
      const rows = Array.from({length: 4 + next()%17}, () => ({tp: 1+next()%200, fp: 1+next()%90, fn: 1+next()%100, tn: 1+next()%250}));
      if (correctionControl !== 'none' && i%4 === 0) rows[0].fp = 0;
      cases.push({ rows, opts: { correctionControl } });
    }
  }
  return cases;
}
module.exports = { fprConstant, seConstant, sConstant, identical, ordinary, zeroCell, ordinaryCorpus };
