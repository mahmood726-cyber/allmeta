// Capture registered page callbacks; use actual shared input-receipt and bus handlers.
function installExports(w) {
 const registrations={};
 const wrap=(name,fn)=>function(opts){registrations[name]=opts;return fn(opts);};
 const target=w.alm||{};
 for(const name of ['plotExport','resultsExport'])if(target[name])target[name]=wrap(name,target[name]);
 const proxy=new Proxy(target,{set(o,k,v){o[k]=['plotExport','resultsExport'].includes(k)?wrap(k,v):v;return true;}});
 Object.defineProperty(w,'alm',{configurable:true,get:()=>proxy,set:v=>{if(v!==proxy)Object.assign(proxy,v);}});
 w.__readExports=function(){
  const safe=fn=>{try{return fn();}catch(e){return {callback_error:String(e)};}};
  const result=safe(()=>registrations.resultsExport.getResults());
  const receipt=safe(()=>registrations.plotExport.getReceiptInput());
  const chart=safe(()=>registrations.plotExport.plots[0].getSvg());
  // Software is a required export extension, checked independently of the
  // unchanged numerical oracle. Project only this validated field; keep every
  // other key/value so the oracle still rejects missing or unexpected data.
  const numericalResult=(payload,location)=>{
   if(payload===null)return null;
   const build=w.AlmBuildInfo||{},software=payload?.software;
   if(!software||typeof software!=='object'||Array.isArray(software)||
      Object.keys(software).sort().join(',')!=='sha,version'||
      software.version!==(build.version||'unknown')||software.sha!==(build.sha||'unknown')){
    throw new Error(location+'.software must contain exactly the loaded version and SHA (or explicit unknown fields)');
   }
   const {software:validated,...numerical}=payload;
   return numerical;
  };
  const results=numericalResult(result,'results');
  const numericalReceipt=receipt===null?null:{...receipt,results:numericalResult(receipt?.results,'receipt.results')};
  let signed=[];
  const original=w.MaStudies.toTruthCert;
  w.TruthCertUI.setKey('test-only-not-a-real-signing-key');
  w.MaStudies.toTruthCert=(studies)=>{signed=studies;return Promise.resolve({ok:false,error:'test boundary capture; signing not performed'});};
  w.document.querySelector('#btn-truthcert').click();
  w.MaStudies.toTruthCert=original;
  w.TruthCertUI.setKey('');
  w.MaStudies.clear();
  w.document.querySelector('#btn-bus-save').click();
  return JSON.parse(JSON.stringify({results,receipt:numericalReceipt,chart:chart?.innerHTML??null,input_receipt:signed,bus:w.MaStudies.read()}));
 };
}
if(typeof module!=='undefined')module.exports=installExports;
