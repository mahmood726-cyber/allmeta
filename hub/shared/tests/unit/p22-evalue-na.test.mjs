import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import E from '../../../../shared/evalue.js';
import P from '../../../../shared/integrity-panel-v1.js';
const root = new URL('../../../../',import.meta.url);
const reference=JSON.parse(readFileSync(new URL('effect-size-converter/tests/fixtures/p20-p22-evalue-na-reference.json',root)));
const html=readFileSync(new URL('evalue/index.html',root),'utf8');
const source=html.slice(html.indexOf('    function num('),html.indexOf('  </script>',html.indexOf('    function num(')));
function ui(c) {
  const nodes={};
  for(const id of ['measure','point','lo','hi','rare','tbody','interp','plot','btn-run']) nodes[id]={value:String(c[id]??''),checked:c.rare,validity:{badInput:false},innerHTML:'',textContent:'',addEventListener(){},replaceChildren(){this.innerHTML='';}};
  const window={AlmEValue:E};
  vm.runInNewContext(source,{window,document:{getElementById:id=>nodes[id]}});
  return {result:window.__almLastEValue(),text:nodes.tbody.innerHTML};
}
for(const c of reference.cases.filter(c=>!['D','MD'].includes(c.measure)&&!c.id.endsWith('only'))) {
  test('P22 rendered/exported R NA: '+c.id,()=>{
    const r=ui(c);
    for(const key of ['point','ci','lower','upper']) {
      if(c.expected[key]===null) assert.equal(r.result[key],null);
      else assert.ok(Math.abs(r.result[key]-c.expected[key])<1e-12,key);
    }
    assert.match(r.text,/not applicable.*(?:missing|farther)/i);
  });
}
test('grade-sof integrity preserves point and explains missing CI',()=>{
  const r=P.eValueCheck({measure:'RR',pointEstimate:2});
  assert.equal(r.status,'ok');
  assert.match(r.verdict,/3.41/);
  assert.match(r.verdict,/not applicable.*missing/);
  assert.doesNotMatch(r.detail,/includes the null/);
});
