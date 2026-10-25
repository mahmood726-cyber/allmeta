// Lossless, typed CSV transport. No findings or R reference values live here.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const suffixes=['metadata.csv','source.csv','projection.csv','excluded.csv','values.csv','display.csv','packages.txt','recipe.R'];
export function clearExampleEvidence(folder, app) {
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app))throw Error('Invalid evidence app');
  const path=folder instanceof URL?fileURLToPath(folder):folder;
  for(const suffix of suffixes)rmSync(join(path,app+'.'+suffix),{force:true});
}
export function csv(headers, rows) {
  const quote=x=>'"'+String(x).replaceAll('"','""')+'"';
  return [headers,...rows].map(row=>row.map(quote).join(',')).join('\n')+'\n';
}
function scalar(value) {
  if(value===null)return ['null',''];
  const type=typeof value;
  if(!['number','string','boolean'].includes(type))throw Error('Evidence must be scalar');
  if(type==='number'&&!Number.isFinite(value))throw Error('Evidence must be finite');
  return [type,String(value)];
}
export function records(rows) {
  return csv(['row','column','type','value'],rows.flatMap((r,i)=>Object.entries(r).map(([key,v])=>[i+1,key,...scalar(v)])));
}
const objects={'dta-sroc':'v[keys]',nma:'values',heterogeneity:'out','pubbias-tests':'out','multilevel-ma':'x',
  'meta-regression':'out','proportion-ma':'z','mh-peto':'lapply(v,function(x) if(x=="null") NA_real_ else as.numeric(x))',
  influence:'out','limit-ma':'out',gosh:'out','cumulative-subgroup':'out','rve-meta':'out','nma-inconsistency':'out',
  'correlation-ma':'out','component-nma':'out'};
export function plainRecipe(app, script) {
  if(!objects[app])throw Error('Unknown recipe app');
  const lines=script.trimEnd().split(/\r?\n/), last=lines.pop();
  if(!/^cat\(/.test(last)||!last.includes('ALMJSON:'))throw Error('Unrecognized live recipe serializer');
  let recipe=lines.join('\n')+'\n';
  if(app==='nma-inconsistency') {
    // Only this adapter installs a webR JSON serializer before its model.
    // Keep every analysis expression, beginning with the documented PM comment.
    const start=recipe.indexOf('# PM uses the archived uncentred metafor QE equation');
    if(start<0)throw Error('Unrecognized network serializer bootstrap');
    recipe=recipe.slice(start);
  }
  if(/jsonlite::|requireNamespace\(['"]jsonlite/.test(recipe))throw Error('Unexpected serializer dependency');
  recipe+='alm_result <- as.list('+objects[app]+')\n';
  if(app==='influence')recipe+="alm_result[['full.ciLo']] <- res$ci.lb\nalm_result[['full.ciHi']] <- res$ci.ub\nalm_result[['full.I2']] <- res$I2\n";
  if(app==='mh-peto')recipe+="alm_result[['mh_I2']] <- mh$I2\n";
  return recipe;
}
export function evidenceFiles(a,d) {
  for(const k of ['dataset','source_package','version','source_blob','citation','licence']) {
    if(typeof d[k]!=='string'||!d[k].trim())throw Error('Missing source '+k);
    if(k!=='licence'&&a[k]!==d[k])throw Error('Artifact identity mismatch: '+k);
  }
  const metadata=['app','dataset','source_package','version','source_blob','citation','licence'].map(k=>[k,k==='app'?a.app:d[k]]);
  return {
    'metadata.csv':csv(['key','value'],metadata),
    'source.csv':records(d.values),
    'projection.csv':records(a.projection.rows.map(r=>Object.fromEntries(Object.entries(r).filter(([,v])=>!Array.isArray(v))))),
    'excluded.csv':csv(['row'],a.projection.excluded.map(r=>[r])),
    'values.csv':csv(['key','type','value','kind','tolerance'],a.appValues.map(v=>[v.key,...scalar(v.value),a.compare.kind[v.key]||'abs',a.compare.tolerance[v.key]??a.compare.tolerance.default??0])),
    'display.csv':csv(['key','text','value','digits','scale'],a.display.map(d=>[d.key,d.text,d.value,d.digits,d.scale])),
    'packages.txt':a.packages.filter(p=>p!=='jsonlite').join('\n')+'\n',
    'recipe.R':plainRecipe(a.app,a.script)
  };
}
