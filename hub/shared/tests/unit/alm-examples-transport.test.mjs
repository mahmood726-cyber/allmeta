import test from 'node:test';
import assert from 'node:assert/strict';
import { csv, records, plainRecipe, evidenceFiles } from '../../../../validation/examples/plain-evidence.mjs';

test('CSV preserves quoted labels, empty strings, nulls and full precision',()=>{
  const result=records([{label:'A, "B"',empty:'',missing:null,x:0.12345678901234568}]);
  assert.match(result,/"A, ""B"""/);
  assert.match(result,/"empty","string",""/);
  assert.match(result,/"missing","null",""/);
  assert.match(result,/0\.12345678901234568/);
  assert.equal(csv(['a'],[['x\ny']]),'"a"\n"x\ny"\n');
});
test('planted nonfinite or nested evidence is refused',()=>{
  assert.throws(()=>records([{x:NaN}]),/finite/);
  assert.throws(()=>records([{x:{}}]),/scalar/);
});
test('plain R handoff preserves analysis and removes only the final serializer',()=>{
  const model='f <- metafor::rma(yi, vi, method="PM")\nout <- list(mu=coef(f))\n';
  const r=plainRecipe('meta-regression',model+"cat('ALMJSON:',jsonlite::toJSON(out),'\\n')\n");
  assert.ok(r.startsWith(model));
  assert.doesNotMatch(r,/jsonlite|ALMJSON/);
  assert.match(r,/alm_result <- as.list\(out\)/);
  assert.throws(()=>plainRecipe('meta-regression',model),/serializer/);
});
test('network JSON bootstrap is removed without changing the fitted model',()=>{
  const s="# intro\nif (grepl('emscripten', R.version$os) && !requireNamespace('jsonlite', quietly=TRUE)) {\n webr::mount('x','y')\n}\nstopifnot(requireNamespace('jsonlite', quietly=TRUE))\ncat('SERIALIZER jsonlite', 'version')\n# PM uses the archived uncentred metafor QE equation, not centred rma(PM).\nA <- c('a'); B <- c('b')\nout <- list(tau2=0)\ncat('ALMJSON:',jsonlite::toJSON(out),'\\n')\n";
  const r=plainRecipe('nma-inconsistency',s);
  assert.doesNotMatch(r,/jsonlite|webr|SERIALIZER/);
  assert.match(r,/A <- c\('a'\); B <- c\('b'\)/);
});
test('plain evidence includes original source cells, comparison rules and page values',()=>{
  const d={dataset:'test',source_package:'metadat',version:'1',source_blob:'abc',citation:'Published source',licence:'Facts',values:[{n:23,s:'NA',x:null}]};
  const a={app:'meta-regression',...d,projection:{rows:[{row:1,yi:.1}],excluded:[]},packages:['metafor','jsonlite'],script:"out <- list(slope=.25)\ncat('ALMJSON:',jsonlite::toJSON(out))",compare:{kind:{slope:'rel'},tolerance:{default:1e-6}},appValues:[{key:'slope',value:.25}],display:[{key:'slope',value:.25,text:'0.2500',scale:1,digits:4}]};
  const files=evidenceFiles(a,d);
  assert.match(files['source.csv'],/"n","number","23"/);
  assert.match(files['values.csv'],/"slope","number","0.25","rel","0.000001"/);
  assert.equal(files['packages.txt'],'metafor\n');
  assert.throws(()=>evidenceFiles(a,{...d,citation:''}),/citation/);
  assert.throws(()=>evidenceFiles({...a,dataset:'wrong'},d),/identity/);
});
