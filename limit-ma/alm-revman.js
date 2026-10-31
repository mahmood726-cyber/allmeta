(function(global){
  'use strict';
  const A=global.AlmRevman||(typeof require==='function'?require('../shared/alm-revman.js'):null);
  const api=A.genericAdapter({header:true,leading:true,defaultLabel:'Study '});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global.AlmFeatures&&typeof document!=='undefined')A.install('limit-ma',api);
})(typeof window!=='undefined'?window:globalThis);
