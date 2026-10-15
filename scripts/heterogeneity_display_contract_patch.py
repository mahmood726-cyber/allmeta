"""Temporary patch materialiser for the changed display contract; remove after CI."""
from pathlib import Path
import hashlib

def load(path,expected):
    p=Path(path);b=p.read_bytes()
    assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==expected,path
    return p,b.decode('utf-8')

p,s=load('heterogeneity/validate/adapter.js','2e3e92daaf8e02aa521be309b5396bea27f34762')
a='    chk("I2", C["I²"], [S.I2, res.qpci.I2Lo, res.qpci.I2Hi], [1, 1, 1]);'
b='''    // Preserve the historical Q-based point check, and keep checking both
    // model-based CI endpoints. The additional model point is now also visible.
    chk("I2_Q",C["I² (Q-based)"],[S.I2],[1]);
    chk("I2_model",C["I² (model-based)"],[S.I2Model,res.qpci.I2Lo,res.qpci.I2Hi],[1,1,1]);'''
assert s.count(a)==1;s=s.replace(a,b)
assert s.count('C["RE pooled (HKSJ + t)"]')==1
s=s.replace('C["RE pooled (HKSJ + t)"]','C["RE pooled (modified HK + t)"]')
assert s.count('C["95% PI"]')==1
s=s.replace('C["95% PI"]','C["95% PI (model SE + t)"]')
assert s.count('numbers: 19 + 6 * res.loo.length')==1
s=s.replace('numbers: 19 + 6 * res.loo.length','numbers: 20 + 6 * res.loo.length')
p.write_text(s,encoding='utf-8')
p,s=load('hub/shared/tests/validate-heterogeneity.spec.mjs','ccb1448b117f9886f3ba0414833d659fb8f91ab3')
assert s.count('120720')==2
s=s.replace('120720','121424')
s=s.replace('expect(result.displayFails.slice(0,3)).toEqual([])','expect(result.displayFails).toEqual([])')
s=s.replace("  expect(result.displayed).toBe(121424);", "  // Original 120720 rendered quantities plus one newly displayed model I2 in each of 704 configurations.\n  expect(result.displayed).toBe(121424);")
p.write_text(s,encoding='utf-8')
print('Display checks increased 120720 -> 121424; all 131781 original numerical comparisons, inputs, reference pins and tolerances retained.')
