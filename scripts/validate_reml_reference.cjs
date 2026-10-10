// Fresh metafor reference capture. Uses native R when available; --webr selects
// the repository's bundled R 4.5.1. WebR needs ws on NODE_PATH and a digest .tgz.
// See docs/reml-global-validation.md for reproducible commands and provenance.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const digestArg = args.find(x => x.startsWith('--digest='));
const outputArg = args.find(x => x.startsWith('--output='));
const source = path.join(root, 'tests/reml_reference.R');
const files = ['tests/fixtures/reml_nonconvergence.json', 'tests/fixtures/reml_global_modes.json'];
const real = JSON.parse(fs.readFileSync(path.join(root, files[0]))).reviews;
const modes = JSON.parse(fs.readFileSync(path.join(root, files[1]))).cases;
const cases = real.map(c => ({...c, id:c.review_id})).concat(modes);
const fields = ['tau2','mu','se','ciLo','ciHi','I2','knhaSe','knhaCiLo','knhaCiHi','logLik','boundaryLogLik'];
const rows = {};
const sha256 = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const quoteR = s => JSON.stringify(s.replaceAll('\\','/'));
function caseCode(c) {
  return `yi<-c(${c.yi});vi<-c(${c.vi});\n` +
    `ref<-reml_reference(yi,vi);` +
    `cat("REFERENCE|${c.id}|",paste(sprintf("%.17g",ref),collapse=","),"\\n",sep="");\n` +
    `cat("DEFAULT|${c.id}|",reml_iterative(yi,vi,list()),"\\n",sep="");\n` +
    `cat("DAMPED|${c.id}|",reml_iterative(yi,vi,list(stepadj=.5,threshold=1e-10,maxiter=1000)),"\\n",sep="");\n` +
    `cat("STRICT|${c.id}|",reml_iterative(yi,vi,list(stepadj=.5,threshold=1e-12,tol=1e-12,maxiter=1000)),"\\n",sep="");\n`;
}
function parse(text) {
  for(const line of text.split('\n')) {
    const [type,id,value] = line.split('|');
    if(!['REFERENCE','DEFAULT','DAMPED','STRICT'].includes(type))continue;
    const row=rows[id] ||= {};
    if(type==='REFERENCE') row.reference=Object.fromEntries(fields.map((name,i)=>[name,Number(value.split(',')[i])]));
    else row[type.toLowerCase()]=value.startsWith('ERROR') ? {error:value.slice(6)} : {tau2:Number(value.split(',')[0]),logLik:Number(value.split(',')[1])};
  }
}

(async () => {
  let rVersion, metaforVersion, runtime, runtimeFiles={};
  const native = !args.includes('--webr') && !spawnSync('Rscript',['--version']).error;
  if(native) {
    const code=`library(metafor);source(${quoteR(source)});`+
      'cat("VERSION|R|",R.version.string,"\\n",sep="");cat("VERSION|metafor|",as.character(packageVersion("metafor")),"\\n",sep="");'+
      cases.map(caseCode).join('\n');
    const result=spawnSync('Rscript',['--vanilla','-e',code],{encoding:'utf8',maxBuffer:4*1024*1024});
    if(result.status!==0)throw Error(result.stderr);
    parse(result.stdout);
    rVersion=result.stdout.split('\n').find(x=>x.startsWith('VERSION|R|')).split('|')[2];
    metaforVersion=result.stdout.split('\n').find(x=>x.startsWith('VERSION|metafor|')).split('|')[2];
    runtime='native R';
  } else {
    if(!digestArg)throw Error('WebR requires --digest=/absolute/path/digest_0.6.39.tgz (see validation document).');
    const base=path.join(root,'r-shiny/shinylive/webr');
    const {WebR}=require(path.join(base,'webr.cjs'));
    const r=new WebR({baseUrl:base+'/',interactive:false});
    await r.init();
    try {
      for(const name of ['lattice','Matrix','nlme','metadat','numDeriv','mathjaxr','pbapply','metafor']) {
        const dir=path.join(base,'packages',name), archive=fs.readdirSync(dir).find(x=>x.endsWith('.tgz'));
        const filename=path.join(dir,archive);runtimeFiles[path.relative(root,filename)]=sha256(filename);
        await r.FS.writeFile('/tmp/'+archive,fs.readFileSync(filename));
        await r.evalRVoid(`untar('/tmp/${archive}',exdir=.libPaths()[1],tar="internal")`);
      }
      const digest=path.resolve(digestArg.slice('--digest='.length));
      runtimeFiles['digest_0.6.39.tgz']=sha256(digest);
      await r.FS.writeFile('/tmp/digest.tgz',fs.readFileSync(digest));
      await r.evalRVoid('untar("/tmp/digest.tgz",exdir=.libPaths()[1],tar="internal");dir.create(R.home("lib"),recursive=TRUE,showWarnings=FALSE)');
      const libdir=await r.evalRString('R.home("lib")');
      for(const lib of ['libRblas.so','libRlapack.so'])await r.FS.writeFile(libdir+'/'+lib,fs.readFileSync(path.join(base,lib)));
      await r.FS.writeFile('/tmp/reml_reference.R',fs.readFileSync(source));
      await r.evalRVoid('library(metafor);source("/tmp/reml_reference.R")');
      rVersion=await r.evalRString('R.version.string');
      metaforVersion=await r.evalRString('as.character(packageVersion("metafor"))');
      const shelter=await new r.Shelter();
      for(const c of cases) {
        const capture=await shelter.captureR(caseCode(c));
        parse(capture.output.filter(x=>x.type==='stdout').map(x=>x.data).join('\n'));
        await shelter.purge();
        console.log(c.id,rows[c.id]);
      }
      runtimeFiles['R.wasm']=sha256(path.join(base,'R.wasm'));
      runtime='bundled WebR (WebAssembly), not native R';
    } finally {await r.close();}
  }
  if(cases.some(c=>!rows[c.id]?.reference || fields.some(f=>!Number.isFinite(rows[c.id].reference[f]))))throw Error('Incomplete reference capture');
  const record={captured_at:new Date().toISOString(),r_version:rVersion,metafor_version:metaforVersion,runtime,
    source_sha256:sha256(source),input_sha256:Object.fromEntries(files.map(f=>[f,sha256(path.join(root,f))])),runtime_sha256:runtimeFiles,cases:rows};
  const out=outputArg?path.resolve(outputArg.slice('--output='.length)):path.join(root,'tests/fixtures/reml_reference.json');
  fs.writeFileSync(out,JSON.stringify(record,null,2)+'\n');
  console.log('Saved '+out);
})().catch(e=>{console.error(e);process.exit(1);});
