import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const {readNumber,checkDisplay,specifications}=createRequire(import.meta.url)('../../../../shared/alm-examples.js');
test('display extraction retains negative CI endpoints and scientific notation',()=>{
  assert.equal(readNumber('−0.123 [−0.456, 2.3e-4]',1),-.456);
  assert.equal(readNumber('−0.123 [−0.456, 2.3e-4]',2),.00023);
  assert.equal(readNumber('0.5% – 1.2%',1),1.2);
  assert.throws(()=>readNumber('not estimable',0),/numeric/);
  assert.throws(()=>readNumber('[.1,.2]',2),/numeric/);
});
test('a correct pooled display cannot conceal a planted confidence-limit defect',()=>{
  const vals=[{key:'mu',value:.12},{key:'lo',value:.01},{key:'hi',value:.23}];
  const display=vals.map(v=>({...v,text:String(v.value),scale:1,digits:3}));
  assert.doesNotThrow(()=>checkDisplay(display,vals));
  display[1].value=.02;assert.throws(()=>checkDisplay(display,vals),/lo/);
});
test('primary pooled panels capture CI and heterogeneity where reported',()=>{
  for(const [app,required] of Object.entries({
    heterogeneity:['mu','ci_lb','ci_ub','tau2','I2'],
    'proportion-ma':['poolP','poolLo','poolHi','tau2','i2'],
    'correlation-ma':['r','r_lo','r_hi','tau2_z','I2'],
    'rve-meta':['coef.0.estimate','coef.0.ci_lo','coef.0.ci_hi','tau2'],
    'multilevel-ma':['mu','ciLo','ciHi','sigma2Between','sigma2Within','mom.mu','mom.ci_lb_z','mom.ci_ub_z','mom.tau2_study','mom.tau2_within','mom.I2_study','mom.I2_within','mom.I2_sampling'],
    'cumulative-subgroup':['export.mu_final','export.lo_final','export.hi_final','export.tau2_final']
  })) for(const key of required) assert.ok(specifications[app].display.some(x=>x.key===key),app+' '+key);
});
