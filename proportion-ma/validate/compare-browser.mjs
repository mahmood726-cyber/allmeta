import assert from 'node:assert/strict';
import '../plus-core.js';
import '../plus-parity.js';

const reasons = {
  hessian_sensitivity: 'Finite-difference Hessian sensitivity amplifies cross-build bobyqa endpoint and objective round-off differences; interval bounds inherit the SE difference.',
  optimiser_status: 'Runtime-dependent bobyqa code-3 termination triggers the unchanged warning-to-refusal rule in only one runtime.'
};
export const documented = globalThis.AlmPropPlusParity.records.flatMap(r => r.fields.map(field => ({id:r.id,field,reason:reasons[r.issue]})));
const identity = r => JSON.stringify([r.id,r.field]);

export function compareBrowser(observed, corpus, refs) {
  assert.equal(corpus.length,240);
  assert.deepEqual(observed.map(r=>r.id).sort(),corpus.map(r=>r.id).sort(),'All configurations must run exactly once');
  let checks=0,passed=0,refusals=0;
  const failed=[];
  function check(id,field,actual,reference) {
    checks++;
    if(globalThis.AlmPropPlusCore.close(actual,reference,field))passed++;
    else {
      const exception=documented.find(d=>identity(d)===identity({id,field}));
      failed.push({id,field,actual,reference,knownException:!!exception,reason:exception?.reason || 'Undocumented difference'});
    }
  }
  for(const {id,result:r} of observed) {
    globalThis.AlmPropPlusCore.validateResult(r);
    const ref=refs[id].metafor;
    if(r.status==='refused')refusals++;
    check(id,'status',r.status,ref.status);
    if(r.status!==ref.status)continue;
    if(r.status==='refused')check(id,'reason',r.reason,ref.reason);
    else for(const field of Object.keys(ref.values))check(id,field,r.values[field],ref.values[field]);
  }
  return {configurations:observed.length,checks,passed,refusals,failed,unexpected:failed.filter(f=>!f.knownException).length};
}

export function assertDocumentedContract(report) {
  assert.equal(report.configurations,240);
  assert.equal(report.unexpected,0,'Unexpected numerical failures');
  assert.deepEqual(report.failed.map(identity).sort(),documented.map(identity).sort(),'Exact documented failing IDs and fields');
  assert.ok(report.failed.every(f=>f.knownException && f.reason===documented.find(d=>identity(d)===identity(f))?.reason),'Every failure retains its diagnosed reason');
  assert.equal(report.checks,2166);
  assert.equal(report.passed,2139);
  assert.equal(report.failed.length,27);
  assert.equal(new Set(report.failed.map(f=>f.id)).size,23);
  assert.equal(report.refusals,28);
}
