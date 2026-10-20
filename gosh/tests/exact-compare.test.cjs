const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../exact-enum.js'),C=require(process.env.GOSH_EXACT_COMPARE || '../validate/exact/compare.js');
const a=E.run([.1,.3,.4],[.12,.15,.21],'DL');
const r={...a,id:'fixture',grid_x0:a.grid.x0,grid_x1:a.grid.x1,grid_cells:a.grid.counts.flatMap((n,i)=>n?[[i,n]]:[])};
test('comparator checks shape and extra per-study coverage',()=>{
  assert.equal(C.compare(a,r).failures.length,0);
  for(const mutate of [x=>{x.grid.nx=0;x.grid.ny=0;},x=>x.grid.counts.push(0),x=>x.per_study.push({...x.per_study[0]}),x=>x.per_study[0].study=99,x=>x.exact=false]) {
    const bad=structuredClone(a);mutate(bad);assert.ok(C.compare(bad,r).failures.length>0);
  }
});
test('continuous maxima include grid bounds and quantities are counted',()=>{
  const bad=structuredClone(a);bad.grid.x0+=1e-6;
  const result=C.compare(bad,r);assert.ok(result.maxNormDiff>=.99e-6);
  assert.equal(Object.values(result.quantities).reduce((n,q)=>n+q.checks,0),result.checks);
});
