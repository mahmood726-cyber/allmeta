import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function parser(app, scale) {
 const html=readFileSync(new URL('../../../../'+app+'/index.html',import.meta.url),'utf8');
 const start=html.indexOf('    function parse('), end=html.indexOf('\n    }',start)+6;
 const context={document:{getElementById:()=>({value:scale})},number:s=>s.trim()===''?NaN:Number(s),window:{AlmMultivariate:{covFromR:(a,b,r)=>r*Math.sqrt(a*b)}}};
 vm.createContext(context); vm.runInContext(html.slice(start,end)+';this.parse=parse;',context); return context.parse;
}
test('SE control is unchanged; variance plant must be square rooted',()=>{
 assert.equal(parser('limit-ma','se')('0.5,0.04,A')[0].se,0.04);
 assert.equal(parser('limit-ma','variance')('0.5,0.04,A')[0].se,0.2);
});
test('additive control unchanged; raw-ratio plant must be logged without changing variance',()=>{
 const p=parser('multivariate-ma','additive');
 assert.equal(p('A,2,0.04,3,0.09,0.01','cov',0,'additive').rows[0].y[0],2);
 const r=p('A,2,0.04,3,0.09,0.01','cov',0,'raw').rows[0];
 assert.equal(r.y[0],Math.log(2)); assert.equal(r.y[1],Math.log(3)); assert.equal(r.v[0],0.04); assert.equal(r.cov,0.01);
});
test('zero additive control remains valid; non-positive raw plant refuses with physical row',()=>{
 const p=parser('multivariate-ma','additive');
 assert.equal(p('A,0,0.04,-1,0.09,0.01','cov',0,'additive').rows.length,1);
 for(const value of [0,-1]) { const r=p('A,1,0.04,2,0.09,0.01\nBad,'+value+',0.04,2,0.09,0.01','cov',0,'raw'); assert.match(r.invalid,/line 2.*Bad/); }
});

// The validation accessor is a frozen numeric schema; provenance belongs to exports.
test('numeric accessor stays frozen while export retains provenance',()=>{
 const html=readFileSync(new URL('../../../../limit-ma/index.html',import.meta.url),'utf8');
 const context={window:{},_lastResults:{k:3,re_est:0.5},_lastProvenance:{uncertainty_scale:'variance',methods:'uncertainty entered as variance'}};
 vm.createContext(context);
 const start=html.indexOf('    window._almLastLimit ='),end=html.indexOf('    // Pure access',start);
 vm.runInContext(html.slice(start,end),context);
 assert.deepEqual(Object.keys(context.window._almLastLimit()),['k','re_est']);
 const exported=context.window._almExportLimit();
 assert.equal(exported.re_est,0.5);assert.equal(exported.uncertainty_scale,'variance');
 assert.match(exported.methods,/uncertainty entered as variance/);
 exported.re_est=99;assert.equal(context.window._almLastLimit().re_est,0.5);
 context._lastResults=null;assert.equal(context.window._almExportLimit(),null);
});
test('axis mutation hook accepts delivered source and rejects CRLF plant',()=>{
 const source=readFileSync(new URL('../../../../limit-ma/plus-ui.js',import.meta.url),'utf8');
 const hook='\n}\nfunction current(){';
 assert.ok(source.includes(hook));
 assert.ok(!source.replace(/\r?\n/g,'\r\n').includes(hook));
});

test('provenance assignment cannot add quantities to the primary contract',()=>{
 const html=readFileSync(new URL('../../../../limit-ma/index.html',import.meta.url),'utf8');
 const start=html.indexOf('      _lastProvenance = { uncertainty_scale:'),end=html.indexOf('      var diagnosticNotes',start);
 assert.ok(start>=0 && end>start);
 const block=html.slice(start,end);
 const keysAfter=source=>{
  const c={_lastResults:{k:3,re_est:0.5},_lastProvenance:null,document:{getElementById:()=>({value:'variance'})}};
  vm.createContext(c);vm.runInContext(source,c);return Object.keys(c._lastResults).sort();
 };
 assert.deepEqual(keysAfter(block),['k','re_est']);
 const plant=block.replace('_lastProvenance = { uncertainty_scale:', '_lastResults = Object.assign(_lastResults, { uncertainty_scale:').replace(".value };", ".value });").replaceAll('_lastProvenance','_lastResults');
 assert.notDeepEqual(keysAfter(plant),['k','re_est']);
});

// BFGS differentiates the UN model's Cholesky parameters. Its default 1e-3
// step is too coarse for this fixture even when reltol and maxit are tight.
test('R optimizer derivative step resolves the optimum; coarse-step plant does not',()=>{
 const r=readFileSync(new URL('../rchecks/p0plaus2.R',import.meta.url),'utf8');
 const configured=r.match(/ndeps=rep\(([^,]+),6\)/);
 const step=configured ? Number(configured[1]) : 1e-3;
 const context={};vm.createContext(context);
 vm.runInContext(readFileSync(new URL('../../../../shared/multivariate-ma.js',import.meta.url),'utf8'),context);
 const engine=context.AlmMultivariate;
 const studies=readFileSync(new URL('../fixtures/p0plaus2/raw.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1).map(line=>{
  const r=line.split(',');return {y:[Math.log(+r[1]),Math.log(+r[3])],S:[[+r[2],+r[5]],[+r[5],+r[4]]]};
 });
 const G=engine.fit(studies).G;
 const x=[Math.sqrt(G[0][0]),G[0][1]/Math.sqrt(G[0][0]),Math.sqrt(G[1][1]-G[0][1]**2/G[0][0])];
 const objective=p=>engine._obj2(studies,p[0]**2,p[0]*p[1],p[1]**2+p[2]**2);
 const residual=h=>Math.max(...x.map((_,i)=>{const a=x.slice(),b=x.slice();a[i]+=h;b[i]-=h;return Math.abs((objective(a)-objective(b))/(2*h));}));
 assert.ok(residual(1e-3)>1e-4,'coarse derivative plant is biased at the optimum');
 assert.ok(residual(step)<1e-6,'configured R derivative must resolve the optimum');
});
